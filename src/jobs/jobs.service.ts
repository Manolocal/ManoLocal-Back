import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  TransactionClient,
  TransactionManager,
} from '../common/database/transaction.manager';
import { WalletService } from '../wallet/wallet.service';
import { ChatService } from '../chat/chat.service';
import { CreateJobDto } from './dto/create-job.dto';
import { CancelJobDto } from './dto/cancel-job.dto';
import { GetJobsQueryDto } from './dto/get-jobs-query.dto';
import {
  JobActionType,
  JobSocketEventType,
  JobStateChangedEvent,
} from '../common/events/job-state-changed.event';

export const DEFAULT_JOB_CONFIRMATION_FEE = 50;

const JOB_WITH_ROOM_INCLUDE = {
  room: {
    select: {
      id: true,
      employerId: true,
      specialistId: true,
    },
  },
} as const;

type JobAgreementRecord = {
  id: string;
  roomId: string;
  title: string | null;
  description: string | null;
  agreedPrice: Prisma.Decimal | number | string | null;
  feeAmount: Prisma.Decimal | number | string;
  status: JobStatus;
  createdById: string | null;
  cancelledById: string | null;
  cancellationReason: string | null;
  confirmedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  room?: {
    id: string;
    employerId: string;
    specialistId: string;
  };
};

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionManager: TransactionManager,
    private readonly walletService: WalletService,
    private readonly chatService: ChatService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Crea un nuevo acuerdo de trabajo en estado PENDING vinculado a una sala de chat.
   */
  async createJob(userId: string, dto: CreateJobDto) {
    const room = await this.chatService.validateRoomAccess(userId, dto.roomId);

    const activeJob = await this.prisma.jobAgreement.findFirst({
      where: {
        roomId: room.id,
        status: {
          in: [JobStatus.PENDING, JobStatus.CONFIRMED],
        },
      },
    });

    if (activeJob) {
      throw new ConflictException(
        'Ya existe un acuerdo de trabajo activo en esta sala de chat',
      );
    }

    const feeAmount = this.getConfirmationFee();
    const job = await this.prisma.jobAgreement.create({
      data: {
        roomId: room.id,
        title: dto.title?.trim() || null,
        description: dto.description?.trim() || null,
        agreedPrice:
          dto.agreedPrice !== undefined
            ? new Prisma.Decimal(dto.agreedPrice)
            : null,
        feeAmount: new Prisma.Decimal(feeAmount),
        status: JobStatus.PENDING,
        createdById: userId,
      },
      include: JOB_WITH_ROOM_INCLUDE,
    });

    const formattedJob = this.formatJob(job);
    this.emitJobEvent('job_created', 'CREATED', room.id, userId, formattedJob);

    this.logger.log(
      `Acuerdo de trabajo ${job.id} creado en sala ${room.id} por usuario ${userId}`,
    );

    return {
      message: 'Acuerdo de trabajo creado exitosamente',
      job: formattedJob,
    };
  }

  /**
   * Consulta los acuerdos de trabajo de una sala de chat (activo e historial).
   */
  async getJobsByRoom(userId: string, roomId: string) {
    await this.chatService.validateRoomAccess(userId, roomId);

    const jobs = await this.prisma.jobAgreement.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      include: JOB_WITH_ROOM_INCLUDE,
    });

    const formattedJobs = jobs.map((job) => this.formatJob(job));
    const activeJob =
      formattedJobs.find(
        (job) =>
          job.status === JobStatus.PENDING ||
          job.status === JobStatus.CONFIRMED,
      ) ?? null;

    return {
      roomId,
      activeJob,
      jobs: formattedJobs,
    };
  }

  /**
   * Lista los acuerdos de trabajo en los que participa el usuario autenticado.
   */
  async getMyJobs(userId: string, query: GetJobsQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const whereClause: Prisma.JobAgreementWhereInput = {
      room: {
        OR: [{ employerId: userId }, { specialistId: userId }],
      },
      ...(query.status && { status: query.status }),
    };

    const [total, jobs] = await Promise.all([
      this.prisma.jobAgreement.count({ where: whereClause }),
      this.prisma.jobAgreement.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: JOB_WITH_ROOM_INCLUDE,
      }),
    ]);

    return {
      data: jobs.map((job) => this.formatJob(job)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtiene el detalle de un acuerdo de trabajo verificando pertenencia a la sala.
   */
  async getJobById(userId: string, jobId: string) {
    const { job } = await this.loadAndAuthorizeJob(jobId, userId);
    return this.formatJob(job);
  }

  /**
   * Confirma un acuerdo de trabajo (PENDING -> CONFIRMED).
   * Solo el Especialista puede confirmar. Congela $50 MXN en una transacción ACID.
   */
  async confirmJob(userId: string, jobId: string) {
    const { job, isSpecialist } = await this.loadAndAuthorizeJob(jobId, userId);

    if (!isSpecialist) {
      throw new ForbiddenException(
        'Solo el especialista asignado puede confirmar el trabajo',
      );
    }

    if (job.status !== JobStatus.PENDING) {
      throw new ConflictException(
        `No se puede confirmar un trabajo en estado ${job.status}`,
      );
    }

    const feeAmount = Number(job.feeAmount);

    const result = await this.transactionManager.runInTransaction(
      async (tx) => {
        await this.transitionJobAtomically(tx, jobId, JobStatus.PENDING, {
          status: JobStatus.CONFIRMED,
          confirmedAt: new Date(),
        });

        const walletResult = await this.walletService.freezeBalance({
          userId: job.room.specialistId,
          amount: feeAmount,
          jobAgreementId: jobId,
          description: this.buildMovementDescription(
            'Congelamiento por confirmación de trabajo',
            job.title,
            jobId,
          ),
          tx,
        });

        const updatedJob = await tx.jobAgreement.findUniqueOrThrow({
          where: { id: jobId },
          include: JOB_WITH_ROOM_INCLUDE,
        });

        return {
          job: this.formatJob(updatedJob),
          wallet: walletResult.wallet,
          transaction: walletResult.transaction,
        };
      },
    );

    this.emitJobEvent(
      'job_updated',
      'CONFIRMED',
      job.roomId,
      userId,
      result.job,
    );

    this.logger.log(
      `Trabajo ${jobId} confirmado por especialista ${userId}. Cuota congelada: $${feeAmount.toFixed(2)} MXN`,
    );

    return {
      message: 'Trabajo confirmado y cuota congelada exitosamente',
      ...result,
    };
  }

  /**
   * Marca un trabajo como completado (CONFIRMED -> COMPLETED).
   * Solo el Empleador puede completar. Descuenta definitivamente los $50 MXN congelados.
   */
  async completeJob(userId: string, jobId: string) {
    const { job, isEmployer } = await this.loadAndAuthorizeJob(jobId, userId);

    if (!isEmployer) {
      throw new ForbiddenException(
        'Solo el empleador puede marcar el trabajo como completado',
      );
    }

    if (job.status !== JobStatus.CONFIRMED) {
      throw new ConflictException(
        `Solo se puede completar un trabajo confirmado (estado actual: ${job.status})`,
      );
    }

    const feeAmount = Number(job.feeAmount);

    const result = await this.transactionManager.runInTransaction(
      async (tx) => {
        await this.transitionJobAtomically(tx, jobId, JobStatus.CONFIRMED, {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
        });

        const walletResult = await this.walletService.captureFrozenBalance({
          userId: job.room.specialistId,
          amount: feeAmount,
          jobAgreementId: jobId,
          description: this.buildMovementDescription(
            'Pago de cuota por trabajo completado',
            job.title,
            jobId,
          ),
          tx,
        });

        const updatedJob = await tx.jobAgreement.findUniqueOrThrow({
          where: { id: jobId },
          include: JOB_WITH_ROOM_INCLUDE,
        });

        return {
          job: this.formatJob(updatedJob),
          wallet: walletResult.wallet,
          transaction: walletResult.transaction,
        };
      },
    );

    this.emitJobEvent(
      'job_updated',
      'COMPLETED',
      job.roomId,
      userId,
      result.job,
    );

    this.logger.log(
      `Trabajo ${jobId} completado por empleador ${userId}. Cuota cobrada: $${feeAmount.toFixed(2)} MXN`,
    );

    return {
      message: 'Trabajo completado y cuota descontada exitosamente',
      ...result,
    };
  }

  /**
   * Cancela un trabajo antes de completarse (PENDING | CONFIRMED -> CANCELLED).
   * Ambos participantes pueden cancelar. Si estaba CONFIRMED, revierte el saldo congelado.
   */
  async cancelJob(userId: string, jobId: string, dto?: CancelJobDto) {
    const { job } = await this.loadAndAuthorizeJob(jobId, userId);

    if (
      job.status === JobStatus.COMPLETED ||
      job.status === JobStatus.CANCELLED
    ) {
      throw new ConflictException(
        `No se puede cancelar un trabajo que ya está en estado ${job.status}`,
      );
    }

    const feeAmount = Number(job.feeAmount);

    const result = await this.transactionManager.runInTransaction(
      async (tx) => {
        const currentJob = await tx.jobAgreement.findUnique({
          where: { id: jobId },
        });

        if (
          !currentJob ||
          currentJob.status === JobStatus.COMPLETED ||
          currentJob.status === JobStatus.CANCELLED
        ) {
          throw new ConflictException(
            `No se puede cancelar un trabajo en estado ${currentJob?.status ?? 'desconocido'}`,
          );
        }

        const previousStatus = currentJob.status;

        await this.transitionJobAtomically(tx, jobId, previousStatus, {
          status: JobStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: userId,
          cancellationReason: dto?.reason?.trim() || null,
        });

        let wallet: Record<string, unknown> | null = null;
        let transaction: Record<string, unknown> | null = null;

        if (previousStatus === JobStatus.CONFIRMED) {
          const walletResult = await this.walletService.releaseFrozenBalance({
            userId: job.room.specialistId,
            amount: feeAmount,
            jobAgreementId: jobId,
            description: this.buildMovementDescription(
              'Devolución de cuota por cancelación de trabajo',
              job.title,
              jobId,
            ),
            tx,
          });
          wallet = walletResult.wallet;
          transaction = walletResult.transaction;
        }

        const updatedJob = await tx.jobAgreement.findUniqueOrThrow({
          where: { id: jobId },
          include: JOB_WITH_ROOM_INCLUDE,
        });

        return {
          job: this.formatJob(updatedJob),
          wallet,
          transaction,
        };
      },
    );

    this.emitJobEvent(
      'job_updated',
      'CANCELLED',
      job.roomId,
      userId,
      result.job,
    );

    this.logger.log(
      `Trabajo ${jobId} cancelado por usuario ${userId}${result.transaction ? ` (rollback de $${feeAmount.toFixed(2)} MXN aplicado)` : ''}`,
    );

    return {
      message: result.transaction
        ? 'Trabajo cancelado y cuota devuelta al saldo disponible'
        : 'Acuerdo de trabajo cancelado exitosamente',
      ...result,
    };
  }

  private async loadAndAuthorizeJob(jobId: string, userId: string) {
    const job = await this.prisma.jobAgreement.findUnique({
      where: { id: jobId },
      include: JOB_WITH_ROOM_INCLUDE,
    });

    if (!job) {
      throw new NotFoundException(`El acuerdo de trabajo ${jobId} no existe`);
    }

    const isEmployer = job.room.employerId === userId;
    const isSpecialist = job.room.specialistId === userId;

    if (!isEmployer && !isSpecialist) {
      throw new ForbiddenException(
        'No tienes autorización para acceder o modificar este acuerdo de trabajo',
      );
    }

    return { job, isEmployer, isSpecialist };
  }

  private async transitionJobAtomically(
    tx: TransactionClient,
    jobId: string,
    expectedStatus: JobStatus,
    data: Prisma.JobAgreementUpdateManyMutationInput,
  ) {
    const updated = await tx.jobAgreement.updateMany({
      where: {
        id: jobId,
        status: expectedStatus,
      },
      data,
    });

    if (updated.count === 0) {
      throw new ConflictException(
        'El acuerdo de trabajo cambió de estado concurrentemente',
      );
    }
  }

  private getConfirmationFee(): number {
    const configured = Number(
      this.configService.get<string | number>('JOB_CONFIRMATION_FEE'),
    );
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_JOB_CONFIRMATION_FEE;
  }

  private buildMovementDescription(
    prefix: string,
    title: string | null,
    jobId: string,
  ): string {
    const suffix = title ? title : jobId;
    return `${prefix}: ${suffix}`.slice(0, 255);
  }

  private emitJobEvent(
    eventType: JobSocketEventType,
    action: JobActionType,
    roomId: string,
    actorId: string,
    job: Record<string, unknown>,
  ) {
    this.eventEmitter.emit(
      'job.state_changed',
      new JobStateChangedEvent(eventType, action, roomId, actorId, job),
    );
  }

  private formatJob(job: JobAgreementRecord) {
    return {
      id: job.id,
      roomId: job.roomId,
      title: job.title,
      description: job.description,
      agreedPrice:
        job.agreedPrice !== null && job.agreedPrice !== undefined
          ? Number(job.agreedPrice)
          : null,
      feeAmount: Number(job.feeAmount),
      status: job.status,
      createdById: job.createdById,
      cancelledById: job.cancelledById,
      cancellationReason: job.cancellationReason,
      confirmedAt: job.confirmedAt,
      completedAt: job.completedAt,
      cancelledAt: job.cancelledAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      ...(job.room && { room: job.room }),
    };
  }
}

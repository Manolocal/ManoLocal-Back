import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JobStatus, Prisma, TransactionType } from '@prisma/client';
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
  review: {
    select: {
      id: true,
      rating: true,
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
  review?: {
    id: string;
    rating: number;
  } | null;
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
   * Solo el Especialista envía la propuesta, aceptando de paso congelar la comisión ($50 MXN)
   * en una transacción ACID hasta que el Empleador acepte, rechace o cualquiera cancele.
   */
  async createJob(userId: string, dto: CreateJobDto) {
    const room = await this.chatService.validateRoomAccess(userId, dto.roomId);

    if (room.specialistId !== userId) {
      throw new ForbiddenException(
        'Solo el especialista de la sala puede enviar una propuesta de acuerdo de trabajo',
      );
    }

    if (dto.acceptCommission === false) {
      throw new BadRequestException(
        'Debes aceptar la comisión de plataforma ($50.00 MXN) para enviar el acuerdo',
      );
    }

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

    const result = await this.transactionManager.runInTransaction(async (tx) => {
      const job = await tx.jobAgreement.create({
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

      const walletResult = await this.walletService.freezeBalance({
        userId: room.specialistId,
        amount: feeAmount,
        jobAgreementId: job.id,
        description: this.buildMovementDescription(
          'Congelamiento de comisión al enviar acuerdo',
          job.title,
          job.id,
        ),
        tx,
      });

      return {
        job: this.formatJob(job),
        wallet: walletResult.wallet,
        transaction: walletResult.transaction,
      };
    });

    this.emitJobEvent('job_created', 'CREATED', room.id, userId, result.job);

    this.logger.log(
      `Acuerdo ${result.job.id} enviado por especialista ${userId} en sala ${room.id}. Comisión congelada: $${feeAmount.toFixed(2)} MXN`,
    );

    return {
      message:
        'Acuerdo enviado y comisión de $50.00 MXN congelada. Esperando aceptación del empleador.',
      ...result,
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
   * Acepta un acuerdo de trabajo propuesto por el especialista (PENDING -> CONFIRMED).
   * Solo el Empleador puede aceptar. La comisión de $50 MXN ya fue congelada al enviarse la propuesta.
   */
  async confirmJob(userId: string, jobId: string) {
    const { job, isEmployer } = await this.loadAndAuthorizeJob(jobId, userId);

    if (!isEmployer) {
      throw new ForbiddenException(
        'Solo el empleador puede aceptar la propuesta de acuerdo de trabajo',
      );
    }

    if (job.status !== JobStatus.PENDING) {
      throw new ConflictException(
        `No se puede aceptar un trabajo en estado ${job.status}`,
      );
    }

    const result = await this.transactionManager.runInTransaction(async (tx) => {
      await this.transitionJobAtomically(tx, jobId, JobStatus.PENDING, {
        status: JobStatus.CONFIRMED,
        confirmedAt: new Date(),
      });

      const updatedJob = await tx.jobAgreement.findUniqueOrThrow({
        where: { id: jobId },
        include: JOB_WITH_ROOM_INCLUDE,
      });

      return {
        job: this.formatJob(updatedJob),
      };
    });

    this.emitJobEvent(
      'job_updated',
      'CONFIRMED',
      job.roomId,
      userId,
      result.job,
    );

    this.logger.log(
      `Acuerdo ${jobId} aceptado por empleador ${userId}. Trabajo en curso.`,
    );

    return {
      message: 'Acuerdo aceptado exitosamente. El trabajo está en curso.',
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
        `Solo se puede completar un trabajo aceptado (estado actual: ${job.status})`,
      );
    }

    const feeAmount = Number(job.feeAmount);

    const result = await this.transactionManager.runInTransaction(async (tx) => {
      await this.transitionJobAtomically(tx, jobId, JobStatus.CONFIRMED, {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
      });

      const walletResult = await this.walletService.captureFrozenBalance({
        userId: job.room.specialistId,
        amount: feeAmount,
        jobAgreementId: jobId,
        description: this.buildMovementDescription(
          'Pago de comisión por trabajo completado',
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
    });

    this.emitJobEvent(
      'job_updated',
      'COMPLETED',
      job.roomId,
      userId,
      result.job,
    );

    this.logger.log(
      `Trabajo ${jobId} completado por empleador ${userId}. Comisión cobrada: $${feeAmount.toFixed(2)} MXN`,
    );

    return {
      message: 'Trabajo marcado como completado exitosamente',
      ...result,
    };
  }

  /**
   * Rechaza o cancela un acuerdo antes de completarse (PENDING | CONFIRMED -> CANCELLED).
   * Ambos participantes pueden cancelar (y el empleador puede rechazar una propuesta PENDING).
   * Ejecuta rollback atómico devolviendo la comisión congelada de $50 MXN al saldo disponible del especialista.
   */
  async cancelJob(userId: string, jobId: string, dto?: CancelJobDto) {
    const { job, isEmployer } = await this.loadAndAuthorizeJob(jobId, userId);

    if (
      job.status === JobStatus.COMPLETED ||
      job.status === JobStatus.CANCELLED
    ) {
      throw new ConflictException(
        `No se puede cancelar un trabajo que ya está en estado ${job.status}`,
      );
    }

    const feeAmount = Number(job.feeAmount);

    const result = await this.transactionManager.runInTransaction(async (tx) => {
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

      // Verificar si hubo congelamiento previo para este acuerdo (soporta también registros heredados)
      const freezeTx =
        tx.transaction && typeof tx.transaction.findFirst === 'function'
          ? await tx.transaction.findFirst({
              where: {
                jobAgreementId: jobId,
                tipo: TransactionType.CONGELAMIENTO,
              },
            })
          : true;

      if (freezeTx) {
        const actionLabel =
          previousStatus === JobStatus.PENDING && isEmployer
            ? 'Devolución de comisión por propuesta rechazada'
            : 'Devolución de comisión por cancelación de trabajo';

        const walletResult = await this.walletService.releaseFrozenBalance({
          userId: job.room.specialistId,
          amount: feeAmount,
          jobAgreementId: jobId,
          description: this.buildMovementDescription(
            actionLabel,
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
        wasRejectedByEmployer:
          previousStatus === JobStatus.PENDING && isEmployer,
      };
    });

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

    const message = result.wasRejectedByEmployer
      ? 'Propuesta rechazada exitosamente'
      : !isEmployer && result.transaction
        ? 'Trabajo cancelado y comisión devuelta al saldo disponible'
        : 'Acuerdo de trabajo cancelado exitosamente';

    return {
      message,
      job: result.job,
      wallet: result.wallet,
      transaction: result.transaction,
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
      hasReview: Boolean(job.review),
      reviewRating: job.review?.rating ?? null,
      ...(job.room && { room: job.room }),
    };
  }
}

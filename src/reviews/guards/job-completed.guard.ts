import {
  BadRequestException,
  CanActivate,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/interfaces/auth-user.interface';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guard (`BACK-10`) que verifica antes de registrar una reseña:
 * 1. Que exista el `JobAgreement`.
 * 2. Que pertenezca al empleador autenticado en la sala correspondiente.
 * 3. Que su estado sea estrictamente `COMPLETED`.
 * 4. Que no exista ya una reseña previa para ese acuerdo (1 reseña por trabajo).
 */
@Injectable()
export class JobCompletedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      body?: { jobAgreementId?: unknown };
      validatedJob?: unknown;
    }>();

    const user = request.user;
    if (!user?.id) {
      throw new ForbiddenException('Usuario no autenticado para reseñar');
    }

    const jobAgreementId = request.body?.jobAgreementId;
    if (typeof jobAgreementId !== 'string' || !UUID_REGEX.test(jobAgreementId)) {
      throw new BadRequestException(
        'El ID del acuerdo de trabajo debe ser un UUID válido',
      );
    }

    const job = await this.prisma.jobAgreement.findUnique({
      where: { id: jobAgreementId },
      select: {
        id: true,
        status: true,
        title: true,
        room: {
          select: {
            employerId: true,
            specialistId: true,
          },
        },
        review: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Acuerdo de trabajo no encontrado');
    }

    if (job.room.employerId !== user.id) {
      throw new ForbiddenException(
        'Solo el empleador de este acuerdo puede calificar el servicio',
      );
    }

    if (job.status !== JobStatus.COMPLETED) {
      throw new ConflictException(
        `Solo puedes reseñar trabajos finalizados (COMPLETED). Estado actual: ${job.status}`,
      );
    }

    if (job.review) {
      throw new ConflictException(
        'Este acuerdo de trabajo ya tiene una reseña publicada',
      );
    }

    request.validatedJob = job;
    return true;
  }
}

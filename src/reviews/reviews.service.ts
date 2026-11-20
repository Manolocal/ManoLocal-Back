import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { StringSanitizer } from '../common/helpers/string-sanitizer.helper';
import {
  buildPaginatedResult,
  calculatePagination,
} from '../common/helpers/pagination.helper';
import { CreateReviewDto } from './dto/create-review.dto';
import { GetReviewsQueryDto } from './dto/get-reviews-query.dto';

const REVIEW_PUBLIC_SELECT = {
  id: true,
  jobAgreementId: true,
  employerId: true,
  specialistId: true,
  rating: true,
  comment: true,
  createdAt: true,
  employer: {
    select: {
      id: true,
      name: true,
      profile: {
        select: {
          fullName: true,
        },
      },
    },
  },
  jobAgreement: {
    select: {
      id: true,
      title: true,
      completedAt: true,
    },
  },
} as const;

type ReviewRecord = {
  id: string;
  jobAgreementId: string;
  employerId: string;
  specialistId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  employer?: {
    id: string;
    name: string | null;
    profile?: {
      fullName: string | null;
    } | null;
  } | null;
  jobAgreement?: {
    id: string;
    title: string | null;
    completedAt: Date | null;
  } | null;
};

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Publica una reseña para un trabajo finalizado (`COMPLETED`) y retorna
   * la reputación actualizada del especialista (`Profile.ratingAverage` / `ratingCount`).
   */
  async createReview(employerId: string, dto: CreateReviewDto) {
    const job = await this.prisma.jobAgreement.findUnique({
      where: { id: dto.jobAgreementId },
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

    if (job.room.employerId !== employerId) {
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

    const sanitizedComment = dto.comment
      ? StringSanitizer.cleanWhitespace(StringSanitizer.stripHtml(dto.comment))
      : '';
    const normalizedComment =
      sanitizedComment.length > 0 ? sanitizedComment : null;

    const db =
      typeof this.prisma.getExtendedClient === 'function'
        ? this.prisma.getExtendedClient()
        : this.prisma;

    let createdReview: ReviewRecord;
    try {
      createdReview = await db.review.create({
        data: {
          jobAgreementId: dto.jobAgreementId,
          employerId,
          specialistId: job.room.specialistId,
          rating: dto.rating,
          comment: normalizedComment,
        },
        select: REVIEW_PUBLIC_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Este acuerdo de trabajo ya tiene una reseña publicada',
        );
      }
      throw error;
    }

    const specialistProfile = await this.prisma.profile.findUnique({
      where: { userId: job.room.specialistId },
      select: {
        ratingAverage: true,
        ratingCount: true,
      },
    });

    return {
      message: 'Reseña publicada exitosamente',
      review: this.formatReview(createdReview),
      specialistReputation: {
        specialistId: job.room.specialistId,
        ratingAverage: Number(specialistProfile?.ratingAverage ?? dto.rating),
        ratingCount: specialistProfile?.ratingCount ?? 1,
      },
    };
  }

  /**
   * Obtiene el listado público paginado de reseñas y la reputación de un especialista.
   */
  async getReviewsBySpecialist(specialistId: string, query: GetReviewsQueryDto) {
    const specialist = await this.prisma.user.findUnique({
      where: { id: specialistId },
      select: {
        id: true,
        name: true,
        role: true,
        status: true,
        profile: {
          select: {
            fullName: true,
            ratingAverage: true,
            ratingCount: true,
          },
        },
      },
    });

    if (
      !specialist ||
      specialist.role !== Role.ESPECIALISTA ||
      specialist.status === UserStatus.INACTIVO
    ) {
      throw new NotFoundException('Especialista no encontrado o inactivo');
    }

    const { page, limit, skip } = calculatePagination(query);

    const [total, reviews] = await Promise.all([
      this.prisma.review.count({
        where: { specialistId },
      }),
      this.prisma.review.findMany({
        where: { specialistId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: REVIEW_PUBLIC_SELECT,
      }),
    ]);

    const formatted = reviews.map((review) => this.formatReview(review));
    const paginated = buildPaginatedResult(formatted, total, { page, limit });

    return {
      specialist: {
        id: specialist.id,
        name: specialist.name,
        fullName: specialist.profile?.fullName ?? null,
        ratingAverage: Number(specialist.profile?.ratingAverage ?? 0),
        ratingCount: specialist.profile?.ratingCount ?? 0,
      },
      reviews: paginated.items,
      meta: paginated.meta,
    };
  }

  /**
   * Consulta si un acuerdo de trabajo ya tiene reseña registrada.
   * Visible para las partes involucradas en la sala o administradores.
   */
  async getReviewByJob(
    userId: string,
    userRole: Role,
    jobAgreementId: string,
  ) {
    const job = await this.prisma.jobAgreement.findUnique({
      where: { id: jobAgreementId },
      select: {
        id: true,
        room: {
          select: {
            employerId: true,
            specialistId: true,
          },
        },
        review: {
          select: REVIEW_PUBLIC_SELECT,
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Acuerdo de trabajo no encontrado');
    }

    if (
      userRole !== Role.ADMIN &&
      job.room.employerId !== userId &&
      job.room.specialistId !== userId
    ) {
      throw new ForbiddenException(
        'No tienes permiso para consultar la reseña de este acuerdo',
      );
    }

    return {
      jobAgreementId: job.id,
      hasReview: Boolean(job.review),
      review: job.review ? this.formatReview(job.review) : null,
    };
  }

  private formatReview(review: ReviewRecord) {
    const employerDisplayName =
      review.employer?.profile?.fullName?.trim() ||
      review.employer?.name?.trim() ||
      'Empleador';

    return {
      id: review.id,
      jobAgreementId: review.jobAgreementId,
      employerId: review.employerId,
      specialistId: review.specialistId,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      jobTitle: review.jobAgreement?.title ?? null,
      employer: {
        id: review.employer?.id ?? review.employerId,
        name: employerDisplayName,
      },
    };
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let mockExtendedReviewCreate: jest.Mock;
  let prisma: {
    jobAgreement: { findUnique: jest.Mock };
    review: { create: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    profile: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    getExtendedClient: jest.Mock;
  };

  beforeEach(async () => {
    mockExtendedReviewCreate = jest.fn();
    prisma = {
      jobAgreement: { findUnique: jest.fn() },
      review: { create: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      profile: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      getExtendedClient: jest.fn(() => ({
        review: { create: mockExtendedReviewCreate },
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  describe('createReview', () => {
    const jobId = '9c1d4c3e-6a8f-4f2b-a801-2c4d6e8f9a10';

    it('crea reseña sanitizada, dispara cliente extendido y devuelve reputación actualizada', async () => {
      prisma.jobAgreement.findUnique.mockResolvedValue({
        id: jobId,
        status: JobStatus.COMPLETED,
        title: 'Instalación eléctrica',
        room: { employerId: 'emp-1', specialistId: 'spec-1' },
        review: null,
      });

      mockExtendedReviewCreate.mockResolvedValue({
        id: 'rev-1',
        jobAgreementId: jobId,
        employerId: 'emp-1',
        specialistId: 'spec-1',
        rating: 5,
        comment: 'Excelente servicio',
        createdAt: new Date('2026-11-20T12:00:00Z'),
        employer: {
          id: 'emp-1',
          name: 'Ana',
          profile: { fullName: 'Ana Martínez' },
        },
        jobAgreement: {
          id: jobId,
          title: 'Instalación eléctrica',
          completedAt: new Date('2026-11-20T11:30:00Z'),
        },
      });

      prisma.profile.findUnique.mockResolvedValue({
        ratingAverage: new Prisma.Decimal('4.75'),
        ratingCount: 4,
      });

      const result = await service.createReview('emp-1', {
        jobAgreementId: jobId,
        rating: 5,
        comment: '  <b>Excelente</b>   servicio  ',
      });

      expect(mockExtendedReviewCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            jobAgreementId: jobId,
            employerId: 'emp-1',
            specialistId: 'spec-1',
            rating: 5,
            comment: 'Excelente servicio',
          },
        }),
      );
      expect(result.specialistReputation).toEqual({
        specialistId: 'spec-1',
        ratingAverage: 4.75,
        ratingCount: 4,
      });
      expect(result.review.employer.name).toBe('Ana Martínez');
    });

    it('rechaza trabajo no COMPLETED o duplicado', async () => {
      prisma.jobAgreement.findUnique.mockResolvedValue({
        id: jobId,
        status: JobStatus.PENDING,
        room: { employerId: 'emp-1', specialistId: 'spec-1' },
        review: null,
      });

      await expect(
        service.createReview('emp-1', { jobAgreementId: jobId, rating: 4 }),
      ).rejects.toThrow(ConflictException);
    });

    it('rechaza si el usuario no es el empleador del acuerdo', async () => {
      prisma.jobAgreement.findUnique.mockResolvedValue({
        id: jobId,
        status: JobStatus.COMPLETED,
        room: { employerId: 'emp-real', specialistId: 'spec-1' },
        review: null,
      });

      await expect(
        service.createReview('emp-otro', { jobAgreementId: jobId, rating: 5 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getReviewsBySpecialist', () => {
    it('lanza NotFoundException si el especialista no existe o está INACTIVO', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getReviewsBySpecialist('spec-x', { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('retorna perfil de reputación y reseñas públicas paginadas', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'spec-1',
        name: 'Carlos',
        role: Role.ESPECIALISTA,
        status: UserStatus.ACTIVO,
        profile: {
          fullName: 'Carlos López',
          ratingAverage: new Prisma.Decimal('4.50'),
          ratingCount: 2,
        },
      });
      prisma.review.count.mockResolvedValue(2);
      prisma.review.findMany.mockResolvedValue([
        {
          id: 'rev-1',
          jobAgreementId: 'job-1',
          employerId: 'emp-1',
          specialistId: 'spec-1',
          rating: 5,
          comment: 'Muy bien',
          createdAt: new Date('2026-11-20T10:00:00Z'),
          employer: { id: 'emp-1', name: 'Luis', profile: { fullName: 'Luis Torres' } },
          jobAgreement: { id: 'job-1', title: 'Plomería', completedAt: null },
        },
      ]);

      const res = await service.getReviewsBySpecialist('spec-1', {
        page: 1,
        limit: 10,
      });

      expect(res.specialist.ratingAverage).toBe(4.5);
      expect(res.specialist.ratingCount).toBe(2);
      expect(res.reviews).toHaveLength(1);
      expect(res.reviews[0].employer.name).toBe('Luis Torres');
      expect(res.meta.total).toBe(2);
    });
  });

  describe('getReviewByJob', () => {
    it('impide acceso a usuarios externos al acuerdo', async () => {
      prisma.jobAgreement.findUnique.mockResolvedValue({
        id: 'job-1',
        room: { employerId: 'emp-1', specialistId: 'spec-1' },
        review: null,
      });

      await expect(
        service.getReviewByJob('intruso', Role.EMPLEADOR, 'job-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('permite consultar estado sin reseña a un participante', async () => {
      prisma.jobAgreement.findUnique.mockResolvedValue({
        id: 'job-1',
        room: { employerId: 'emp-1', specialistId: 'spec-1' },
        review: null,
      });

      const res = await service.getReviewByJob('emp-1', Role.EMPLEADOR, 'job-1');

      expect(res).toEqual({
        jobAgreementId: 'job-1',
        hasReview: false,
        review: null,
      });
    });
  });
});

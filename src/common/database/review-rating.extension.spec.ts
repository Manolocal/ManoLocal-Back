import { PrismaClient } from '@prisma/client';
import {
  recalculateSpecialistRating,
  withReviewRatingExtension,
} from './review-rating.extension';

describe('review-rating.extension', () => {
  it('recalculateSpecialistRating actualiza ratingAverage y ratingCount en profile', async () => {
    const db = {
      review: {
        aggregate: jest.fn().mockResolvedValue({
          _avg: { rating: 4.666666 },
          _count: { _all: 3 },
        }),
      },
      profile: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn(),
      },
    };

    const result = await recalculateSpecialistRating(
      db as unknown as Parameters<typeof recalculateSpecialistRating>[0],
      'spec-1',
    );

    expect(result).toEqual({
      specialistId: 'spec-1',
      ratingAverage: 4.67,
      ratingCount: 3,
    });
    expect(db.profile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'spec-1' },
      data: { ratingAverage: 4.67, ratingCount: 3 },
    });
    expect(db.profile.upsert).not.toHaveBeenCalled();
  });

  it('recalculateSpecialistRating usa upsert cuando aún no existe perfil y deja promedio en 0 sin reseñas', async () => {
    const db = {
      review: {
        aggregate: jest.fn().mockResolvedValue({
          _avg: { rating: null },
          _count: { _all: 0 },
        }),
      },
      profile: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({ userId: 'spec-2' }),
      },
    };

    const result = await recalculateSpecialistRating(
      db as unknown as Parameters<typeof recalculateSpecialistRating>[0],
      'spec-2',
    );

    expect(result).toEqual({
      specialistId: 'spec-2',
      ratingAverage: 0,
      ratingCount: 0,
    });
    expect(db.profile.upsert).toHaveBeenCalledWith({
      where: { userId: 'spec-2' },
      create: { userId: 'spec-2', ratingAverage: 0, ratingCount: 0 },
      update: { ratingAverage: 0, ratingCount: 0 },
    });
  });

  it('withReviewRatingExtension registra el hook en $extends y recalcula tras create/update/delete', async () => {
    const mockBasePrisma = {
      review: {
        aggregate: jest.fn().mockResolvedValue({
          _avg: { rating: 4.5 },
          _count: { _all: 2 },
        }),
      },
      profile: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn(),
      },
      $extends: jest.fn((config: Record<string, unknown>) => config),
    };

    const extendedConfig = withReviewRatingExtension(
      mockBasePrisma as unknown as PrismaClient,
    ) as unknown as {
      name: string;
      query: {
        review: {
          create: (params: {
            args: unknown;
            query: (a: unknown) => Promise<{ specialistId: string }>;
          }) => Promise<unknown>;
          delete: (params: {
            args: unknown;
            query: (a: unknown) => Promise<{ specialistId: string }>;
          }) => Promise<unknown>;
        };
      };
    };

    expect(mockBasePrisma.$extends).toHaveBeenCalledTimes(1);
    expect(extendedConfig.name).toBe('review-rating-sync');

    await extendedConfig.query.review.create({
      args: { data: { specialistId: 'spec-1', rating: 5 } },
      query: jest.fn().mockResolvedValue({ id: 'rev-1', specialistId: 'spec-1' }),
    });

    await extendedConfig.query.review.delete({
      args: { where: { id: 'rev-1' } },
      query: jest.fn().mockResolvedValue({ id: 'rev-1', specialistId: 'spec-1' }),
    });

    expect(mockBasePrisma.profile.updateMany).toHaveBeenCalledTimes(2);
    expect(mockBasePrisma.profile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'spec-1' },
      data: { ratingAverage: 4.5, ratingCount: 2 },
    });
  });
});

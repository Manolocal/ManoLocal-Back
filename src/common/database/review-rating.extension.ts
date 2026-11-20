import { Prisma, PrismaClient } from '@prisma/client';

type RatingDbClient = Pick<
  Prisma.TransactionClient,
  'review' | 'profile'
>;

export interface SpecialistRatingSummary {
  specialistId: string;
  ratingAverage: number;
  ratingCount: number;
}

/**
 * Recalcula el promedio ponderado (`ratingAverage`) y conteo (`ratingCount`)
 * en el perfil del especialista a partir de todas sus reseñas registradas.
 */
export async function recalculateSpecialistRating(
  db: RatingDbClient,
  specialistId: string,
): Promise<SpecialistRatingSummary> {
  const aggregation = await db.review.aggregate({
    where: { specialistId },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const ratingCount = aggregation._count._all;
  const rawAvg = aggregation._avg.rating;
  const ratingAverage =
    ratingCount > 0 && rawAvg !== null && rawAvg !== undefined
      ? Number(Number(rawAvg).toFixed(2))
      : 0;

  const updated = await db.profile.updateMany({
    where: { userId: specialistId },
    data: {
      ratingAverage,
      ratingCount,
    },
  });

  if (updated.count === 0) {
    await db.profile.upsert({
      where: { userId: specialistId },
      create: {
        userId: specialistId,
        ratingAverage,
        ratingCount,
      },
      update: {
        ratingAverage,
        ratingCount,
      },
    });
  }

  return {
    specialistId,
    ratingAverage,
    ratingCount,
  };
}

/**
 * Extensión de Prisma Client (`BACK-10`) que sincroniza automáticamente
 * `Profile.ratingAverage` y `Profile.ratingCount` después de crear, editar o
 * eliminar una reseña en la tabla `reviews`.
 */
export function withReviewRatingExtension(basePrisma: PrismaClient) {
  return basePrisma.$extends({
    name: 'review-rating-sync',
    query: {
      review: {
        async create({ args, query }) {
          const created = await query(args);
          if (created?.specialistId) {
            await recalculateSpecialistRating(basePrisma, created.specialistId);
          }
          return created;
        },
        async update({ args, query }) {
          const updated = await query(args);
          if (updated?.specialistId) {
            await recalculateSpecialistRating(basePrisma, updated.specialistId);
          }
          return updated;
        },
        async delete({ args, query }) {
          const deleted = await query(args);
          if (deleted?.specialistId) {
            await recalculateSpecialistRating(basePrisma, deleted.specialistId);
          }
          return deleted;
        },
      },
    },
  });
}

export type ExtendedPrismaClient = ReturnType<typeof withReviewRatingExtension>;

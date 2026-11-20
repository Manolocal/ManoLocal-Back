import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ExtendedPrismaClient,
  withReviewRatingExtension,
} from '../common/database/review-rating.extension';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private extendedClient: ExtendedPrismaClient | null = null;

  /**
   * Retorna la instancia extendida de Prisma Client con hooks de dominio
   * (por ejemplo, recálculo automático de calificación promedio al crear reseñas).
   */
  getExtendedClient(): ExtendedPrismaClient {
    if (!this.extendedClient) {
      this.extendedClient = withReviewRatingExtension(this);
    }
    return this.extendedClient;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to Supabase database successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Supabase database', error);
      // Don't crash immediately on boot if credentials are yet to be updated, but log clearly
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma disconnected from database');
  }
}

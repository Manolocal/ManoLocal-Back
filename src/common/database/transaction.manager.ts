import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type TransactionClient = Prisma.TransactionClient;

export interface TransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Gestor centralizado de transacciones ACID respaldado por `$transaction` de Prisma.
 *
 * Permite coordinar operaciones atómicas multi-tabla (por ejemplo: actualización
 * de estado de `JobAgreement`, ajuste de montos en `Wallet` y registro de historial
 * en `Transaction`) garantizando consistencia total ("todas o ninguna").
 */
@Injectable()
export class TransactionManager {
  private readonly logger = new Logger(TransactionManager.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ejecuta un bloque de trabajo dentro de una transacción interactiva de Prisma.
   * Si cualquier operación lanza una excepción, Prisma revierte automáticamente
   * todos los cambios realizados dentro de `tx`.
   */
  async runInTransaction<T>(
    callback: (tx: TransactionClient) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    try {
      if (options) {
        return await this.prisma.$transaction((tx) => callback(tx), options);
      }

      return await this.prisma.$transaction((tx) => callback(tx));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Transacción revertida (rollback automático): ${errorMessage}`,
      );
      throw error;
    }
  }

  /**
   * Retorna el cliente transaccional activo si la operación ya corre dentro de
   * una transacción, o el `PrismaService` estándar en caso contrario.
   */
  resolveClient(tx?: TransactionClient): TransactionClient | PrismaService {
    return tx ?? this.prisma;
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserCreatedEvent } from '../common/events/user-created.event';
import { RechargeWalletDto } from './dto/recharge-wallet.dto';
import { GetTransactionsQueryDto } from './dto/get-transactions.dto';
import { Role } from '../common/enums/role.enum';
import {
  TransactionClient,
  TransactionManager,
} from '../common/database/transaction.manager';
import { InsufficientBalanceException } from '../common/exceptions/insufficient-balance.exception';

export interface WalletMutationParams {
  userId: string;
  amount: number;
  jobAgreementId?: string;
  description?: string;
  tx?: TransactionClient;
}

type FrozenMutationMode = 'FREEZE' | 'CAPTURE' | 'RELEASE';

const DEFAULT_FROZEN_DESCRIPTIONS: Record<
  FrozenMutationMode,
  (amount: number) => string
> = {
  FREEZE: (amount) =>
    `Congelamiento de cuota por confirmación de trabajo ($${amount.toFixed(2)} MXN)`,
  CAPTURE: (amount) =>
    `Cobro definitivo de cuota por trabajo completado ($${amount.toFixed(2)} MXN)`,
  RELEASE: (amount) =>
    `Devolución de cuota congelada por cancelación de trabajo ($${amount.toFixed(2)} MXN)`,
};

const FROZEN_TRANSACTION_TYPES: Record<FrozenMutationMode, TransactionType> = {
  FREEZE: TransactionType.CONGELAMIENTO,
  CAPTURE: TransactionType.PAGO,
  RELEASE: TransactionType.DEVOLUCION,
};

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionManager: TransactionManager,
  ) {}

  /**
   * Listener de evento desacoplado 'user.created'.
   * Se ejecuta automáticamente al registrar un nuevo usuario con rol ESPECIALISTA.
   */
  @OnEvent('user.created')
  async handleUserCreated(event: UserCreatedEvent) {
    if (event.role === Role.ESPECIALISTA) {
      this.logger.log(
        `Evento user.created recibido para Especialista ${event.userId}. Creando billetera...`,
      );
      await this.createWallet(event.userId);
    }
  }

  /**
   * Crea una nueva billetera virtual vinculada al especialista con saldo inicial en 0.
   */
  async createWallet(userId: string) {
    const existingWallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (existingWallet) {
      return existingWallet;
    }

    const wallet = await this.prisma.wallet.create({
      data: {
        userId,
        balanceDisponible: new Prisma.Decimal(0.0),
        balanceCongelado: new Prisma.Decimal(0.0),
      },
    });

    this.logger.log(
      `Billetera virtual creada exitosamente para el usuario ${userId}: ${wallet.id}`,
    );

    return wallet;
  }

  /**
   * Obtiene la billetera virtual del usuario con sus saldos actualizados.
   * Si el usuario es Especialista y no poseía billetera aún, se la aprovisiona.
   */
  async getWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      // Auto-aprovisionar para Especialistas o Administradores
      wallet = await this.createWallet(userId);
    }

    return {
      ...this.formatWalletSummary(wallet),
      createdAt: wallet.createdAt,
    };
  }

  /**
   * Consulta el historial paginado de movimientos de la billetera.
   */
  async getTransactions(userId: string, query: GetTransactionsQueryDto) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException(
        'El usuario no cuenta con una billetera virtual registrada',
      );
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const whereClause: Prisma.TransactionWhereInput = {
      walletId: wallet.id,
      ...(query.tipo && { tipo: query.tipo }),
    };

    const [total, transactions] = await Promise.all([
      this.prisma.transaction.count({ where: whereClause }),
      this.prisma.transaction.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { fecha: 'desc' },
      }),
    ]);

    const formattedTransactions = transactions.map((t) =>
      this.formatTransaction(t),
    );

    return {
      data: formattedTransactions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Endpoint simulado (Mock) para recargar saldo a la billetera virtual.
   * Realiza el cálculo matemático atómico en el backend y registra el movimiento.
   */
  async rechargeWallet(userId: string, dto: RechargeWalletDto) {
    if (dto.monto <= 0) {
      throw new BadRequestException(
        'El monto a recargar debe ser mayor a cero',
      );
    }

    return this.transactionManager.runInTransaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            userId,
            balanceDisponible: new Prisma.Decimal(0.0),
            balanceCongelado: new Prisma.Decimal(0.0),
          },
        });
      }

      const rechargeDecimal = new Prisma.Decimal(dto.monto);
      const newBalanceDisponible = new Prisma.Decimal(
        wallet.balanceDisponible,
      ).plus(rechargeDecimal);

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balanceDisponible: newBalanceDisponible,
        },
      });

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          monto: rechargeDecimal,
          tipo: TransactionType.RECARGA,
          descripcion: dto.descripcion || 'Recarga simulada de saldo (Mock)',
        },
      });

      this.logger.log(
        `Recarga simulada completada para wallet ${wallet.id}: +${dto.monto}. Nuevo saldo disponible: ${Number(newBalanceDisponible).toFixed(2)}`,
      );

      return {
        message: 'Recarga simulada exitosa',
        wallet: this.formatWalletSummary(updatedWallet),
        transaction: this.formatTransactionSummary(transaction),
      };
    });
  }

  /**
   * Congela saldo disponible del especialista al confirmar un acuerdo de trabajo.
   * Lanza `InsufficientBalanceException` (HTTP 402) si el saldo disponible es insuficiente.
   */
  async freezeBalance(params: WalletMutationParams) {
    return this.executeFrozenMutation('FREEZE', params);
  }

  /**
   * Descuenta definitivamente el saldo previamente congelado al completar un trabajo.
   */
  async captureFrozenBalance(params: WalletMutationParams) {
    return this.executeFrozenMutation('CAPTURE', params);
  }

  /**
   * Libera el saldo congelado y lo reintegra al saldo disponible al cancelar un trabajo.
   */
  async releaseFrozenBalance(params: WalletMutationParams) {
    return this.executeFrozenMutation('RELEASE', params);
  }

  private async executeFrozenMutation(
    mode: FrozenMutationMode,
    params: WalletMutationParams,
  ) {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new BadRequestException(
        'El monto de la operación debe ser mayor a cero',
      );
    }

    const run = async (client: TransactionClient) => {
      const wallet = await client.wallet.findUnique({
        where: { userId: params.userId },
      });

      const amountDecimal = new Prisma.Decimal(params.amount);

      if (mode === 'FREEZE') {
        const availableBalance = wallet ? Number(wallet.balanceDisponible) : 0;
        if (!wallet || availableBalance < params.amount) {
          throw new InsufficientBalanceException(
            params.amount,
            availableBalance,
          );
        }

        const updateResult = await client.wallet.updateMany({
          where: {
            id: wallet.id,
            balanceDisponible: { gte: amountDecimal },
          },
          data: {
            balanceDisponible: { decrement: amountDecimal },
            balanceCongelado: { increment: amountDecimal },
          },
        });

        if (updateResult.count === 0) {
          const latestWallet = await client.wallet.findUnique({
            where: { id: wallet.id },
          });
          throw new InsufficientBalanceException(
            params.amount,
            latestWallet ? Number(latestWallet.balanceDisponible) : 0,
          );
        }
      } else {
        if (!wallet) {
          throw new NotFoundException(
            'El especialista no cuenta con una billetera virtual registrada',
          );
        }

        const frozenBalance = Number(wallet.balanceCongelado);
        const errorLabel =
          mode === 'CAPTURE'
            ? 'descontar la cuota de trabajo'
            : 'devolver la cuota congelada';

        if (frozenBalance < params.amount) {
          throw new ConflictException(
            `Saldo congelado insuficiente para ${errorLabel}`,
          );
        }

        const updateResult = await client.wallet.updateMany({
          where: {
            id: wallet.id,
            balanceCongelado: { gte: amountDecimal },
          },
          data:
            mode === 'CAPTURE'
              ? { balanceCongelado: { decrement: amountDecimal } }
              : {
                  balanceCongelado: { decrement: amountDecimal },
                  balanceDisponible: { increment: amountDecimal },
                },
        });

        if (updateResult.count === 0) {
          throw new ConflictException(
            `No fue posible ${errorLabel} por saldo congelado insuficiente`,
          );
        }
      }

      const updatedWallet = await client.wallet.findUniqueOrThrow({
        where: { id: wallet.id },
      });

      const transaction = await client.transaction.create({
        data: {
          walletId: wallet.id,
          jobAgreementId: params.jobAgreementId ?? null,
          monto: amountDecimal,
          tipo: FROZEN_TRANSACTION_TYPES[mode],
          descripcion:
            params.description ||
            DEFAULT_FROZEN_DESCRIPTIONS[mode](params.amount),
        },
      });

      this.logger.log(
        `Operación de billetera [${mode}] ejecutada en wallet ${wallet.id} por $${params.amount.toFixed(2)} MXN (job=${params.jobAgreementId ?? 'N/A'})`,
      );

      return {
        wallet: this.formatWalletSummary(updatedWallet),
        transaction: this.formatTransactionSummary(transaction),
      };
    };

    if (params.tx) {
      return run(params.tx);
    }

    return this.transactionManager.runInTransaction((tx) => run(tx));
  }

  private formatWalletSummary(wallet: {
    id: string;
    userId: string;
    balanceDisponible: Prisma.Decimal | number | string;
    balanceCongelado: Prisma.Decimal | number | string;
    updatedAt: Date;
  }) {
    const balanceDisponible = Number(wallet.balanceDisponible);
    const balanceCongelado = Number(wallet.balanceCongelado);
    const balanceTotal = Number(
      new Prisma.Decimal(wallet.balanceDisponible).plus(
        wallet.balanceCongelado,
      ),
    );

    return {
      id: wallet.id,
      userId: wallet.userId,
      balanceDisponible,
      balanceCongelado,
      balanceTotal,
      updatedAt: wallet.updatedAt,
    };
  }

  private formatTransaction(transaction: {
    id: string;
    walletId: string;
    jobAgreementId?: string | null;
    monto: Prisma.Decimal | number | string;
    tipo: TransactionType;
    descripcion: string | null;
    fecha: Date;
  }) {
    return {
      id: transaction.id,
      walletId: transaction.walletId,
      ...(transaction.jobAgreementId !== undefined && {
        jobAgreementId: transaction.jobAgreementId,
      }),
      monto: Number(transaction.monto),
      tipo: transaction.tipo,
      descripcion: transaction.descripcion,
      fecha: transaction.fecha,
    };
  }

  private formatTransactionSummary(transaction: {
    id: string;
    monto: Prisma.Decimal | number | string;
    tipo: TransactionType;
    descripcion: string | null;
    fecha: Date;
  }) {
    return {
      id: transaction.id,
      monto: Number(transaction.monto),
      tipo: transaction.tipo,
      descripcion: transaction.descripcion,
      fecha: transaction.fecha,
    };
  }
}

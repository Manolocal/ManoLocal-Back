import {
  BadRequestException,
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

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    const balanceDisponible = Number(wallet.balanceDisponible);
    const balanceCongelado = Number(wallet.balanceCongelado);
    const balanceTotal = Number(
      (wallet.balanceDisponible as any).plus(wallet.balanceCongelado),
    );

    return {
      id: wallet.id,
      userId: wallet.userId,
      balanceDisponible,
      balanceCongelado,
      balanceTotal,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
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

    const formattedTransactions = transactions.map((t) => ({
      id: t.id,
      walletId: t.walletId,
      monto: Number(t.monto),
      tipo: t.tipo,
      descripcion: t.descripcion,
      fecha: t.fecha,
    }));

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
      throw new BadRequestException('El monto a recargar debe ser mayor a cero');
    }

    return this.prisma.$transaction(async (tx) => {
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
      const newBalanceDisponible = (wallet.balanceDisponible as any).plus(
        rechargeDecimal,
      );

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
        `Recarga simulada completada para wallet ${wallet.id}: +${dto.monto}. Nuevo saldo disponible: ${newBalanceDisponible}`,
      );

      return {
        message: 'Recarga simulada exitosa',
        wallet: {
          id: updatedWallet.id,
          userId: updatedWallet.userId,
          balanceDisponible: Number(updatedWallet.balanceDisponible),
          balanceCongelado: Number(updatedWallet.balanceCongelado),
          balanceTotal: Number(
            (updatedWallet.balanceDisponible as any).plus(
              updatedWallet.balanceCongelado,
            ),
          ),
          updatedAt: updatedWallet.updatedAt,
        },
        transaction: {
          id: transaction.id,
          monto: Number(transaction.monto),
          tipo: transaction.tipo,
          descripcion: transaction.descripcion,
          fecha: transaction.fecha,
        },
      };
    });
  }
}

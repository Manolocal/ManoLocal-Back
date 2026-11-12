import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, TransactionType } from '@prisma/client';
import { Role } from '../common/enums/role.enum';
import { UserCreatedEvent } from '../common/events/user-created.event';
import { TransactionManager } from '../common/database/transaction.manager';
import { InsufficientBalanceException } from '../common/exceptions/insufficient-balance.exception';

describe('WalletService', () => {
  let service: WalletService;
  let prisma: jest.Mocked<PrismaService>;
  let mockTransactionManager: {
    runInTransaction: jest.Mock;
    resolveClient: jest.Mock;
  };

  const mockWallet = {
    id: 'wallet-uuid-1',
    userId: 'user-uuid-1',
    balanceDisponible: new Prisma.Decimal(500.0),
    balanceCongelado: new Prisma.Decimal(100.0),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrisma = {
      wallet: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      transaction: {
        count: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };

    mockTransactionManager = {
      runInTransaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) =>
        cb(mockPrisma),
      ),
      resolveClient: jest.fn((tx?: unknown) => tx ?? mockPrisma),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: TransactionManager,
          useValue: mockTransactionManager,
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    prisma = module.get(PrismaService);
  });

  describe('handleUserCreated', () => {
    it('should create wallet when user.created event is for ESPECIALISTA', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.wallet.create as jest.Mock).mockResolvedValue(mockWallet);

      const event = new UserCreatedEvent(
        'spec-1',
        'spec@test.com',
        Role.ESPECIALISTA,
      );

      await service.handleUserCreated(event);

      expect(prisma.wallet.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'spec-1' }),
        }),
      );
    });

    it('should NOT create wallet if role is EMPLEADOR', async () => {
      const event = new UserCreatedEvent(
        'emp-1',
        'emp@test.com',
        Role.EMPLEADOR,
      );

      await service.handleUserCreated(event);

      expect(prisma.wallet.create).not.toHaveBeenCalled();
    });
  });

  describe('createWallet', () => {
    it('should return existing wallet if already present', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(mockWallet);

      const result = await service.createWallet('user-uuid-1');

      expect(result).toEqual(mockWallet);
      expect(prisma.wallet.create).not.toHaveBeenCalled();
    });

    it('should create new wallet with initial 0.0 balances', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.wallet.create as jest.Mock).mockResolvedValue(mockWallet);

      const result = await service.createWallet('user-uuid-1');

      expect(result).toEqual(mockWallet);
      expect(prisma.wallet.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-uuid-1',
            balanceDisponible: new Prisma.Decimal(0.0),
            balanceCongelado: new Prisma.Decimal(0.0),
          }),
        }),
      );
    });
  });

  describe('getWallet', () => {
    it('should return wallet balances including computed balanceTotal', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(mockWallet);

      const result = await service.getWallet('user-uuid-1');

      expect(result.id).toBe(mockWallet.id);
      expect(result.balanceDisponible).toBe(500);
      expect(result.balanceCongelado).toBe(100);
      expect(result.balanceTotal).toBe(600);
    });

    it('should auto-provision wallet if missing for existing user', async () => {
      (prisma.wallet.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // llamada en getWallet
        .mockResolvedValueOnce(null); // llamada en createWallet

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-uuid-1',
        role: Role.ESPECIALISTA,
      });

      (prisma.wallet.create as jest.Mock).mockResolvedValue(mockWallet);

      const result = await service.getWallet('user-uuid-1');

      expect(result.id).toBe(mockWallet.id);
      expect(prisma.wallet.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getWallet('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getTransactions', () => {
    it('should throw NotFoundException if wallet does not exist', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getTransactions('user-1', { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return paginated transactions with meta', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(mockWallet);
      (prisma.transaction.count as jest.Mock).mockResolvedValue(1);

      const mockTx = {
        id: 'tx-1',
        walletId: mockWallet.id,
        monto: new Prisma.Decimal(250.0),
        tipo: TransactionType.RECARGA,
        descripcion: 'Recarga inicial',
        fecha: new Date(),
      };
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([mockTx]);

      const result = await service.getTransactions('user-uuid-1', {
        page: 1,
        limit: 10,
        tipo: TransactionType.RECARGA,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].monto).toBe(250.0);
      expect(result.data[0].tipo).toBe(TransactionType.RECARGA);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          where: expect.objectContaining({
            walletId: mockWallet.id,
            tipo: TransactionType.RECARGA,
          }),
        }),
      );
    });
  });

  describe('rechargeWallet', () => {
    it('should throw BadRequestException for non-positive amount', async () => {
      await expect(
        service.rechargeWallet('user-1', { monto: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should add amount to balanceDisponible and create transaction record', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(mockWallet);

      const updatedWallet = {
        ...mockWallet,
        balanceDisponible: new Prisma.Decimal(700.0),
      };
      (prisma.wallet.update as jest.Mock).mockResolvedValue(updatedWallet);

      const createdTx = {
        id: 'tx-recharge-1',
        walletId: mockWallet.id,
        monto: new Prisma.Decimal(200.0),
        tipo: TransactionType.RECARGA,
        descripcion: 'Recarga simulada de saldo (Mock)',
        fecha: new Date(),
      };
      (prisma.transaction.create as jest.Mock).mockResolvedValue(createdTx);

      const result = await service.rechargeWallet('user-uuid-1', {
        monto: 200.0,
      });

      expect(result.message).toBe('Recarga simulada exitosa');
      expect(result.wallet.balanceDisponible).toBe(700.0);
      expect(result.transaction.monto).toBe(200.0);
      expect(result.transaction.tipo).toBe(TransactionType.RECARGA);
      expect(prisma.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockWallet.id },
          data: {
            balanceDisponible: new Prisma.Decimal(700.0),
          },
        }),
      );
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            walletId: mockWallet.id,
            monto: new Prisma.Decimal(200.0),
            tipo: TransactionType.RECARGA,
          }),
        }),
      );
    });
  });

  describe('freezeBalance', () => {
    it('should freeze amount from available to frozen balance and log CONGELAMIENTO', async () => {
      const updatedWallet = {
        ...mockWallet,
        balanceDisponible: new Prisma.Decimal(450.0),
        balanceCongelado: new Prisma.Decimal(150.0),
      };
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(mockWallet);
      (prisma.wallet.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.wallet.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        updatedWallet,
      );
      (prisma.transaction.create as jest.Mock).mockResolvedValue({
        id: 'tx-freeze-1',
        walletId: mockWallet.id,
        jobAgreementId: 'job-1',
        monto: new Prisma.Decimal(50.0),
        tipo: TransactionType.CONGELAMIENTO,
        descripcion: 'Congelamiento',
        fecha: new Date(),
      });

      const result = await service.freezeBalance({
        userId: 'user-uuid-1',
        amount: 50,
        jobAgreementId: 'job-1',
      });

      expect(prisma.wallet.updateMany).toHaveBeenCalledWith({
        where: {
          id: mockWallet.id,
          balanceDisponible: { gte: new Prisma.Decimal(50) },
        },
        data: {
          balanceDisponible: { decrement: new Prisma.Decimal(50) },
          balanceCongelado: { increment: new Prisma.Decimal(50) },
        },
      });
      expect(result.wallet.balanceDisponible).toBe(450);
      expect(result.wallet.balanceCongelado).toBe(150);
      expect(result.transaction.tipo).toBe(TransactionType.CONGELAMIENTO);
    });

    it('should throw InsufficientBalanceException (HTTP 402) when available balance is below required amount', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        ...mockWallet,
        balanceDisponible: new Prisma.Decimal(30.0),
      });

      await expect(
        service.freezeBalance({ userId: 'user-uuid-1', amount: 50 }),
      ).rejects.toThrow(InsufficientBalanceException);
      expect(prisma.wallet.updateMany).not.toHaveBeenCalled();
    });

    it('should throw InsufficientBalanceException (HTTP 402) if specialist wallet does not exist yet', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.freezeBalance({ userId: 'user-without-wallet', amount: 50 }),
      ).rejects.toThrow(InsufficientBalanceException);
    });

    it('should throw InsufficientBalanceException on concurrent balance race (updateMany count 0)', async () => {
      (prisma.wallet.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockWallet)
        .mockResolvedValueOnce({
          ...mockWallet,
          balanceDisponible: new Prisma.Decimal(10.0),
        });
      (prisma.wallet.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        service.freezeBalance({ userId: 'user-uuid-1', amount: 50 }),
      ).rejects.toThrow(InsufficientBalanceException);
    });
  });

  describe('captureFrozenBalance', () => {
    it('should permanently deduct frozen balance and log PAGO', async () => {
      const updatedWallet = {
        ...mockWallet,
        balanceCongelado: new Prisma.Decimal(50.0),
      };
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(mockWallet);
      (prisma.wallet.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.wallet.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        updatedWallet,
      );
      (prisma.transaction.create as jest.Mock).mockResolvedValue({
        id: 'tx-pago-1',
        walletId: mockWallet.id,
        jobAgreementId: 'job-1',
        monto: new Prisma.Decimal(50.0),
        tipo: TransactionType.PAGO,
        descripcion: 'Pago definitivo',
        fecha: new Date(),
      });

      const result = await service.captureFrozenBalance({
        userId: 'user-uuid-1',
        amount: 50,
        jobAgreementId: 'job-1',
      });

      expect(result.wallet.balanceDisponible).toBe(500);
      expect(result.wallet.balanceCongelado).toBe(50);
      expect(result.transaction.tipo).toBe(TransactionType.PAGO);
    });

    it('should throw ConflictException when frozen balance is insufficient', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        ...mockWallet,
        balanceCongelado: new Prisma.Decimal(20.0),
      });

      await expect(
        service.captureFrozenBalance({ userId: 'user-uuid-1', amount: 50 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('releaseFrozenBalance', () => {
    it('should move frozen balance back to available balance and log DEVOLUCION', async () => {
      const updatedWallet = {
        ...mockWallet,
        balanceDisponible: new Prisma.Decimal(550.0),
        balanceCongelado: new Prisma.Decimal(50.0),
      };
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(mockWallet);
      (prisma.wallet.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.wallet.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        updatedWallet,
      );
      (prisma.transaction.create as jest.Mock).mockResolvedValue({
        id: 'tx-refund-1',
        walletId: mockWallet.id,
        jobAgreementId: 'job-1',
        monto: new Prisma.Decimal(50.0),
        tipo: TransactionType.DEVOLUCION,
        descripcion: 'Devolución',
        fecha: new Date(),
      });

      const result = await service.releaseFrozenBalance({
        userId: 'user-uuid-1',
        amount: 50,
        jobAgreementId: 'job-1',
      });

      expect(result.wallet.balanceDisponible).toBe(550);
      expect(result.wallet.balanceCongelado).toBe(50);
      expect(result.transaction.tipo).toBe(TransactionType.DEVOLUCION);
    });
  });
});

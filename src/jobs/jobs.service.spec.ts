import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JobStatus, Prisma, TransactionType } from '@prisma/client';
import { JobsService } from './jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionManager } from '../common/database/transaction.manager';
import { WalletService } from '../wallet/wallet.service';
import { ChatService } from '../chat/chat.service';
import { InsufficientBalanceException } from '../common/exceptions/insufficient-balance.exception';

describe('JobsService', () => {
  let service: JobsService;
  let prisma: {
    jobAgreement: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let transactionManager: {
    runInTransaction: jest.Mock;
  };
  let walletService: {
    freezeBalance: jest.Mock;
    captureFrozenBalance: jest.Mock;
    releaseFrozenBalance: jest.Mock;
  };
  let chatService: {
    validateRoomAccess: jest.Mock;
  };
  let eventEmitter: {
    emit: jest.Mock;
  };

  const mockRoom = {
    id: 'room-1',
    employerId: 'emp-1',
    specialistId: 'spec-1',
  };

  const baseJobRecord = {
    id: 'job-1',
    roomId: 'room-1',
    title: 'Instalación eléctrica',
    description: 'Cambio de centro de carga',
    agreedPrice: new Prisma.Decimal(850),
    feeAmount: new Prisma.Decimal(50),
    status: JobStatus.PENDING,
    createdById: 'emp-1',
    cancelledById: null,
    cancellationReason: null,
    confirmedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-01-01T10:00:00Z'),
    updatedAt: new Date('2026-01-01T10:00:00Z'),
    room: mockRoom,
  };

  beforeEach(async () => {
    prisma = {
      jobAgreement: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    transactionManager = {
      runInTransaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) =>
        cb(prisma),
      ),
    };

    walletService = {
      freezeBalance: jest.fn(),
      captureFrozenBalance: jest.fn(),
      releaseFrozenBalance: jest.fn(),
    };

    chatService = {
      validateRoomAccess: jest.fn().mockResolvedValue(mockRoom),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionManager, useValue: transactionManager },
        { provide: WalletService, useValue: walletService },
        { provide: ChatService, useValue: chatService },
        { provide: EventEmitter2, useValue: eventEmitter },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  describe('createJob', () => {
    it('should create a PENDING job agreement with $50 fee and emit job_created', async () => {
      prisma.jobAgreement.findFirst.mockResolvedValue(null);
      prisma.jobAgreement.create.mockResolvedValue(baseJobRecord);

      const result = await service.createJob('emp-1', {
        roomId: 'room-1',
        title: 'Instalación eléctrica',
        description: 'Cambio de centro de carga',
        agreedPrice: 850,
      });

      expect(chatService.validateRoomAccess).toHaveBeenCalledWith(
        'emp-1',
        'room-1',
      );
      expect(prisma.jobAgreement.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.jobAgreement.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(createArgs[0].data).toEqual(
        expect.objectContaining({
          roomId: 'room-1',
          status: JobStatus.PENDING,
          feeAmount: new Prisma.Decimal(50),
          createdById: 'emp-1',
        }),
      );
      expect(result.job.feeAmount).toBe(50);
      expect(result.job.agreedPrice).toBe(850);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'job.state_changed',
        expect.objectContaining({
          eventType: 'job_created',
          action: 'CREATED',
          roomId: 'room-1',
        }),
      );
    });

    it('should throw ConflictException if room already has an active job', async () => {
      prisma.jobAgreement.findFirst.mockResolvedValue(baseJobRecord);

      await expect(
        service.createJob('emp-1', { roomId: 'room-1', title: 'Otro trabajo' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.jobAgreement.create).not.toHaveBeenCalled();
    });
  });

  describe('getJobsByRoom & getJobById', () => {
    it('should return activeJob and room job history', async () => {
      prisma.jobAgreement.findMany.mockResolvedValue([
        baseJobRecord,
        { ...baseJobRecord, id: 'job-0', status: JobStatus.COMPLETED },
      ]);

      const result = await service.getJobsByRoom('emp-1', 'room-1');

      expect(result.activeJob?.id).toBe('job-1');
      expect(result.jobs).toHaveLength(2);
    });

    it('should throw NotFoundException if job does not exist', async () => {
      prisma.jobAgreement.findUnique.mockResolvedValue(null);

      await expect(service.getJobById('emp-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not belong to room', async () => {
      prisma.jobAgreement.findUnique.mockResolvedValue(baseJobRecord);

      await expect(service.getJobById('intruder', 'job-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('confirmJob (PENDING -> CONFIRMED)', () => {
    it('should confirm job, freeze $50 MXN via WalletService inside ACID transaction, and emit event', async () => {
      const confirmedRecord = {
        ...baseJobRecord,
        status: JobStatus.CONFIRMED,
        confirmedAt: new Date(),
      };
      const walletSnapshot = {
        id: 'wallet-1',
        userId: 'spec-1',
        balanceDisponible: 150,
        balanceCongelado: 50,
        balanceTotal: 200,
        updatedAt: new Date(),
      };
      const txSnapshot = {
        id: 'tx-1',
        monto: 50,
        tipo: TransactionType.CONGELAMIENTO,
        descripcion: 'Congelamiento',
        fecha: new Date(),
      };

      prisma.jobAgreement.findUnique.mockResolvedValue(baseJobRecord);
      prisma.jobAgreement.updateMany.mockResolvedValue({ count: 1 });
      prisma.jobAgreement.findUniqueOrThrow.mockResolvedValue(confirmedRecord);
      walletService.freezeBalance.mockResolvedValue({
        wallet: walletSnapshot,
        transaction: txSnapshot,
      });

      const result = await service.confirmJob('spec-1', 'job-1');

      expect(transactionManager.runInTransaction).toHaveBeenCalledTimes(1);
      expect(prisma.jobAgreement.updateMany).toHaveBeenCalledTimes(1);
      const updateArgs = prisma.jobAgreement.updateMany.mock.calls[0] as [
        { where: Record<string, unknown>; data: Record<string, unknown> },
      ];
      expect(updateArgs[0].where).toEqual({
        id: 'job-1',
        status: JobStatus.PENDING,
      });
      expect(updateArgs[0].data.status).toBe(JobStatus.CONFIRMED);
      expect(walletService.freezeBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'spec-1',
          amount: 50,
          jobAgreementId: 'job-1',
          tx: prisma,
        }),
      );
      expect(result.job.status).toBe(JobStatus.CONFIRMED);
      expect(result.wallet.balanceCongelado).toBe(50);
      expect(result.transaction.tipo).toBe(TransactionType.CONGELAMIENTO);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'job.state_changed',
        expect.objectContaining({
          eventType: 'job_updated',
          action: 'CONFIRMED',
        }),
      );
    });

    it('should forbid employer from confirming the job', async () => {
      prisma.jobAgreement.findUnique.mockResolvedValue(baseJobRecord);

      await expect(service.confirmJob('emp-1', 'job-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(transactionManager.runInTransaction).not.toHaveBeenCalled();
    });

    it('should propagate InsufficientBalanceException (402) and NOT emit event on rollback', async () => {
      prisma.jobAgreement.findUnique.mockResolvedValue(baseJobRecord);
      prisma.jobAgreement.updateMany.mockResolvedValue({ count: 1 });
      walletService.freezeBalance.mockRejectedValue(
        new InsufficientBalanceException(50, 10),
      );

      await expect(service.confirmJob('spec-1', 'job-1')).rejects.toThrow(
        InsufficientBalanceException,
      );
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('completeJob (CONFIRMED -> COMPLETED)', () => {
    const confirmedJob = { ...baseJobRecord, status: JobStatus.CONFIRMED };

    it('should complete job, permanently deduct frozen $50 MXN via WalletService, and emit event', async () => {
      const completedRecord = {
        ...confirmedJob,
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
      };
      prisma.jobAgreement.findUnique.mockResolvedValue(confirmedJob);
      prisma.jobAgreement.updateMany.mockResolvedValue({ count: 1 });
      prisma.jobAgreement.findUniqueOrThrow.mockResolvedValue(completedRecord);
      walletService.captureFrozenBalance.mockResolvedValue({
        wallet: {
          id: 'wallet-1',
          userId: 'spec-1',
          balanceDisponible: 150,
          balanceCongelado: 0,
          balanceTotal: 150,
          updatedAt: new Date(),
        },
        transaction: {
          id: 'tx-2',
          monto: 50,
          tipo: TransactionType.PAGO,
          descripcion: 'Pago',
          fecha: new Date(),
        },
      });

      const result = await service.completeJob('emp-1', 'job-1');

      expect(transactionManager.runInTransaction).toHaveBeenCalledTimes(1);
      expect(walletService.captureFrozenBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'spec-1',
          amount: 50,
          jobAgreementId: 'job-1',
          tx: prisma,
        }),
      );
      expect(result.job.status).toBe(JobStatus.COMPLETED);
      expect(result.wallet.balanceCongelado).toBe(0);
      expect(result.transaction.tipo).toBe(TransactionType.PAGO);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'job.state_changed',
        expect.objectContaining({ action: 'COMPLETED' }),
      );
    });

    it('should forbid specialist from completing the job', async () => {
      prisma.jobAgreement.findUnique.mockResolvedValue(confirmedJob);

      await expect(service.completeJob('spec-1', 'job-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ConflictException if job is still PENDING', async () => {
      prisma.jobAgreement.findUnique.mockResolvedValue(baseJobRecord);

      await expect(service.completeJob('emp-1', 'job-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('cancelJob (PENDING/CONFIRMED -> CANCELLED)', () => {
    it('should cancel a CONFIRMED job, refund frozen $50 MXN to available balance, and emit event', async () => {
      const confirmedJob = { ...baseJobRecord, status: JobStatus.CONFIRMED };
      const cancelledRecord = {
        ...confirmedJob,
        status: JobStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: 'emp-1',
      };

      prisma.jobAgreement.findUnique
        .mockResolvedValueOnce(confirmedJob)
        .mockResolvedValueOnce(confirmedJob);
      prisma.jobAgreement.updateMany.mockResolvedValue({ count: 1 });
      prisma.jobAgreement.findUniqueOrThrow.mockResolvedValue(cancelledRecord);
      walletService.releaseFrozenBalance.mockResolvedValue({
        wallet: {
          id: 'wallet-1',
          userId: 'spec-1',
          balanceDisponible: 200,
          balanceCongelado: 0,
          balanceTotal: 200,
          updatedAt: new Date(),
        },
        transaction: {
          id: 'tx-3',
          monto: 50,
          tipo: TransactionType.DEVOLUCION,
          descripcion: 'Devolución',
          fecha: new Date(),
        },
      });

      const result = await service.cancelJob('emp-1', 'job-1', {
        reason: 'Cambio de fecha',
      });

      expect(walletService.releaseFrozenBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'spec-1',
          amount: 50,
          jobAgreementId: 'job-1',
          tx: prisma,
        }),
      );
      expect(result.job.status).toBe(JobStatus.CANCELLED);
      expect(result.transaction?.tipo).toBe(TransactionType.DEVOLUCION);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'job.state_changed',
        expect.objectContaining({ action: 'CANCELLED' }),
      );
    });

    it('should cancel a PENDING job without modifying wallet balances', async () => {
      const cancelledRecord = {
        ...baseJobRecord,
        status: JobStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: 'spec-1',
      };

      prisma.jobAgreement.findUnique
        .mockResolvedValueOnce(baseJobRecord)
        .mockResolvedValueOnce(baseJobRecord);
      prisma.jobAgreement.updateMany.mockResolvedValue({ count: 1 });
      prisma.jobAgreement.findUniqueOrThrow.mockResolvedValue(cancelledRecord);

      const result = await service.cancelJob('spec-1', 'job-1');

      expect(walletService.releaseFrozenBalance).not.toHaveBeenCalled();
      expect(result.job.status).toBe(JobStatus.CANCELLED);
      expect(result.wallet).toBeNull();
      expect(result.transaction).toBeNull();
    });

    it('should throw ConflictException when trying to cancel a COMPLETED job', async () => {
      prisma.jobAgreement.findUnique.mockResolvedValue({
        ...baseJobRecord,
        status: JobStatus.COMPLETED,
      });

      await expect(service.cancelJob('emp-1', 'job-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });
});

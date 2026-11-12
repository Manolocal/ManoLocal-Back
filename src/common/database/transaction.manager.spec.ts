import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TransactionClient, TransactionManager } from './transaction.manager';

describe('TransactionManager', () => {
  let manager: TransactionManager;
  let mockPrisma: {
    $transaction: jest.Mock;
  };
  const mockTxClient = {
    wallet: {},
    jobAgreement: {},
    transaction: {},
  } as unknown as TransactionClient;

  beforeEach(async () => {
    mockPrisma = {
      $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) =>
        cb(mockTxClient),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionManager,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    manager = module.get<TransactionManager>(TransactionManager);
  });

  it('should execute callback inside prisma.$transaction and commit result', async () => {
    const result = await manager.runInTransaction(async (tx) => {
      expect(tx).toBe(mockTxClient);
      return Promise.resolve({ committed: true });
    });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ committed: true });
  });

  it('should forward Prisma transaction options when provided', async () => {
    const options = {
      maxWait: 3000,
      timeout: 8000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    };

    await manager.runInTransaction(async () => Promise.resolve('ok'), options);

    expect(mockPrisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      options,
    );
  });

  it('should propagate errors so Prisma triggers an automatic rollback', async () => {
    await expect(
      manager.runInTransaction(async () => {
        return Promise.reject(new Error('DB failure during ACID operation'));
      }),
    ).rejects.toThrow('DB failure during ACID operation');
  });

  it('resolveClient should return active transaction client if provided or PrismaService otherwise', () => {
    expect(manager.resolveClient(mockTxClient)).toBe(mockTxClient);
    expect(manager.resolveClient(undefined)).toBe(mockPrisma);
  });
});

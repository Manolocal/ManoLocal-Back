import { Test, TestingModule } from '@nestjs/testing';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { TransactionType } from '@prisma/client';

describe('WalletController', () => {
  let controller: WalletController;
  let service: jest.Mocked<WalletService>;

  const mockUser = {
    id: 'spec-uuid-1',
    email: 'specialist@test.com',
    name: 'Roberto Electricista',
    role: Role.ESPECIALISTA,
    status: UserStatus.ACTIVO,
  };

  beforeEach(async () => {
    const mockWalletService = {
      getWallet: jest.fn(),
      getTransactions: jest.fn(),
      rechargeWallet: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        {
          provide: WalletService,
          useValue: mockWalletService,
        },
      ],
    }).compile();

    controller = module.get<WalletController>(WalletController);
    service = module.get(WalletService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getBalance', () => {
    it('should return wallet balances', async () => {
      const mockBalance = {
        id: 'w-1',
        userId: 'spec-uuid-1',
        balanceDisponible: 1200,
        balanceCongelado: 300,
        balanceTotal: 1500,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      service.getWallet.mockResolvedValue(mockBalance);

      const result = await controller.getBalance(mockUser);

      expect(service.getWallet).toHaveBeenCalledWith('spec-uuid-1');
      expect(result).toEqual(mockBalance);
    });
  });

  describe('getTransactions', () => {
    it('should return transactions list with pagination', async () => {
      const mockResult = {
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      };
      service.getTransactions.mockResolvedValue(mockResult);

      const query = { page: 1, limit: 10, tipo: TransactionType.RECARGA };
      const result = await controller.getTransactions(mockUser, query);

      expect(service.getTransactions).toHaveBeenCalledWith(
        'spec-uuid-1',
        query,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('mockRecharge', () => {
    it('should call rechargeWallet and return recharge result', async () => {
      const mockResponse = {
        message: 'Recarga simulada exitosa',
        wallet: {
          id: 'w-1',
          userId: 'spec-uuid-1',
          balanceDisponible: 500,
          balanceCongelado: 0,
          balanceTotal: 500,
          updatedAt: new Date(),
        },
        transaction: {
          id: 'tx-1',
          monto: 500,
          tipo: TransactionType.RECARGA,
          descripcion: 'Recarga',
          fecha: new Date(),
        },
      };

      service.rechargeWallet.mockResolvedValue(mockResponse);

      const dto = { monto: 500, descripcion: 'Recarga' };
      const result = await controller.mockRecharge(mockUser, dto);

      expect(service.rechargeWallet).toHaveBeenCalledWith('spec-uuid-1', dto);
      expect(result).toEqual(mockResponse);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    profile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    knowledge: {
      count: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMe', () => {
    it('should throw NotFoundException if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('u-1')).rejects.toThrow(NotFoundException);
    });

    it('should return the user with profile and knowledge', async () => {
      const expectedUser = {
        id: 'u-1',
        email: 'test@test.com',
        profile: { fullName: 'Test User' },
        knowledges: [{ id: 'k-1', name: 'Plomería' }],
      };
      mockPrismaService.user.findUnique.mockResolvedValue(expectedUser);

      const result = await service.getMe('u-1');

      expect(result).toEqual(expectedUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u-1' } }),
      );
    });
  });

  describe('updateProfile', () => {
    it('should throw BadRequestException when creating a profile without fullName', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile('u-1', { phone: '5512345678' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upsert the profile and sync user.name when fullName is provided', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue(null);
      mockPrismaService.profile.upsert.mockResolvedValue({});
      mockPrismaService.user.update.mockResolvedValue({});
      const refreshStatusSpy = jest
        .spyOn(service, 'refreshStatus')
        .mockResolvedValue(UserStatus.INACTIVO);
      jest.spyOn(service, 'getMe').mockResolvedValue({ id: 'u-1' } as never);

      await service.updateProfile('u-1', {
        fullName: 'Josue Barrientos',
        phone: '55 1234 5678',
        address: 'Calle Principal 123',
        postalCode: '01000',
      });

      expect(mockPrismaService.profile.upsert).toHaveBeenCalledWith({
        where: { userId: 'u-1' },
        create: {
          userId: 'u-1',
          fullName: 'Josue Barrientos',
          phone: '55 1234 5678',
          address: 'Calle Principal 123',
          postalCode: '01000',
        },
        update: {
          fullName: 'Josue Barrientos',
          phone: '55 1234 5678',
          address: 'Calle Principal 123',
          postalCode: '01000',
        },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { name: 'Josue Barrientos' },
      });
      expect(refreshStatusSpy).toHaveBeenCalledWith('u-1');
    });

    it('should allow partial updates without touching user.name', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        fullName: 'Josue Barrientos',
      });
      mockPrismaService.profile.upsert.mockResolvedValue({});
      jest
        .spyOn(service, 'refreshStatus')
        .mockResolvedValue(UserStatus.INACTIVO);
      jest.spyOn(service, 'getMe').mockResolvedValue({ id: 'u-1' } as never);

      await service.updateProfile('u-1', { postalCode: '01000' });

      expect(mockPrismaService.profile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { postalCode: '01000' },
        }),
      );
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updateKnowledge', () => {
    it('should throw ForbiddenException for non-especialista roles', async () => {
      await expect(
        service.updateKnowledge('u-1', Role.EMPLEADOR, {
          knowledges: ['Plomería'],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should replace the knowledge list inside a transaction and refresh status', async () => {
      const knowledgeList = [
        { id: 'k-1', name: 'Plomería' },
        { id: 'k-2', name: 'Electricidad' },
      ];
      mockPrismaService.$transaction.mockResolvedValue([]);
      mockPrismaService.knowledge.findMany.mockResolvedValue(knowledgeList);
      const refreshStatusSpy = jest
        .spyOn(service, 'refreshStatus')
        .mockResolvedValue(UserStatus.PENDIENTE_VALIDACION);

      const result = await service.updateKnowledge('u-1', Role.ESPECIALISTA, {
        knowledges: ['Plomería', 'Electricidad', '  Plomería  '],
      });

      expect(mockPrismaService.knowledge.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u-1' },
      });
      expect(mockPrismaService.knowledge.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'u-1', name: 'Plomería' },
          { userId: 'u-1', name: 'Electricidad' },
        ],
      });
      expect(refreshStatusSpy).toHaveBeenCalledWith('u-1');
      expect(result).toEqual(knowledgeList);
    });
  });

  describe('refreshStatus', () => {
    const buildPrismaState = ({
      role = Role.EMPLEADOR,
      status = UserStatus.INACTIVO,
      profile = null,
      knowledgeCount = 0,
    }: {
      role?: Role;
      status?: UserStatus;
      profile?: Record<string, string | null> | null;
      knowledgeCount?: number;
    }) => {
      mockPrismaService.user.findUnique.mockResolvedValue({ role, status });
      mockPrismaService.profile.findUnique.mockResolvedValue(profile);
      mockPrismaService.knowledge.count.mockResolvedValue(knowledgeCount);
      mockPrismaService.user.update.mockResolvedValue({});
    };

    it('should keep INACTIVO when personal data is incomplete', async () => {
      buildPrismaState({
        profile: {
          fullName: 'Josue',
          phone: null,
          address: null,
          postalCode: null,
        },
      });

      const result = await service.refreshStatus('u-1');

      expect(result).toBe(UserStatus.INACTIVO);
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should move an ESPECIALISTA to PENDIENTE_VALIDACION when everything is complete', async () => {
      buildPrismaState({
        role: Role.ESPECIALISTA,
        profile: {
          fullName: 'Josue',
          phone: '5512345678',
          address: 'Calle 1',
          postalCode: '01000',
          ineUrl: 'https://supabase.co/kyc/ine.png',
          selfieUrl: 'https://supabase.co/kyc/selfie.png',
        },
        knowledgeCount: 2,
      });

      const result = await service.refreshStatus('u-1');

      expect(result).toBe(UserStatus.PENDIENTE_VALIDACION);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { status: UserStatus.PENDIENTE_VALIDACION },
      });
    });

    it('should keep an ESPECIALISTA in INACTIVO without knowledge', async () => {
      buildPrismaState({
        role: Role.ESPECIALISTA,
        profile: {
          fullName: 'Josue',
          phone: '5512345678',
          address: 'Calle 1',
          postalCode: '01000',
          ineUrl: 'https://supabase.co/kyc/ine.png',
          selfieUrl: 'https://supabase.co/kyc/selfie.png',
        },
        knowledgeCount: 0,
      });

      const result = await service.refreshStatus('u-1');

      expect(result).toBe(UserStatus.INACTIVO);
    });

    it('should move an EMPLEADOR to PENDIENTE_VALIDACION without requiring knowledge', async () => {
      buildPrismaState({
        role: Role.EMPLEADOR,
        profile: {
          fullName: 'Josue',
          phone: '5512345678',
          address: 'Calle 1',
          postalCode: '01000',
          ineUrl: 'https://supabase.co/kyc/ine.png',
          selfieUrl: 'https://supabase.co/kyc/selfie.png',
        },
      });

      const result = await service.refreshStatus('u-1');

      expect(result).toBe(UserStatus.PENDIENTE_VALIDACION);
    });

    it('should never downgrade an ACTIVO user', async () => {
      buildPrismaState({ status: UserStatus.ACTIVO });

      const result = await service.refreshStatus('u-1');

      expect(result).toBe(UserStatus.ACTIVO);
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if the user no longer exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshStatus('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

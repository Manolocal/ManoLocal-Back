import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { KycService } from './kyc.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageHelper } from '../common/helpers/supabase-storage.helper';
import { UsersService } from '../users/users.service';
import { UserStatus } from '../common/enums/user-status.enum';

describe('KycService', () => {
  let service: KycService;

  const mockPrismaService = {
    profile: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockStorageHelper = {
    uploadFile: jest.fn(),
  };

  const mockUsersService = {
    refreshStatus: jest.fn(),
  };

  const buildFile = (name: string): Express.Multer.File =>
    ({
      fieldname: name,
      originalname: `${name}.jpg`,
      mimetype: 'image/jpeg',
      buffer: Buffer.from('fake'),
      size: 1024,
    }) as Express.Multer.File;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SupabaseStorageHelper, useValue: mockStorageHelper },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<KycService>(KycService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadDocuments', () => {
    it('should throw BadRequestException if INE is missing', async () => {
      await expect(
        service.uploadDocuments('u-1', { selfie: [buildFile('selfie')] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if selfie is missing', async () => {
      await expect(
        service.uploadDocuments('u-1', { ine: [buildFile('ine')] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upload both files, save URLs in the profile and refresh status', async () => {
      const ineUrl = 'https://supabase.co/storage/v1/object/public/kyc/ine.png';
      const selfieUrl =
        'https://supabase.co/storage/v1/object/public/kyc/selfie.png';
      const profileResult = {
        ineUrl,
        selfieUrl,
        user: { status: UserStatus.PENDIENTE_VALIDACION },
      };

      mockStorageHelper.uploadFile
        .mockResolvedValueOnce(ineUrl)
        .mockResolvedValueOnce(selfieUrl);
      mockPrismaService.profile.upsert.mockResolvedValue({});
      mockPrismaService.profile.findUnique.mockResolvedValue(profileResult);
      mockUsersService.refreshStatus.mockResolvedValue(
        UserStatus.PENDIENTE_VALIDACION,
      );

      const result = await service.uploadDocuments('u-1', {
        ine: [buildFile('ine')],
        selfie: [buildFile('selfie')],
      });

      expect(mockStorageHelper.uploadFile).toHaveBeenCalledTimes(2);
      const [ineFile, ineOptions] = mockStorageHelper.uploadFile.mock
        .calls[0] as [Express.Multer.File, { folder: string }];
      expect(ineFile.fieldname).toBe('ine');
      expect(ineOptions.folder).toContain('kyc/u-1');
      expect(mockPrismaService.profile.upsert).toHaveBeenCalledWith({
        where: { userId: 'u-1' },
        create: { userId: 'u-1', ineUrl, selfieUrl },
        update: { ineUrl, selfieUrl },
      });
      expect(mockUsersService.refreshStatus).toHaveBeenCalledWith('u-1');
      expect(result).toEqual(profileResult);
    });
  });
});

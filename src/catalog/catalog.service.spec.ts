import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService, MAX_CATALOG_IMAGES_PER_SPECIALIST } from './catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageHelper } from '../common/helpers/supabase-storage.helper';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';

describe('CatalogService', () => {
  let service: CatalogService;

  const mockPrismaService = {
    catalogImage: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockStorageHelper = {
    getCatalogBucket: jest.fn().mockReturnValue('catalog'),
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
  };

  const buildMockFile = (originalname = 'trabajo.jpg'): Express.Multer.File => ({
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024 * 50,
    buffer: Buffer.from('test-image-data'),
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SupabaseStorageHelper, useValue: mockStorageHelper },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
  });

  describe('uploadImage', () => {
    it('should throw BadRequestException if file is missing', async () => {
      await expect(
        service.uploadImage('user-1', { title: 'Instalación' }, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if specialist has already reached 10 active photos', async () => {
      mockPrismaService.catalogImage.count.mockResolvedValue(MAX_CATALOG_IMAGES_PER_SPECIALIST);

      await expect(
        service.uploadImage('user-1', { title: 'Reparación de fuga' }, buildMockFile()),
      ).rejects.toThrow(BadRequestException);

      expect(mockStorageHelper.uploadFile).not.toHaveBeenCalled();
    });

    it('should upload image to Supabase and persist in database when limit is not reached', async () => {
      mockPrismaService.catalogImage.count.mockResolvedValue(3);
      mockStorageHelper.uploadFile.mockResolvedValue('https://storage.supabase.co/catalog/user-1/foto.jpg');

      const createdImage = {
        id: 'img-123',
        userId: 'user-1',
        imageUrl: 'https://storage.supabase.co/catalog/user-1/foto.jpg',
        title: 'Instalación de regadera',
        description: 'Tubería de cobre',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaService.catalogImage.create.mockResolvedValue(createdImage);

      const result = await service.uploadImage(
        'user-1',
        { title: '  Instalación de regadera  ', description: '  Tubería de cobre  ' },
        buildMockFile(),
      );

      expect(mockStorageHelper.uploadFile).toHaveBeenCalledWith(expect.any(Object), {
        bucket: 'catalog',
        folder: 'catalog/user-1',
      });
      expect(mockPrismaService.catalogImage.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          imageUrl: 'https://storage.supabase.co/catalog/user-1/foto.jpg',
          title: 'Instalación de regadera',
          description: 'Tubería de cobre',
        },
        select: expect.any(Object),
      });
      expect(result.message).toBe('Foto subida exitosamente al catálogo');
      expect(result.quota).toEqual({
        active: 4,
        limit: 10,
        remaining: 6,
      });
    });
  });

  describe('getMyImages', () => {
    it('should return active images and remaining quota for authenticated specialist', async () => {
      const mockImages = [
        {
          id: 'img-1',
          userId: 'spec-1',
          imageUrl: 'https://example.com/img1.jpg',
          title: 'Trabajo 1',
          description: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrismaService.catalogImage.findMany.mockResolvedValue(mockImages);

      const result = await service.getMyImages('spec-1');
      expect(mockPrismaService.catalogImage.findMany).toHaveBeenCalledWith({
        where: { userId: 'spec-1', isActive: true },
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
      expect(result.images).toHaveLength(1);
      expect(result.quota).toEqual({
        active: 1,
        limit: 10,
        remaining: 9,
      });
    });
  });

  describe('getSpecialistImages', () => {
    it('should throw NotFoundException if specialist does not exist or is inactive', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getSpecialistImages('unknown-id')).rejects.toThrow(
        NotFoundException,
      );

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        name: 'Inactivo',
        role: Role.ESPECIALISTA,
        status: UserStatus.INACTIVO,
      });

      await expect(service.getSpecialistImages('u-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if user is not a specialist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        name: 'Cliente',
        role: Role.EMPLEADOR,
        status: UserStatus.ACTIVO,
      });

      await expect(service.getSpecialistImages('u-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return public catalog for valid specialist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'spec-1',
        name: 'Juan Perez',
        role: Role.ESPECIALISTA,
        status: UserStatus.ACTIVO,
      });
      mockPrismaService.catalogImage.findMany.mockResolvedValue([
        {
          id: 'img-1',
          userId: 'spec-1',
          imageUrl: 'https://example.com/img1.jpg',
          title: 'Reparación de tejado',
          description: 'Tejas francesas',
          createdAt: new Date(),
        },
      ]);

      const result = await service.getSpecialistImages('spec-1');
      expect(result.specialist).toEqual({ id: 'spec-1', name: 'Juan Perez' });
      expect(result.images).toHaveLength(1);
    });
  });

  describe('deleteImage', () => {
    it('should throw NotFoundException if image does not exist or isActive is false', async () => {
      mockPrismaService.catalogImage.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteImage('user-1', Role.ESPECIALISTA, 'img-not-found'),
      ).rejects.toThrow(NotFoundException);

      mockPrismaService.catalogImage.findUnique.mockResolvedValue({
        id: 'img-inactive',
        userId: 'user-1',
        isActive: false,
      });

      await expect(
        service.deleteImage('user-1', Role.ESPECIALISTA, 'img-inactive'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if specialist tries to delete someone else photo', async () => {
      mockPrismaService.catalogImage.findUnique.mockResolvedValue({
        id: 'img-other',
        userId: 'other-specialist',
        isActive: true,
      });

      await expect(
        service.deleteImage('user-1', Role.ESPECIALISTA, 'img-other'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow owner specialist to soft delete image', async () => {
      mockPrismaService.catalogImage.findUnique.mockResolvedValue({
        id: 'img-1',
        userId: 'user-1',
        isActive: true,
      });
      mockPrismaService.catalogImage.update.mockResolvedValue({});

      const result = await service.deleteImage('user-1', Role.ESPECIALISTA, 'img-1');
      expect(mockPrismaService.catalogImage.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: {
          isActive: false,
          deletedAt: expect.any(Date),
        },
      });
      expect(result.message).toBe('Foto eliminada exitosamente del catálogo');
    });

    it('should allow admin to delete any photo', async () => {
      mockPrismaService.catalogImage.findUnique.mockResolvedValue({
        id: 'img-spec',
        userId: 'some-spec',
        isActive: true,
      });
      mockPrismaService.catalogImage.update.mockResolvedValue({});

      const result = await service.deleteImage('admin-1', Role.ADMIN, 'img-spec');
      expect(mockPrismaService.catalogImage.update).toHaveBeenCalledWith({
        where: { id: 'img-spec' },
        data: {
          isActive: false,
          deletedAt: expect.any(Date),
        },
      });
      expect(result.message).toBe('Foto eliminada exitosamente del catálogo');
    });
  });
});

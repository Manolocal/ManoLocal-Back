import { Test, TestingModule } from '@nestjs/testing';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { UploadCatalogImageDto } from './dto/upload-catalog-image.dto';

describe('CatalogController', () => {
  let controller: CatalogController;

  const mockCatalogService = {
    uploadImage: jest.fn(),
    getMyImages: jest.fn(),
    getSpecialistImages: jest.fn(),
    deleteImage: jest.fn(),
  };

  const mockUser: AuthUser = {
    id: 'user-uuid-1',
    email: 'especialista@test.com',
    name: 'Carlos Especialista',
    role: Role.ESPECIALISTA,
    status: UserStatus.ACTIVO,
  };

  const mockFile = {
    fieldname: 'file',
    originalname: 'foto.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('test'),
  } as Express.Multer.File;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        {
          provide: CatalogService,
          useValue: mockCatalogService,
        },
      ],
    }).compile();

    controller = module.get<CatalogController>(CatalogController);
  });

  it('should call uploadImage on service with correct arguments', async () => {
    const dto: UploadCatalogImageDto = {
      title: 'Cambio de cerradura',
      description: 'Chapa de seguridad',
    };
    const expectedResponse = {
      message: 'Foto subida exitosamente al catálogo',
      image: { id: 'img-1' },
      quota: { active: 1, limit: 10, remaining: 9 },
    };
    mockCatalogService.uploadImage.mockResolvedValue(expectedResponse);

    const result = await controller.uploadImage(mockUser, mockFile, dto);

    expect(mockCatalogService.uploadImage).toHaveBeenCalledWith(
      mockUser.id,
      dto,
      mockFile,
    );
    expect(result).toEqual(expectedResponse);
  });

  it('should call getMyImages on service', async () => {
    const expectedResponse = {
      images: [],
      quota: { active: 0, limit: 10, remaining: 10 },
    };
    mockCatalogService.getMyImages.mockResolvedValue(expectedResponse);

    const result = await controller.getMyImages(mockUser);

    expect(mockCatalogService.getMyImages).toHaveBeenCalledWith(mockUser.id);
    expect(result).toEqual(expectedResponse);
  });

  it('should call getSpecialistImages on service', async () => {
    const specialistId = 'spec-uuid-2';
    const expectedResponse = {
      specialist: { id: specialistId, name: 'Pedro' },
      images: [],
    };
    mockCatalogService.getSpecialistImages.mockResolvedValue(expectedResponse);

    const result = await controller.getSpecialistImages(specialistId);

    expect(mockCatalogService.getSpecialistImages).toHaveBeenCalledWith(
      specialistId,
    );
    expect(result).toEqual(expectedResponse);
  });

  it('should call deleteImage on service with user id, role and image id', async () => {
    const imageId = 'img-uuid-3';
    const expectedResponse = {
      message: 'Foto eliminada exitosamente del catálogo',
    };
    mockCatalogService.deleteImage.mockResolvedValue(expectedResponse);

    const result = await controller.deleteImage(mockUser, imageId);

    expect(mockCatalogService.deleteImage).toHaveBeenCalledWith(
      mockUser.id,
      mockUser.role,
      imageId,
    );
    expect(result).toEqual(expectedResponse);
  });
});


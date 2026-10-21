import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageHelper } from '../common/helpers/supabase-storage.helper';
import { OCR_PROVIDER, OcrProvider } from './interfaces/ocr-provider.interface';
import { Role } from '../common/enums/role.enum';
import { DocumentVerificationStatus } from '../common/enums/document-verification-status.enum';

describe('AiService', () => {
  let service: AiService;

  const mockPrismaService = {
    knowledge: {
      findUnique: jest.fn(),
    },
    documentVerification: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockStorageHelper = {
    uploadFile: jest.fn(),
  };

  const ocrProviderMock = {
    verifyDocument: jest.fn(),
  };

  const mockOcrProvider: OcrProvider = ocrProviderMock;

  const buildFile = (): Express.Multer.File =>
    ({
      fieldname: 'document',
      originalname: 'diploma.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('fake'),
      size: 2048,
    }) as Express.Multer.File;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SupabaseStorageHelper, useValue: mockStorageHelper },
        { provide: OCR_PROVIDER, useValue: mockOcrProvider },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyDocument', () => {
    it('should reject non-especialista roles', async () => {
      await expect(
        service.verifyDocument(
          'u-1',
          Role.EMPLEADOR,
          { knowledgeId: 'k-1' },
          buildFile(),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should require a document file', async () => {
      await expect(
        service.verifyDocument(
          'u-1',
          Role.ESPECIALISTA,
          { knowledgeId: 'k-1' },
          undefined,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if knowledge does not exist', async () => {
      mockPrismaService.knowledge.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyDocument(
          'u-1',
          Role.ESPECIALISTA,
          { knowledgeId: 'k-1' },
          buildFile(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if knowledge belongs to another user', async () => {
      mockPrismaService.knowledge.findUnique.mockResolvedValue({
        id: 'k-1',
        name: 'Plomería',
        userId: 'otro-usuario',
      });

      await expect(
        service.verifyDocument(
          'u-1',
          Role.ESPECIALISTA,
          { knowledgeId: 'k-1' },
          buildFile(),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should upload the file, run OCR and persist VALIDATED status', async () => {
      const fileUrl =
        'https://supabase.co/storage/v1/object/public/kyc/documents/u-1/k-1/diploma.pdf';
      const verification = {
        id: 'v-1',
        knowledgeId: 'k-1',
        fileUrl,
        status: DocumentVerificationStatus.VALIDATED,
        provider: 'mock',
        score: 1,
        reason: 'Validación simulada exitosa',
        createdAt: new Date(),
      };

      mockPrismaService.knowledge.findUnique.mockResolvedValue({
        id: 'k-1',
        name: 'Plomería',
        userId: 'u-1',
      });
      mockStorageHelper.uploadFile.mockResolvedValue(fileUrl);
      ocrProviderMock.verifyDocument.mockResolvedValue({
        isValid: true,
        provider: 'mock',
        score: 1,
        reason: 'Validación simulada exitosa',
      });
      mockPrismaService.documentVerification.create.mockResolvedValue(
        verification,
      );

      const result = await service.verifyDocument(
        'u-1',
        Role.ESPECIALISTA,
        { knowledgeId: 'k-1' },
        buildFile(),
      );

      expect(mockStorageHelper.uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({ fieldname: 'document' }),
        { folder: 'documents/u-1/k-1' },
      );
      expect(ocrProviderMock.verifyDocument).toHaveBeenCalledWith(
        expect.objectContaining({ fileUrl, knowledgeName: 'Plomería' }),
      );
      const createMock = mockPrismaService.documentVerification.create;
      const createArgs = createMock.mock.calls[0] as [
        {
          data: {
            knowledgeId: string;
            fileUrl: string;
            status: DocumentVerificationStatus;
            provider: string;
          };
        },
      ];
      expect(createArgs[0].data.knowledgeId).toBe('k-1');
      expect(createArgs[0].data.fileUrl).toBe(fileUrl);
      expect(createArgs[0].data.status).toBe(
        DocumentVerificationStatus.VALIDATED,
      );
      expect(createArgs[0].data.provider).toBe('mock');
      expect(result).toEqual(verification);
    });

    it('should persist REJECTED when the provider returns an invalid result', async () => {
      mockPrismaService.knowledge.findUnique.mockResolvedValue({
        id: 'k-1',
        name: 'Plomería',
        userId: 'u-1',
      });
      mockStorageHelper.uploadFile.mockResolvedValue('https://file.url');
      ocrProviderMock.verifyDocument.mockResolvedValue({
        isValid: false,
        provider: 'mock',
        score: 0,
        reason: 'Documento ilegible',
      });
      mockPrismaService.documentVerification.create.mockResolvedValue({
        id: 'v-2',
        status: DocumentVerificationStatus.REJECTED,
      });

      await service.verifyDocument(
        'u-1',
        Role.ESPECIALISTA,
        { knowledgeId: 'k-1' },
        buildFile(),
      );

      const createMock = mockPrismaService.documentVerification.create;
      const createArgs = createMock.mock.calls[0] as [
        { data: { status: DocumentVerificationStatus } },
      ];
      expect(createArgs[0].data.status).toBe(
        DocumentVerificationStatus.REJECTED,
      );
    });
  });

  describe('getKnowledgeVerifications', () => {
    it('should throw ForbiddenException if the knowledge is not owned by the user', async () => {
      mockPrismaService.knowledge.findUnique.mockResolvedValue({
        id: 'k-1',
        userId: 'otro-usuario',
      });

      await expect(
        service.getKnowledgeVerifications('u-1', 'k-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return the verification history for the owned knowledge', async () => {
      const history = [{ id: 'v-1' }, { id: 'v-2' }];
      mockPrismaService.knowledge.findUnique.mockResolvedValue({
        id: 'k-1',
        userId: 'u-1',
      });
      mockPrismaService.documentVerification.findMany.mockResolvedValue(
        history,
      );

      const result = await service.getKnowledgeVerifications('u-1', 'k-1');

      expect(result).toEqual(history);
      expect(
        mockPrismaService.documentVerification.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ where: { knowledgeId: 'k-1' } }),
      );
    });
  });
});

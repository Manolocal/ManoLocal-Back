import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageHelper } from '../common/helpers/supabase-storage.helper';
import { Role } from '../common/enums/role.enum';
import { DocumentVerificationStatus } from '../common/enums/document-verification-status.enum';
import { OCR_PROVIDER } from './interfaces/ocr-provider.interface';
import type { OcrProvider } from './interfaces/ocr-provider.interface';
import { VerifyDocumentDto } from './dto/verify-document.dto';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageHelper,
    @Inject(OCR_PROVIDER) private readonly ocrProvider: OcrProvider,
  ) {}

  /**
   * Verifica un documento (diploma/certificado) que respalda un conocimiento.
   *
   * Flujo: valida propiedad -> sube el archivo a Supabase Storage ->
   * analiza con el proveedor de OCR -> persiste el resultado en
   * `DocumentVerification`.
   */
  async verifyDocument(
    userId: string,
    role: Role,
    dto: VerifyDocumentDto,
    file?: Express.Multer.File,
  ) {
    if (role !== Role.ESPECIALISTA) {
      throw new ForbiddenException(
        'Solo los especialistas pueden validar documentos',
      );
    }

    if (!file) {
      throw new BadRequestException(
        'Debes adjuntar el documento (campo "document")',
      );
    }

    const knowledge = await this.prisma.knowledge.findUnique({
      where: { id: dto.knowledgeId },
      select: { id: true, name: true, userId: true },
    });

    if (!knowledge) {
      throw new NotFoundException('El conocimiento indicado no existe');
    }

    if (knowledge.userId !== userId) {
      throw new ForbiddenException(
        'El conocimiento no pertenece al usuario autenticado',
      );
    }

    const fileUrl = await this.storage.uploadFile(file, {
      folder: `documents/${userId}/${knowledge.id}`,
    });

    const result = await this.ocrProvider.verifyDocument({
      fileUrl,
      knowledgeName: knowledge.name,
      mimeType: file.mimetype,
    });

    const verification = await this.prisma.documentVerification.create({
      data: {
        knowledgeId: knowledge.id,
        fileUrl,
        status: result.isValid
          ? DocumentVerificationStatus.VALIDATED
          : DocumentVerificationStatus.REJECTED,
        provider: result.provider,
        score: result.score,
        reason: result.reason,
      },
      select: {
        id: true,
        knowledgeId: true,
        fileUrl: true,
        status: true,
        provider: true,
        score: true,
        reason: true,
        createdAt: true,
      },
    });

    return verification;
  }

  /** Historial de verificaciones de un conocimiento del usuario autenticado. */
  async getKnowledgeVerifications(userId: string, knowledgeId: string) {
    const knowledge = await this.prisma.knowledge.findUnique({
      where: { id: knowledgeId },
      select: { id: true, userId: true },
    });

    if (!knowledge) {
      throw new NotFoundException('El conocimiento indicado no existe');
    }

    if (knowledge.userId !== userId) {
      throw new ForbiddenException(
        'El conocimiento no pertenece al usuario autenticado',
      );
    }

    return this.prisma.documentVerification.findMany({
      where: { knowledgeId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

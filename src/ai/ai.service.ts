import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageHelper } from '../common/helpers/supabase-storage.helper';
import { Role } from '../common/enums/role.enum';
import { DocumentVerificationStatus } from '../common/enums/document-verification-status.enum';
import { OCR_PROVIDER } from './interfaces/ocr-provider.interface';
import type { OcrProvider } from './interfaces/ocr-provider.interface';
import { VerifyDocumentDto } from './dto/verify-document.dto';
import { GeminiService, GenerateOptions } from './gemini.service';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageHelper,
    @Inject(OCR_PROVIDER) private readonly ocrProvider: OcrProvider,
    @Optional() private readonly geminiService?: GeminiService,
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
      fileBuffer: file.buffer,
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

  // =========================================================================
  // MÉTODOS GENERALES DE IA (Para uso en cualquier módulo del sistema)
  // =========================================================================

  /** Indica si la API de Gemini está configurada y lista en el sistema. */
  isGeminiConfigured(): boolean {
    return this.geminiService?.isAvailable() ?? false;
  }

  /** Obtiene el modelo Gemini configurado actualmente. */
  getGeminiModelName(): string {
    return this.geminiService?.getModelName() ?? 'gemini-2.5-flash';
  }

  /**
   * Generación de texto general con Gemini.
   * Útil para: resúmenes, descripciones de oficios, asistencia en disputas, etc.
   */
  async generateText(
    prompt: string,
    options?: GenerateOptions,
  ): Promise<string> {
    if (!this.geminiService || !this.geminiService.isAvailable()) {
      return `[Mock AI Response] ${prompt.substring(0, 80)}...`;
    }
    return this.geminiService.generateText(prompt, options);
  }

  /**
   * Generación estructurada en JSON con Gemini.
   * Útil para: clasificación, extracción de entidades, moderación de reseñas, etc.
   */
  async generateJson<T>(
    prompt: string,
    options?: GenerateOptions,
  ): Promise<T> {
    if (!this.geminiService || !this.geminiService.isAvailable()) {
      return { mock: true, prompt: prompt.substring(0, 50) } as unknown as T;
    }
    return this.geminiService.generateJson<T>(prompt, options);
  }

  /**
   * Análisis multimodal de imágenes o documentos con Gemini Vision.
   */
  async analyzeFile(
    fileBuffer: Buffer,
    mimeType: string,
    prompt: string,
    options?: GenerateOptions,
  ): Promise<string> {
    if (!this.geminiService || !this.geminiService.isAvailable()) {
      return `[Mock Vision Analysis] Archivo de tipo ${mimeType} analizado correctamente.`;
    }
    return this.geminiService.analyzeFile(fileBuffer, mimeType, prompt, options);
  }
}

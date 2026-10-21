import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentValidationInput,
  DocumentValidationResult,
  OcrProvider,
} from '../interfaces/ocr-provider.interface';

/**
 * Proveedor simulado de OCR.
 *
 * Devuelve una validación "Mock" exitosa mientras se conecta el LLM
 * definitivo (Gemini) en futuras fases. Cuando exista un proveedor real,
 * basta con registrar otro provider para el token `OCR_PROVIDER`.
 */
@Injectable()
export class MockOcrProvider implements OcrProvider {
  private readonly logger = new Logger(MockOcrProvider.name);

  verifyDocument(
    input: DocumentValidationInput,
  ): Promise<DocumentValidationResult> {
    this.logger.log(
      `[Mock OCR] Documento validado automáticamente para el conocimiento "${input.knowledgeName}"`,
    );

    return Promise.resolve({
      isValid: true,
      provider: 'mock',
      score: 1,
      reason: `Validación simulada exitosa. El documento respalda el conocimiento "${input.knowledgeName}".`,
    });
  }
}

export interface DocumentValidationInput {
  /** URL pública/persistida del documento a analizar */
  fileUrl: string;
  /** Nombre del conocimiento que el documento debe respaldar */
  knowledgeName: string;
  mimeType?: string;
  /** Buffer del archivo en memoria para análisis directo multimodal */
  fileBuffer?: Buffer;
}

/** Resultado de una verificación de documento */
export interface DocumentValidationResult {
  /** true => VALIDATED, false => REJECTED */
  isValid: boolean;
  /** Identificador del proveedor que realizó el análisis (ej. `mock`, `gemini`) */
  provider: string;
  /** Confianza del resultado entre 0 y 1 */
  score?: number;
  /** Explicación legible del resultado */
  reason?: string;
}

/**
 * Contrato del motor de validación de documentos.
 *
 * Implementado por `GeminiOcrProvider` (visión multimodal con Google Gemini)
 * y desacoplado de `AiService` mediante inyección de dependencias.
 */
export const OCR_PROVIDER = 'OCR_PROVIDER';

export interface OcrProvider {
  verifyDocument(
    input: DocumentValidationInput,
  ): Promise<DocumentValidationResult>;
}

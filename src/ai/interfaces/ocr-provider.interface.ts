/** Entrada del motor de OCR */
export interface DocumentValidationInput {
  /** URL pública/persistida del documento a analizar */
  fileUrl: string;
  /** Nombre del conocimiento que el documento debe respaldar */
  knowledgeName: string;
  mimeType?: string;
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
 * Hoy lo implementa `MockOcrProvider`; en fases futuras se podrá conectar
 * Gemini/OpenAI/OpenCV implementando esta misma interfaz, sin tocar el
 * `AiService` ni el resto de la lógica de negocio.
 */
export const OCR_PROVIDER = 'OCR_PROVIDER';

export interface OcrProvider {
  verifyDocument(
    input: DocumentValidationInput,
  ): Promise<DocumentValidationResult>;
}

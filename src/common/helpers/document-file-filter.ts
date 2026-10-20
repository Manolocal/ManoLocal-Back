import { BadRequestException } from '@nestjs/common';

const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

/**
 * Filtro de Multer reutilizable: acepta documentos PDF o imágenes
 * (JPG, PNG, WEBP). Usar en el endpoint de verificación de documentos (OCR).
 */
export const documentFileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
    cb(
      new BadRequestException(
        `Formato de documento no válido (${file.mimetype}). Usa PDF, JPG, PNG o WEBP`,
      ),
      false,
    );
    return;
  }
  cb(null, true);
};

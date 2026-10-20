import { BadRequestException } from '@nestjs/common';

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Filtro de Multer reutilizable: solo acepta imágenes JPG, PNG o WEBP.
 * Usar en los `*FileInterceptor` de cualquier módulo que suba fotos.
 */
export const imageFileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    cb(
      new BadRequestException(
        `Formato de imagen no válido (${file.mimetype}). Usa JPG, PNG o WEBP`,
      ),
      false,
    );
    return;
  }
  cb(null, true);
};

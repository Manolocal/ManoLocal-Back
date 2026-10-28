import {
  Injectable,
  PipeTransform,
  BadRequestException,
} from '@nestjs/common';

export interface FileValidationPipeOptions {
  /** Límite de tamaño máximo en Megabytes (por defecto 5 MB) */
  maxSizeMb?: number;
  /** Lista de tipos MIME permitidos (por defecto JPG, JPEG, PNG, WEBP) */
  allowedMimes?: string[];
  /** Expresión regular para validar extensiones permitidas */
  allowedExtensions?: RegExp;
  /** Si el archivo es obligatorio (por defecto true) */
  required?: boolean;
}

const DEFAULT_ALLOWED_MIMES = [
  'image/jpeg',
  'image/pjpeg',
  'image/png',
  'image/webp',
];

const DEFAULT_ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

/**
 * Pipe de validación reutilizable para archivos recibidos vía Multer.
 * Valida presencia, tamaño máximo en MB, tipo MIME y extensión de archivo.
 */
@Injectable()
export class FileValidationPipe
  implements PipeTransform<Express.Multer.File, Express.Multer.File>
{
  private readonly maxSizeMb: number;
  private readonly allowedMimes: string[];
  private readonly allowedExtensions: RegExp;
  private readonly required: boolean;

  constructor(options: FileValidationPipeOptions = {}) {
    this.maxSizeMb = options.maxSizeMb ?? 5;
    this.allowedMimes = options.allowedMimes ?? DEFAULT_ALLOWED_MIMES;
    this.allowedExtensions =
      options.allowedExtensions ?? DEFAULT_ALLOWED_EXTENSIONS;
    this.required = options.required ?? true;
  }

  transform(file?: Express.Multer.File): Express.Multer.File {
    if (!file) {
      if (this.required) {
        throw new BadRequestException('Debe adjuntar una imagen válida');
      }
      return file as unknown as Express.Multer.File;
    }

    const maxSizeBytes = this.maxSizeMb * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new BadRequestException(
        `El tamaño del archivo no debe exceder ${this.maxSizeMb}MB`,
      );
    }

    const normalizedMime = (file.mimetype || '').toLowerCase();
    if (!this.allowedMimes.includes(normalizedMime)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido (${file.mimetype}). Solo se permiten: JPG, JPEG, PNG, WEBP`,
      );
    }

    if (!this.allowedExtensions.test(file.originalname || '')) {
      throw new BadRequestException(
        `Extensión de archivo no permitida. Solo se permiten extensiones .jpg, .jpeg, .png, .webp`,
      );
    }

    return file;
  }
}


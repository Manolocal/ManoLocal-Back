import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface UploadFileOptions {
  /** Carpeta lógica dentro del bucket (ej. `kyc/{userId}/ine`) */
  folder?: string;
  /** Bucket de Supabase Storage a usar. Por defecto, el definido en `SUPABASE_STORAGE_BUCKET` */
  bucket?: string;
}

/**
 * Helper de carga de archivos en Supabase Storage.
 *
 * Centraliza la conexión con el bucket para que cualquier módulo
 * (KYC, catálogo de fotos, etc.) pueda reutilizar `uploadFile(file)`.
 */
@Injectable()
export class SupabaseStorageHelper {
  private readonly logger = new Logger(SupabaseStorageHelper.name);
  private readonly client?: SupabaseClient;
  private readonly defaultBucket: string;

  constructor(configService: ConfigService) {
    const supabaseUrl = configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    this.defaultBucket =
      configService.get<string>('SUPABASE_STORAGE_BUCKET') ?? 'kyc';

    if (!supabaseUrl || !serviceRoleKey) {
      this.logger.warn(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no definidas: la carga de archivos estará deshabilitada',
      );
      return;
    }

    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /**
   * Sube un archivo (en memoria, Multer MemoryStorage) al bucket de
   * Supabase Storage y devuelve su URL pública.
   */
  async uploadFile(
    file: Express.Multer.File,
    options: UploadFileOptions = {},
  ): Promise<string> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'El servicio de almacenamiento no está configurado (faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
      );
    }

    const bucket = options.bucket ?? this.defaultBucket;
    const folder = (options.folder ?? 'common').replace(/^\/+|\/+$/g, '');
    const objectPath = `${folder}/${Date.now()}-${this.sanitizeFileName(file.originalname)}`;

    const { error } = await this.client.storage
      .from(bucket)
      .upload(objectPath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      this.logger.error(
        `Supabase Storage upload falló (${objectPath}): ${error.message}`,
      );
      throw new InternalServerErrorException(
        'No se pudo subir el archivo al almacenamiento',
      );
    }

    const { data } = this.client.storage.from(bucket).getPublicUrl(objectPath);
    return data.publicUrl;
  }

  private sanitizeFileName(originalName: string): string {
    return originalName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .toLowerCase();
  }
}

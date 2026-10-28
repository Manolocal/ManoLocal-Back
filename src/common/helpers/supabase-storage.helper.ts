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
  /** Sobrescribir el archivo si ya existe en esa ruta. Por defecto `false`. */
  upsert?: boolean;
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
  private readonly catalogBucket: string;

  constructor(configService: ConfigService) {
    const supabaseUrl = configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    this.defaultBucket =
      configService.get<string>('SUPABASE_STORAGE_BUCKET') ?? 'kyc';
    this.catalogBucket =
      configService.get<string>('SUPABASE_CATALOG_BUCKET') ?? 'catalog';

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
        upsert: options.upsert ?? false,
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

  /**
   * Genera una URL firmada temporal con token criptográfico para buckets privados (ej. KYC).
   *
   * @param objectPathOrUrl Ruta relativa o URL completa del archivo en el bucket.
   * @param expiresInSeconds Tiempo de validez del enlace en segundos (por defecto 3600 = 1 hora).
   * @param bucket Nombre del bucket (por defecto defaultBucket, ej. 'kyc').
   */
  async createSignedUrl(
    objectPathOrUrl: string,
    expiresInSeconds = 3600,
    bucket?: string,
  ): Promise<string> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'El servicio de almacenamiento no está configurado (faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
      );
    }

    const targetBucket = bucket ?? this.defaultBucket;
    const cleanPath = this.extractObjectPath(objectPathOrUrl, targetBucket);

    const { data, error } = await this.client.storage
      .from(targetBucket)
      .createSignedUrl(cleanPath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      this.logger.error(
        `Error al generar URL firmada para (${targetBucket}/${cleanPath}): ${error?.message}`,
      );
      throw new InternalServerErrorException(
        'No se pudo generar la URL segura de visualización',
      );
    }

    return data.signedUrl;
  }

  /**
   * Elimina un archivo físicamente de Supabase Storage.
   *
   * @param objectPathOrUrl Ruta relativa o URL completa del archivo a eliminar.
   * @param bucket Bucket donde reside el archivo (por defecto defaultBucket).
   */
  async deleteFile(objectPathOrUrl: string, bucket?: string): Promise<void> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'El servicio de almacenamiento no está configurado (faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
      );
    }

    const targetBucket = bucket ?? this.defaultBucket;
    const cleanPath = this.extractObjectPath(objectPathOrUrl, targetBucket);

    const { error } = await this.client.storage
      .from(targetBucket)
      .remove([cleanPath]);

    if (error) {
      this.logger.warn(
        `No se pudo eliminar el archivo físico de Supabase Storage (${targetBucket}/${cleanPath}): ${error.message}`,
      );
    }
  }

  /** Retorna el nombre configurado para el bucket de catálogo público. */
  getCatalogBucket(): string {
    return this.catalogBucket;
  }

  /**
   * Extrae la ruta relativa interna del archivo dentro del bucket en caso de recibir una URL completa.
   */
  private extractObjectPath(urlOrPath: string, bucket: string): string {
    if (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
      return urlOrPath.replace(/^\/+|\/+$/g, '');
    }

    try {
      const url = new URL(urlOrPath);
      const segments = url.pathname.split(`/${bucket}/`);
      if (segments.length > 1) {
        return decodeURIComponent(segments[1].split('?')[0]);
      }
    } catch {
      // Ignorar error de parsing y retornar fallback
    }

    return urlOrPath;
  }

  private sanitizeFileName(originalName: string): string {
    return originalName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .toLowerCase();
  }
}

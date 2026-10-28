import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { HttpClient } from '../../common/http/http-client.service';
import { CacheEntry } from '../interfaces/cache-entry.interface';
import {
  CopomexCpByMunicipioResponse,
  CopomexInfoCpResponse,
  CopomexCpInfoItem,
} from '../interfaces/copomex.interface';

const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

@Injectable()
export class CopomexService {
  private readonly logger = new Logger(CopomexService.name);
  private readonly apiUrl: string;
  private readonly token: string;

  // Cachés en memoria con TTL de 24 horas (BACK-05)
  private readonly cpToMunicipioCache = new Map<string, CacheEntry<string>>();
  private readonly municipioToCpsCache = new Map<string, CacheEntry<string[]>>();

  constructor(
    private readonly httpClient: HttpClient,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiUrl = (
      this.configService.get<string>('COPOMEX_API_URL') ||
      'https://api.copomex.com/query'
    ).replace(/\/$/, '');
    this.token = this.configService.get<string>('COPOMEX_TOKEN') || 'pruebas';
  }

  /**
   * Obtiene el nombre del Municipio correspondiente a un Código Postal.
   * Prioriza la base de datos nacional SEPOMEX en Supabase (0 consumo de créditos);
   * si no existiera, recurre a la API externa de Copomex como fallback resiliente.
   */
  async getMunicipioByCp(postalCode: string): Promise<string> {
    const cleanCp = postalCode.trim();
    const cached = this.cpToMunicipioCache.get(cleanCp);

    if (cached && Date.now() < cached.expiresAt) {
      this.logger.debug(
        `[CACHE HIT] Municipio para CP ${cleanCp}: '${cached.data}'`,
      );
      return cached.data;
    }

    // 1. Consultar base de datos local en Supabase (159,382 registros SEPOMEX)
    try {
      const dbRecord = await this.prisma.sepomexPostalCode.findFirst({
        where: { postalCode: cleanCp },
        select: { municipio: true },
      });

      if (dbRecord && dbRecord.municipio) {
        const municipio = dbRecord.municipio.trim();
        this.cpToMunicipioCache.set(cleanCp, {
          data: municipio,
          expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS,
        });
        return municipio;
      }
    } catch (dbError) {
      this.logger.warn(
        `Error al buscar CP ${cleanCp} en Supabase, recurriendo a Copomex: ${dbError?.message || dbError}`,
      );
    }

    // 2. Fallback: Consultar API de Copomex externa
    try {
      const url = `${this.apiUrl}/info_cp/${cleanCp}?type=simplified&token=${this.token}`;
      const response = await this.httpClient.get<CopomexInfoCpResponse>(url);
      const data = response.data;

      let item: CopomexCpInfoItem | undefined;

      if (Array.isArray(data)) {
        item = data.find((entry) => !entry.error && entry.response?.municipio);
        if (!item && data.length > 0) {
          item = data[0];
        }
      } else if (data && typeof data === 'object') {
        item = data;
      }

      if (!item || item.error || !item.response?.municipio) {
        const errorMsg =
          item?.error_message ||
          `No se encontró información de municipio para el Código Postal ${cleanCp}`;
        this.logger.warn(`Copomex info_cp warning: ${errorMsg}`);
        throw new NotFoundException(
          `No se encontró información geográfica para el Código Postal ${cleanCp}`,
        );
      }

      const municipio = item.response.municipio.trim();

      // Guardar en caché con TTL de 24 horas
      this.cpToMunicipioCache.set(cleanCp, {
        data: municipio,
        expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS,
      });

      return municipio;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Error al consultar municipio para CP ${cleanCp} en Copomex: ${error?.message || error}`,
      );
      throw error;
    }
  }

  /**
   * Obtiene la lista de todos los Códigos Postales pertenecientes a un Municipio.
   * Prioriza la base de datos nacional SEPOMEX en Supabase para evitar consumir créditos.
   */
  async getPostalCodesByMunicipio(municipio: string): Promise<string[]> {
    const normalizedKey = this.normalizeKey(municipio);
    const cached = this.municipioToCpsCache.get(normalizedKey);

    if (cached && Date.now() < cached.expiresAt) {
      this.logger.debug(
        `[CACHE HIT] CPs para Municipio '${municipio}': ${cached.data.length} CPs encontrados en memoria`,
      );
      return cached.data;
    }

    // 1. Consultar en base de datos local en Supabase
    try {
      const dbCps = await this.prisma.sepomexPostalCode.findMany({
        where: {
          municipio: {
            equals: municipio.trim(),
            mode: 'insensitive',
          },
        },
        select: { postalCode: true },
        distinct: ['postalCode'],
      });

      if (dbCps && dbCps.length > 0) {
        const postalCodes = dbCps.map((record) => record.postalCode.trim());
        this.municipioToCpsCache.set(normalizedKey, {
          data: postalCodes,
          expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS,
        });
        return postalCodes;
      }
    } catch (dbError) {
      this.logger.warn(
        `Error al consultar CPs por municipio en Supabase, recurriendo a Copomex: ${dbError?.message || dbError}`,
      );
    }

    // 2. Fallback: Consultar API de Copomex
    try {
      const url = `${this.apiUrl}/get_cp_por_municipio/${encodeURIComponent(municipio)}?token=${this.token}`;
      const response = await this.httpClient.get<CopomexCpByMunicipioResponse>(url);
      const data = response.data;

      if (!data || data.error || !data.response?.cp) {
        this.logger.warn(
          `Copomex get_cp_por_municipio no retornó CPs para '${municipio}': ${data?.error_message || 'Sin respuesta válida'}`,
        );
        return [];
      }

      const rawCps = Array.isArray(data.response.cp) ? data.response.cp : [];
      const uniqueCps = Array.from(
        new Set(rawCps.map((cp) => String(cp).trim()).filter(Boolean)),
      );

      this.municipioToCpsCache.set(normalizedKey, {
        data: uniqueCps,
        expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS,
      });

      return uniqueCps;
    } catch (error) {
      this.logger.error(
        `Error al consultar CPs para municipio '${municipio}' en Copomex: ${error?.message || error}`,
      );
      return [];
    }
  }

  /**
   * Resuelve el municipio del CP dado y devuelve todos los CPs de ese municipio.
   * Si la consulta de CPs por municipio está vacía o falla, se asegura de retornar
   * al menos el CP original consultado para permitir un filtro geográfico mínimo.
   */
  async getPostalCodesForCp(
    postalCode: string,
  ): Promise<{ municipio: string; postalCodes: string[] }> {
    const cleanCp = postalCode.trim();
    const municipio = await this.getMunicipioByCp(cleanCp);
    const municipalCps = await this.getPostalCodesByMunicipio(municipio);

    // Asegurar que el CP consultado esté incluido en la lista
    const resultSet = new Set<string>(municipalCps);
    resultSet.add(cleanCp);

    const postalCodes = Array.from(resultSet);

    return {
      municipio,
      postalCodes,
    };
  }

  /**
   * Limpia la memoria caché (útil para pruebas unitarias).
   */
  clearCache(): void {
    this.cpToMunicipioCache.clear();
    this.municipioToCpsCache.clear();
  }

  private normalizeKey(key: string): string {
    return key
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}

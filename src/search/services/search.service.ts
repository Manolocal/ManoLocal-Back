import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Role, UserStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  calculatePagination,
  buildPaginatedResult,
} from '../../common/helpers';
import { SearchSpecialistsDto } from '../dto/search-specialists.dto';
import { CopomexService } from './copomex.service';

const SPANISH_STOP_WORDS = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'el',
  'en',
  'la',
  'las',
  'los',
  'o',
  'para',
  'por',
  'un',
  'una',
  'unos',
  'unas',
  'y',
]);

const GENERIC_QUALIFIERS = new Set([
  'casa',
  'casas',
  'comercial',
  'domicilio',
  'general',
  'hogar',
  'industrial',
  'instalacion',
  'instalaciones',
  'mantenimiento',
  'reparacion',
  'reparaciones',
  'residencial',
  'servicio',
  'servicios',
  'tecnico',
  'trabajo',
  'trabajos',
  'urgente',
]);

/**
 * Familias léxicas y sinónimos de oficios locales en México.
 * Permite que buscar "plomero", "plomeria" o "Plomería residencial" coincida
 * con cualquier variante registrada por el especialista.
 */
const TRADE_SYNONYM_GROUPS: ReadonlyArray<readonly string[]> = [
  ['plomer', 'plomeria', 'plomería', 'plomero', 'fontaner', 'tuberi', 'tuberí'],
  ['electr', 'eléctr', 'electricista', 'electricidad'],
  ['carpinter', 'carpinteria', 'carpintería', 'carpintero', 'ebanist'],
  ['pintor', 'pintur', 'pintura', 'acabados'],
  ['herrer', 'herreria', 'herrería', 'herrero', 'soldad'],
  ['albañil', 'albanil', 'albañilería', 'albanileria', 'mamposter'],
  ['cerrajer', 'cerrajeria', 'cerrajería', 'cerrajero', 'chapas'],
  ['jardiner', 'jardineria', 'jardinería', 'jardinero', 'jardín', 'jardin'],
  ['clima', 'a/c', 'aire acondicionado', 'minisplit', 'refrigerac'],
  ['calentador', 'boiler'],
  ['limpiez', 'aseo'],
  ['mecan', 'mecán', 'automotr'],
  ['vidrier', 'aluminio', 'canceler'],
  ['impermeabiliz', 'goteras', 'humedad'],
  ['yeser', 'tablaroca', 'plafon', 'plafón'],
  ['azulej', 'loseta', 'pisos', 'vitropiso'],
];

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly copomexService: CopomexService,
  ) {}

  /**
   * Busca especialistas geolocalizados por oficio y Código Postal.
   *
   * 1. Determina el CP base: usa el proporcionado en el query DTO o, si no viene,
   *    lo extrae del perfil del empleador autenticado.
   * 2. Consulta a CopomexService para obtener el municipio y la lista de todos
   *    los Códigos Postales que componen dicho municipio.
   * 3. Expande el término de búsqueda (raíz, sinónimos de oficios y variantes con/sin acento)
   *    para que búsquedas parciales o con múltiples palabras encuentren especialistas relevantes.
   * 4. Retorna el resultado paginado con metadata geográfica enriquecida.
   */
  async searchSpecialists(userId: string | undefined, query: SearchSpecialistsDto) {
    const postalCode = await this.resolveTargetPostalCode(userId, query.postalCode);
    const sanitizedSkill = query.skill.trim();
    const searchTerms = this.buildFlexibleSkillTerms(sanitizedSkill);

    this.logger.log(
      `Iniciando búsqueda de especialistas: skill='${sanitizedSkill}' -> términos=[${searchTerms.join(', ')}], CP base='${postalCode}' (usuario=${userId ?? 'anon'})`,
    );

    // 2. Obtener municipio y CPs asociados vía Copomex (con caché 24h)
    const { municipio, postalCodes } =
      await this.copomexService.getPostalCodesForCp(postalCode);

    this.logger.debug(
      `Geofiltro resuelto para '${municipio}': ${postalCodes.length} CPs en el municipio`,
    );

    const knowledgeNameOrFilters: Prisma.KnowledgeWhereInput[] = searchTerms.map(
      (term) => ({
        name: {
          contains: term,
          mode: 'insensitive',
        },
      }),
    );

    // 3. Construir filtros Prisma flexibles
    const where: Prisma.UserWhereInput = {
      role: Role.ESPECIALISTA,
      status: {
        in: [UserStatus.ACTIVO, UserStatus.PENDIENTE_VALIDACION],
      },
      profile: {
        postalCode: {
          in: postalCodes,
        },
      },
      knowledges: {
        some: {
          OR: knowledgeNameOrFilters,
        },
      },
    };

    // 4. Paginación y ejecución en base de datos
    const paginationParams = calculatePagination(query);
    const { skip, take, page, limit } = paginationParams;

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          createdAt: true,
          profile: {
            select: {
              fullName: true,
              phone: true,
              address: true,
              postalCode: true,
              ratingAverage: true,
              ratingCount: true,
            },
          },
          knowledges: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              name: true,
              verifications: {
                select: {
                  id: true,
                  status: true,
                  score: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const formattedSpecialists = users.map((specialist) => ({
      ...specialist,
      profile: specialist.profile
        ? {
            ...specialist.profile,
            ratingAverage: Number(specialist.profile.ratingAverage ?? 0),
            ratingCount: specialist.profile.ratingCount ?? 0,
          }
        : null,
    }));

    const paginated = buildPaginatedResult(formattedSpecialists, total, {
      page,
      limit,
    });

    return {
      specialists: paginated.items,
      geoFilter: {
        searchedPostalCode: postalCode,
        municipio,
        totalPostalCodesInMunicipality: postalCodes.length,
      },
      pagination: paginated.meta,
    };
  }

  /**
   * Construye términos de búsqueda flexibles a partir del texto del usuario:
   * - Divide frases de múltiples palabras ignorando conectores ("de", "y", "en"...).
   * - Prioriza palabras específicas de oficio sobre calificativos genéricos ("residencial", "urgente").
   * - Expande familias léxicas/sinónimos ("plomero" <-> "plomería", "albanil" <-> "albañilería").
   * - Agrega raíces comunes y variantes con/sin acentos para coincidencias parciales.
   */
  buildFlexibleSkillTerms(rawSkill: string): string[] {
    const cleaned = rawSkill.trim();
    if (!cleaned) return [];

    const terms = new Set<string>([cleaned]);
    const normalizedFull = this.stripDiacritics(cleaned.toLowerCase());
    if (normalizedFull && normalizedFull !== cleaned.toLowerCase()) {
      terms.add(normalizedFull);
    }

    // Tokenizar preservando términos como "a/c" y separando por espacios/puntuación
    const rawTokens = cleaned
      .toLowerCase()
      .split(/[\s,;|·]+/)
      .map((t) => t.replace(/^[^a-záéíóúüñ0-9]+|[^a-záéíóúüñ0-9]+$/gi, ''))
      .filter((t) => t.length >= 2);

    const meaningful = rawTokens.filter(
      (token) => !SPANISH_STOP_WORDS.has(this.stripDiacritics(token)),
    );

    const specificTokens = meaningful.filter(
      (token) => !GENERIC_QUALIFIERS.has(this.stripDiacritics(token)),
    );

    const activeTokens =
      specificTokens.length > 0 ? specificTokens : meaningful;

    for (const token of activeTokens) {
      const noAccents = this.stripDiacritics(token);
      terms.add(token);
      if (noAccents.length >= 2) {
        terms.add(noAccents);
      }

      // Expansión de raíz española (ej. "plomero" -> "plomer", "carpintería" -> "carpinter")
      const stem = this.extractSpanishTradeStem(noAccents);
      if (stem && stem.length >= 4) {
        terms.add(stem);
      }

      // Expansión de variantes con acento frecuente (eria <-> ería, ion <-> ión)
      if (noAccents.endsWith('eria') && noAccents.length >= 6) {
        terms.add(`${noAccents.slice(0, -4)}ería`);
      }
      if (noAccents.endsWith('ion') && noAccents.length >= 5) {
        terms.add(`${noAccents.slice(0, -3)}ión`);
      }

      // Expansión por familia de sinónimos del oficio
      for (const group of TRADE_SYNONYM_GROUPS) {
        const matchesGroup = group.some((entry) => {
          const normEntry = this.stripDiacritics(entry.toLowerCase());
          return (
            noAccents.includes(normEntry) ||
            normEntry.includes(noAccents) ||
            (stem.length >= 4 && normEntry.startsWith(stem))
          );
        });
        if (matchesGroup) {
          for (const synonym of group) {
            terms.add(synonym);
          }
        }
      }
    }

    return [...terms].filter((t) => t.trim().length >= 2);
  }

  private stripDiacritics(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private extractSpanishTradeStem(normalizedWord: string): string {
    const suffixes = [
      'eria',
      'ista',
      'idad',
      'dor',
      'dora',
      'ero',
      'era',
      'ico',
      'ica',
      'ion',
      'es',
      's',
    ];
    for (const suffix of suffixes) {
      if (
        normalizedWord.endsWith(suffix) &&
        normalizedWord.length - suffix.length >= 4
      ) {
        return normalizedWord.slice(0, -suffix.length);
      }
    }
    return normalizedWord;
  }

  /**
   * Resuelve el Código Postal de referencia.
   * Si viene especificado en la consulta lo utiliza con prioridad.
   * De lo contrario, lo obtiene del perfil del usuario autenticado.
   */
  private async resolveTargetPostalCode(
    userId: string | undefined,
    queryPostalCode: string | undefined,
  ): Promise<string> {
    if (queryPostalCode && queryPostalCode.trim()) {
      return queryPostalCode.trim();
    }

    if (!userId) {
      throw new BadRequestException(
        'Debes proporcionar un Código Postal en la consulta o haber iniciado sesión con un perfil configurado.',
      );
    }

    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { postalCode: true },
    });

    if (!profile || !profile.postalCode || !profile.postalCode.trim()) {
      throw new BadRequestException(
        'Tu perfil de Empleador no tiene un Código Postal registrado. Por favor actualiza tu perfil o proporciona un CP en la búsqueda.',
      );
    }

    return profile.postalCode.trim();
  }
}

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Role, UserStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  calculatePagination,
  buildPaginatedResult,
} from '../../common/helpers';
import { SearchSpecialistsDto } from '../dto/search-specialists.dto';
import { CopomexService } from './copomex.service';

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
   * 3. Ejecuta la consulta en Prisma filtrando únicamente usuarios con rol ESPECIALISTA,
   *    cuyo perfil tenga un CP contenido en la lista municipal, y que cuenten con el oficio buscado.
   * 4. Retorna el resultado paginado con metadata geográfica enriquecida.
   */
  async searchSpecialists(userId: string | undefined, query: SearchSpecialistsDto) {
    const postalCode = await this.resolveTargetPostalCode(userId, query.postalCode);
    const sanitizedSkill = query.skill.trim();

    this.logger.log(
      `Iniciando búsqueda de especialistas: skill='${sanitizedSkill}', CP base='${postalCode}' (usuario=${userId ?? 'anon'})`,
    );

    // 2. Obtener municipio y CPs asociados vía Copomex (con caché 24h)
    const { municipio, postalCodes } =
      await this.copomexService.getPostalCodesForCp(postalCode);

    this.logger.debug(
      `Geofiltro resuelto para '${municipio}': ${postalCodes.length} CPs en el municipio`,
    );

    // 3. Construir filtros Prisma
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
          name: {
            contains: sanitizedSkill,
            mode: 'insensitive',
          },
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
            },
          },
          knowledges: {
            where: {
              name: {
                contains: sanitizedSkill,
                mode: 'insensitive',
              },
            },
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

    const paginated = buildPaginatedResult(users, total, { page, limit });

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

import { PaginationQueryDto } from '../dto/pagination-query.dto';

export interface PaginationParams {
  skip: number;
  take: number;
  page: number;
  limit: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * Calcula los parámetros de corte `skip` y `take` de Prisma a partir de la consulta.
 */
export function calculatePagination(query?: PaginationQueryDto): PaginationParams {
  const page = Math.max(1, Number(query?.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(query?.limit) || 10));
  const skip = (page - 1) * limit;

  return { skip, take: limit, page, limit };
}

/**
 * Construye la respuesta estructurada paginada con sus metadatos de navegación.
 */
export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  params: { page: number; limit: number },
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.limit) || 1;

  return {
    items,
    meta: {
      total,
      page: params.page,
      limit: params.limit,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1,
    },
  };
}

import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus } from '@prisma/client';

export class GetJobsQueryDto {
  @ApiPropertyOptional({ description: 'Número de página', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página mínima es 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de trabajos por página',
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite mínimo es 1' })
  @Max(100, { message: 'El límite máximo por página es 100' })
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Filtrar por estado del acuerdo de trabajo',
    enum: JobStatus,
  })
  @IsOptional()
  @IsEnum(JobStatus, {
    message: 'El estado debe ser PENDING, CONFIRMED, COMPLETED o CANCELLED',
  })
  status?: JobStatus;
}


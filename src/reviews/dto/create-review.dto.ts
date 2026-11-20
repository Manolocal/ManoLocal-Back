import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsRating } from '../../common/validators/is-rating.validator';

/**
 * DTO de creación de reseña pública tras finalizar un trabajo (`COMPLETED`).
 */
export class CreateReviewDto {
  @ApiProperty({
    description: 'UUID del acuerdo de trabajo finalizado que se va a calificar',
    example: '9c1d4c3e-6a8f-4f2b-a801-2c4d6e8f9a10',
  })
  @IsUUID('4', {
    message: 'El ID del acuerdo de trabajo debe ser un UUID válido',
  })
  jobAgreementId: string;

  @ApiProperty({
    description: 'Calificación numérica entera de 1 a 5 estrellas',
    minimum: 1,
    maximum: 5,
    example: 5,
  })
  @Type(() => Number)
  @IsInt({
    message: 'La calificación debe ser un número entero entre 1 y 5',
  })
  @Min(1, { message: 'La calificación mínima es 1 estrella' })
  @Max(5, { message: 'La calificación máxima es 5 estrellas' })
  @IsRating()
  rating: number;

  @ApiPropertyOptional({
    description: 'Comentario opcional del empleador sobre la calidad del servicio',
    maxLength: 1000,
    example: 'Excelente puntualidad, trabajo limpio y muy profesional.',
  })
  @IsOptional()
  @IsString({ message: 'El comentario debe ser una cadena de texto' })
  @MaxLength(1000, {
    message: 'El comentario no puede superar los 1000 caracteres',
  })
  comment?: string;
}

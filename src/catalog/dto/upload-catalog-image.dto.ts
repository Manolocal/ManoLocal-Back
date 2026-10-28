import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UploadCatalogImageDto {
  @ApiProperty({
    description: 'Título descriptivo del trabajo realizado',
    example: 'Instalación de regadera tipo lluvia',
    minLength: 3,
    maxLength: 100,
  })
  @IsNotEmpty({ message: 'El título de la foto es obligatorio' })
  @IsString({ message: 'El título debe ser una cadena de texto' })
  @MinLength(3, { message: 'El título debe tener al menos 3 caracteres' })
  @MaxLength(100, { message: 'El título no debe exceder 100 caracteres' })
  title: string;

  @ApiPropertyOptional({
    description:
      'Descripción opcional detallando el trabajo o materiales utilizados',
    example:
      'Se realizó reemplazo de tubería de cobre y fijación con sellador antihongos.',
    maxLength: 300,
  })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MaxLength(300, { message: 'La descripción no debe exceder 300 caracteres' })
  description?: string;
}


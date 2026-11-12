import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsPositiveAmount } from '../../common/validators/is-positive-amount.validator';

export class CreateJobDto {
  @ApiProperty({
    description: 'UUID de la sala de chat donde se formaliza el acuerdo',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @IsNotEmpty({ message: 'El ID de la sala de chat es obligatorio' })
  @IsUUID('all', { message: 'El ID de la sala debe ser un UUID válido' })
  roomId: string;

  @ApiPropertyOptional({
    description: 'Título corto del servicio o trabajo acordado',
    example: 'Instalación de calentador solar',
    minLength: 3,
    maxLength: 120,
  })
  @IsOptional()
  @IsString({ message: 'El título debe ser una cadena de texto' })
  @MinLength(3, { message: 'El título debe tener al menos 3 caracteres' })
  @MaxLength(120, { message: 'El título no puede exceder 120 caracteres' })
  title?: string;

  @ApiPropertyOptional({
    description: 'Detalles o alcance del trabajo acordado en el chat',
    example: 'Incluye instalación de tubería de cobre y prueba de presión.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MaxLength(500, {
    message: 'La descripción no puede exceder 500 caracteres',
  })
  description?: string;

  @ApiPropertyOptional({
    description:
      'Precio acordado por el servicio entre Empleador y Especialista (MXN)',
    example: 1200.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsPositiveAmount({
    message:
      'El precio acordado debe ser un monto positivo mayor a cero con hasta 2 decimales',
  })
  agreedPrice?: number;
}


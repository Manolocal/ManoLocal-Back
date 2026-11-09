import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RechargeWalletDto {
  @ApiProperty({
    description: 'Monto a recargar en la billetera virtual',
    example: 250.0,
    minimum: 1,
    maximum: 100000,
  })
  @IsNotEmpty({ message: 'El monto es obligatorio' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El monto debe ser un número con un máximo de 2 decimales' },
  )
  @IsPositive({ message: 'El monto a recargar debe ser mayor a 0' })
  @Min(1, { message: 'El monto mínimo de recarga es de 1.00 crédito' })
  @Max(100000, {
    message: 'El monto máximo de recarga simulada es de 100,000.00 créditos',
  })
  monto: number;

  @ApiPropertyOptional({
    description: 'Descripción o concepto opcional de la recarga',
    example: 'Recarga simulada mediante tarjeta demo',
  })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @MaxLength(255, { message: 'La descripción no puede exceder 255 caracteres' })
  descripcion?: string;
}

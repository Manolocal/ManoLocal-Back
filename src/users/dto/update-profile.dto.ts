import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsPhoneNumberMx,
  IsPostalCodeMx,
} from '../../common/validators';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Nombre completo del usuario',
    example: 'Carlos Sánchez López',
  })
  @IsOptional()
  @IsString({ message: 'El nombre completo debe ser una cadena de texto' })
  @MaxLength(120, {
    message: 'El nombre completo no puede exceder 120 caracteres',
  })
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Número de teléfono a 10 dígitos de México',
    example: '5512345678',
  })
  @IsOptional()
  @IsPhoneNumberMx()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Dirección o calle y número',
    example: 'Av. Revolución 100, Col. San Ángel',
  })
  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @MaxLength(255, { message: 'La dirección no puede exceder 255 caracteres' })
  address?: string;

  @ApiPropertyOptional({
    description: 'Código postal de 5 dígitos (usado para el geofiltro)',
    example: '01000',
  })
  @IsOptional()
  @IsPostalCodeMx()
  postalCode?: string;
}

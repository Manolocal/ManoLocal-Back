import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: 'El nombre completo debe ser una cadena de texto' })
  @MaxLength(120, {
    message: 'El nombre completo no puede exceder 120 caracteres',
  })
  fullName?: string;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @Matches(/^\+?[0-9\s-]{10,15}$/, {
    message: 'El teléfono debe ser un número válido (ej. 55 1234 5678)',
  })
  phone?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @MaxLength(255, { message: 'La dirección no puede exceder 255 caracteres' })
  address?: string;

  @IsOptional()
  @IsString({ message: 'El código postal debe ser una cadena de texto' })
  @Matches(/^[0-9]{5}$/, {
    message: 'El código postal debe tener exactamente 5 dígitos',
  })
  postalCode?: string;
}

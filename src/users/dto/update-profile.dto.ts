import { IsOptional, IsString, MaxLength } from 'class-validator';
import {
  IsPhoneNumberMx,
  IsPostalCodeMx,
} from '../../common/validators';

export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: 'El nombre completo debe ser una cadena de texto' })
  @MaxLength(120, {
    message: 'El nombre completo no puede exceder 120 caracteres',
  })
  fullName?: string;

  @IsOptional()
  @IsPhoneNumberMx()
  phone?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser una cadena de texto' })
  @MaxLength(255, { message: 'La dirección no puede exceder 255 caracteres' })
  address?: string;

  @IsOptional()
  @IsPostalCodeMx()
  postalCode?: string;
}

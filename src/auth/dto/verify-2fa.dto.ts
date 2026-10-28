import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Verify2faDto {
  @ApiProperty({
    description: 'Correo electrónico al cual se envió el código 2FA',
    example: 'usuario@manolocal.com',
  })
  @IsEmail(
    {},
    { message: 'El correo electrónico debe ser una dirección válida' },
  )
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  email: string;

  @ApiProperty({
    description: 'Código de 6 dígitos numéricos recibido por correo',
    example: '123456',
  })
  @IsString({ message: 'El código 2FA debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El código 2FA es requerido' })
  @Length(6, 6, { message: 'El código 2FA debe tener exactamente 6 dígitos' })
  @Matches(/^[0-9]{6}$/, {
    message: 'El código 2FA debe contener únicamente dígitos numéricos',
  })
  code: string;
}

import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../common/enums/role.enum';
import { IsStrongPassword } from '../../common/validators/is-strong-password.validator';
import { IsValidRole } from '../../common/validators/is-valid-role.validator';

export class RegisterDto {
  @ApiProperty({
    description: 'Correo electrónico del nuevo usuario',
    example: 'nuevo.usuario@manolocal.com',
  })
  @IsEmail(
    {},
    { message: 'El correo electrónico debe ser una dirección válida' },
  )
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  email: string;

  @ApiProperty({
    description: 'Contraseña segura (mínimo 8 caracteres, al menos 1 mayúscula, 1 número y 1 carácter especial)',
    example: 'Password123!',
  })
  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @IsStrongPassword()
  password: string;

  @ApiProperty({
    description: 'Rol en la plataforma (EMPLEADOR o ESPECIALISTA)',
    enum: Role,
    example: Role.EMPLEADOR,
  })
  @IsNotEmpty({ message: 'El rol es requerido' })
  @IsValidRole()
  role: Role;

  @ApiPropertyOptional({
    description: 'Nombre completo o alias del usuario',
    example: 'Juan Pérez',
  })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  name?: string;
}

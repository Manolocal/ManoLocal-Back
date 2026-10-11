import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Role } from '../../common/enums/role.enum';
import { IsStrongPassword } from '../../common/validators/is-strong-password.validator';
import { IsValidRole } from '../../common/validators/is-valid-role.validator';

export class RegisterDto {
  @IsEmail({}, { message: 'El correo electrónico debe ser una dirección válida' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  email: string;

  @IsNotEmpty({ message: 'La contraseña es requerida' })
  @IsStrongPassword()
  password: string;

  @IsNotEmpty({ message: 'El rol es requerido' })
  @IsValidRole()
  role: Role;

  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  name?: string;
}

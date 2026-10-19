import { Role } from '../enums/role.enum';
import { UserStatus } from '../enums/user-status.enum';

/** Usuario autenticado inyectado por el JwtStrategy en `request.user` */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  status: UserStatus;
}

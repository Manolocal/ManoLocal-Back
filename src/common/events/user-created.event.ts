import { Role } from '../enums/role.enum';

/**
 * Evento emitido cuando un nuevo usuario es registrado en el sistema.
 * Permite la creación desacoplada de dependencias (p. ej. la Billetera para Especialistas).
 */
export class UserCreatedEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly role: Role,
  ) {}
}

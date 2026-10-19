export const UserStatus = {
  INACTIVO: 'INACTIVO',
  PENDIENTE_VALIDACION: 'PENDIENTE_VALIDACION',
  ACTIVO: 'ACTIVO',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

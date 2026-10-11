export const Role = {
  ADMIN: 'ADMIN',
  EMPLEADOR: 'EMPLEADOR',
  ESPECIALISTA: 'ESPECIALISTA',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

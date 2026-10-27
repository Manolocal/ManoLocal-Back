import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Validador para Códigos Postales de México.
 *
 * Requiere una cadena de exactamente 5 dígitos numéricos (del 01000 al 99999).
 * Se utilizará en el perfil de usuario y en el módulo de búsqueda y geofiltro (BACK-05).
 */
export function IsPostalCodeMx(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPostalCodeMx',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          return /^[0-9]{5}$/.test(value.trim());
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} debe ser un código postal mexicano válido de 5 dígitos numéricos (ej. 03100).`;
        },
      },
    });
  };
}

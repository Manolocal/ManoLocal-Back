import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Validador para montos monetarios o créditos positivos.
 *
 * Requiere que el valor sea un número estrictamente mayor a 0 y que tenga como
 * máximo 2 decimales (centavos).
 * Se utilizará en la billetera virtual (BACK-08), cotizaciones y transacciones (BACK-09).
 */
export function IsPositiveAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPositiveAmount',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'number' || isNaN(value)) return false;
          if (value <= 0) return false;
          // Validar máximo 2 decimales
          return /^\d+(\.\d{1,2})?$/.test(value.toString());
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} debe ser un monto positivo mayor a cero con hasta 2 decimales.`;
        },
      },
    });
  };
}

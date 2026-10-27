import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Validador para calificaciones numéricas en escala de 1 a 5 estrellas.
 * Acepta incrementos de 0.5 (ej. 1, 1.5, 2, ..., 5).
 * Se utilizará en el módulo de reseñas, calificaciones y reputación (BACK-10).
 */
export function IsRating(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isRating',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'number' || isNaN(value)) return false;
          if (value < 1 || value > 5) return false;
          // Verificar incrementos de 0.5 o enteros
          return (value * 2) % 1 === 0;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} debe ser una calificación entre 1 y 5 (en incrementos de 0.5 estrellas).`;
        },
      },
    });
  };
}

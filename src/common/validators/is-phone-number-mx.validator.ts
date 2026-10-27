import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Validador para Números Telefónicos en México.
 *
 * Acepta números de 10 dígitos (fijos o móviles), permitiendo prefijo opcional +52,
 * espacios o guiones entre grupos de números.
 */
export function IsPhoneNumberMx(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPhoneNumberMx',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          // Eliminar prefijos, espacios y guiones para evaluar los 10 dígitos
          const cleaned = value.replace(/^\+52/, '').replace(/[\s-]/g, '');
          return /^[1-9][0-9]{9}$/.test(cleaned);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} debe ser un número telefónico válido de 10 dígitos (ej. 5512345678 o 55 1234 5678).`;
        },
      },
    });
  };
}

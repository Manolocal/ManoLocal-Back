import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Role } from '../enums/role.enum';

export function IsValidRole(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidRole',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return (Object.values(Role) as string[]).includes(value as string);
        },
        defaultMessage(args: ValidationArguments) {
          const allowedRoles = Object.values(Role).join(', ');
          return `${args.property} debe ser un rol válido (${allowedRoles}).`;
        },
      },
    });
  };
}

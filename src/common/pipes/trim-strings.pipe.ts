import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

/**
 * Pipe global que limpia automáticamente espacios en blanco redundantes
 * al inicio y al final de cualquier propiedad tipo string en los cuerpos de petición.
 */
@Injectable()
export class TrimStringsPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body' || typeof value !== 'object' || value === null) {
      return value;
    }

    return this.trimObject(value as Record<string, unknown>);
  }

  private trimObject(obj: Record<string, unknown>): Record<string, unknown> {
    const trimmed: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'string') {
        trimmed[key] = val.trim();
      } else if (Array.isArray(val)) {
        trimmed[key] = val.map((item) =>
          typeof item === 'string'
            ? item.trim()
            : typeof item === 'object' && item !== null
              ? this.trimObject(item as Record<string, unknown>)
              : item,
        );
      } else if (typeof val === 'object' && val !== null) {
        trimmed[key] = this.trimObject(val as Record<string, unknown>);
      } else {
        trimmed[key] = val;
      }
    }

    return trimmed;
  }
}

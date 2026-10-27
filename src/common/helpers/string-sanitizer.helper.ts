/**
 * Utilidades de limpieza, normalización y sanitización de cadenas de texto.
 */
export class StringSanitizer {
  /**
   * Normaliza texto para búsquedas (convierte a minúsculas y elimina acentos/diacríticos).
   * Ejemplo: "Plomería Eléctrica" -> "plomeria electrica"
   */
  static normalize(text: string): string {
    if (!text) return '';
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Elimina etiquetas HTML y caracteres potencialmente peligrosos de entradas de usuario.
   */
  static stripHtml(input: string): string {
    if (!input) return '';
    return input
      .replace(/<[^>]*>?/gm, '')
      .replace(/&[a-z]+;/gi, '')
      .trim();
  }

  /**
   * Limpia y compacta espacios múltiples en blanco a un solo espacio.
   */
  static cleanWhitespace(input: string): string {
    if (!input) return '';
    return input.replace(/\s+/g, ' ').trim();
  }
}

/**
 * Utilidades para manejo seguro de fechas, expiraciones y cálculos temporales.
 */
export class DateHelper {
  /** Verifica si una fecha dada ya ha expirado respecto al momento actual. */
  static isExpired(date: Date | string | null | undefined): boolean {
    if (!date) return true;
    const target = typeof date === 'string' ? new Date(date) : date;
    return target.getTime() <= Date.now();
  }

  /** Suma minutos a la fecha actual o especificada (útil para tokens, pines 2FA y bloqueos temporales). */
  static addMinutes(minutes: number, baseDate: Date = new Date()): Date {
    return new Date(baseDate.getTime() + minutes * 60 * 1000);
  }

  /** Suma días a la fecha actual o especificada (útil para vigencias de planes, disputas y garantías). */
  static addDays(days: number, baseDate: Date = new Date()): Date {
    return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  }

  /** Formatea una fecha en formato ISO legible estándar. */
  static toIsoString(date: Date = new Date()): string {
    return date.toISOString();
  }
}

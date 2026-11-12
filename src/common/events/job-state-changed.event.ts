export type JobSocketEventType = 'job_created' | 'job_updated';

export type JobActionType = 'CREATED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

/**
 * Evento desacoplado emitido cuando un acuerdo de trabajo se crea o cambia de estado.
 * Permite al Gateway de Chat emitir notificaciones en tiempo real a la sala sin crear
 * acoplamiento circular directo.
 */
export class JobStateChangedEvent {
  constructor(
    public readonly eventType: JobSocketEventType,
    public readonly action: JobActionType,
    public readonly roomId: string,
    public readonly actorId: string,
    public readonly job: Record<string, unknown>,
    public readonly timestamp: string = new Date().toISOString(),
  ) {}
}


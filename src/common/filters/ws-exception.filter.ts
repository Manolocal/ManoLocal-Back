import { Catch, ArgumentsHost, Logger, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

export interface WsErrorPayload {
  event: string;
  statusCode: number;
  error: string;
  code?: string;
  message: string | string[] | object;
  details?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Filtro de Excepciones específico para WebSockets (WsExceptionFilter).
 *
 * Captura excepciones generadas en gateways, guards, pipes y servicios de WebSockets.
 * A diferencia del entorno HTTP, evita que errores no capturados o de validación
 * desconecten o rompan el servidor Socket.io; en su lugar, emite un evento 'error'
 * estandarizado al cliente emisor.
 */
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const wsContext = host.switchToWs();
    const client = wsContext.getClient<Socket>();

    let statusCode = 400;
    let errorName = 'WsException';
    let message: string | string[] | object = 'Error en la conexión WebSocket';
    let code: string | undefined;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof WsException) {
      const error = exception.getError();
      if (typeof error === 'string') {
        message = error;
      } else if (typeof error === 'object' && error !== null) {
        const errorObj = error as Record<string, unknown>;
        message =
          (errorObj.message as string | string[]) || 'Error en WebSocket';
        if (typeof errorObj.error === 'string') {
          errorName = errorObj.error;
        }
        if (typeof errorObj.statusCode === 'number') {
          statusCode = errorObj.statusCode;
        }
        if (typeof errorObj.code === 'string') {
          code = errorObj.code;
        }
        if (typeof errorObj.details === 'object' && errorObj.details !== null) {
          details = errorObj.details as Record<string, unknown>;
        }
      }
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      errorName = exception.name;
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        message = (resObj.message as string | string[]) || exception.message;
        if (typeof resObj.error === 'string') {
          errorName = resObj.error;
        }
        if (typeof resObj.code === 'string') {
          code = resObj.code;
        }
        if (typeof resObj.details === 'object' && resObj.details !== null) {
          details = resObj.details as Record<string, unknown>;
        }
      } else if (typeof res === 'string') {
        message = res;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      errorName = exception.name;
    }

    this.logger.error(
      `WebSocket Exception [${errorName}] (status ${statusCode}): ${JSON.stringify(message)}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const errorPayload: WsErrorPayload = {
      event: 'error',
      statusCode,
      error: errorName,
      ...(code && { code }),
      message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
    };

    if (client && typeof client.emit === 'function') {
      client.emit('error', errorPayload);
    }
  }
}

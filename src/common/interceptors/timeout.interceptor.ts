import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

/**
 * Interceptor de límite de tiempo para peticiones HTTP.
 *
 * Previene que conexiones colgadas o bloqueadas mantengan sockets ocupados
 * indefinidamente, cancelando la petición y respondiendo con HTTP 408 Request Timeout.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeoutMs: number = 30000) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () =>
              new RequestTimeoutException(
                'El tiempo límite de la petición ha sido excedido (30s timeout)',
              ),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}

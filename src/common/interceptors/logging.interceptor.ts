import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

/**
 * Interceptor global de observabilidad y registro de peticiones HTTP.
 *
 * Mide el tiempo de respuesta de cada petición e imprime en los logs:
 * `[HTTP] GET /users/me - 200 OK (+12ms)`
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const method = req.method;
    const url = req.originalUrl || req.url;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = res.statusCode;
          this.logger.log(`${method} ${url} - ${statusCode} (+${duration}ms)`);
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          const status = err?.status || err?.statusCode || 500;
          this.logger.warn(
            `${method} ${url} - ${status} (${err.message}) (+${duration}ms)`,
          );
        },
      }),
    );
  }
}

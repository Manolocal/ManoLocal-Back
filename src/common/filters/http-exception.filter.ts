import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Filtro y Manejador Global de Errores (Global Exception Handler).
 *
 * Captura y estandariza cualquier excepción de la aplicación:
 * - Excepciones HTTP nativas de NestJS (400, 401, 403, 404, 409, etc.).
 * - Errores de Base de Datos Prisma (violación de unicidad P2002, registro no encontrado P2025, llaves foráneas P2003).
 * - Errores no controlados (500 Internal Server Error) con registro en logger.
 *
 * Devuelve un formato uniforme REST:
 * `{ statusCode, message, error, path, timestamp }`
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] | object = 'Error interno del servidor';
    let errorName = 'Internal Server Error';

    // 1. Excepciones HTTP estándar de NestJS
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      errorName = exception.name;

      if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        if ('message' in resObj) {
          message = resObj.message as string | string[];
        }
        if ('error' in resObj && typeof resObj.error === 'string') {
          errorName = resObj.error;
        }
      } else if (typeof res === 'string') {
        message = res;
      } else {
        message = exception.message;
      }
    }
    // 2. Errores conocidos de Prisma ORM
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        // Violación de restricción única (ej. email duplicado)
        case 'P2002': {
          statusCode = HttpStatus.CONFLICT;
          errorName = 'Conflict';
          const target = (exception.meta?.target as string[])?.join(', ');
          message = target
            ? `Ya existe un registro con este valor para el campo: ${target}`
            : 'El recurso ya se encuentra registrado con esos datos únicos';
          break;
        }
        // Registro a actualizar o eliminar no encontrado
        case 'P2025': {
          statusCode = HttpStatus.NOT_FOUND;
          errorName = 'Not Found';
          message = 'El registro solicitado no fue encontrado o ya no existe';
          break;
        }
        // Violación de llave foránea
        case 'P2003': {
          statusCode = HttpStatus.BAD_REQUEST;
          errorName = 'Bad Request';
          message = 'Referencia inválida: el registro relacionado no existe';
          break;
        }
        // Violación de relación requerida
        case 'P2014': {
          statusCode = HttpStatus.BAD_REQUEST;
          errorName = 'Bad Request';
          message = 'La relación requerida no se cumple para este registro';
          break;
        }
        default: {
          statusCode = HttpStatus.BAD_REQUEST;
          errorName = 'Database Error';
          message = `Error en la base de datos (${exception.code})`;
          this.logger.error(`Prisma error [${exception.code}]: ${exception.message}`);
          break;
        }
      }
    }
    // 3. Error de validación de sintaxis/esquema en Prisma
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      statusCode = HttpStatus.BAD_REQUEST;
      errorName = 'Bad Request';
      message = 'Los datos enviados no corresponden con la estructura esperada por la base de datos';
      this.logger.warn(`Prisma Validation Error: ${exception.message}`);
    }
    // 4. Errores generales de JavaScript (Error estándar)
    else if (exception instanceof Error) {
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
      message = exception.message;
    }
    // 5. Excepciones no tipadas
    else {
      this.logger.error('Unhandled unknown exception', exception);
    }

    const path = request?.url || '';

    response.status(statusCode).json({
      statusCode,
      message,
      error: errorName,
      path,
      timestamp: new Date().toISOString(),
    });
  }
}

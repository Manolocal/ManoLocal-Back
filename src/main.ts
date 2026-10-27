import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import {
  ResponseInterceptor,
  LoggingInterceptor,
  TimeoutInterceptor,
} from './common/interceptors';
import { TrimStringsPipe } from './common/pipes/trim-strings.pipe';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  // Pipes globales: sanitización de espacios en blanco y validación estricta de DTOs
  app.useGlobalPipes(
    new TrimStringsPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Filtro de excepciones global (HttpException + Prisma + Errores no controlados)
  app.useGlobalFilters(new HttpExceptionFilter());

  // Interceptores globales: observabilidad de latencia, límite de tiempo y formato de respuesta
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TimeoutInterceptor(30000),
    new ResponseInterceptor(),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
}
void bootstrap();

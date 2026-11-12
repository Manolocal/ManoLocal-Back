import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CancelJobDto {
  @ApiPropertyOptional({
    description: 'Motivo opcional de la cancelación del acuerdo de trabajo',
    example: 'Reprogramación solicitada por el empleador',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'El motivo debe ser una cadena de texto' })
  @MaxLength(255, {
    message: 'El motivo de cancelación no puede exceder 255 caracteres',
  })
  reason?: string;
}


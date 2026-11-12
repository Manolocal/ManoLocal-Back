import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class JobActionDto {
  @IsNotEmpty({ message: 'El ID del trabajo es obligatorio' })
  @IsUUID('all', { message: 'El ID del trabajo debe ser un UUID válido' })
  jobId: string;
}

export class CancelJobWsDto extends JobActionDto {
  @IsOptional()
  @IsString({ message: 'El motivo debe ser una cadena de texto' })
  @MaxLength(255, {
    message: 'El motivo de cancelación no puede exceder 255 caracteres',
  })
  reason?: string;
}


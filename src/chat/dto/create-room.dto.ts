import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiPropertyOptional({
    description: 'ID del especialista (si quien crea es Empleador)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID('all', { message: 'El ID del especialista debe ser un UUID válido' })
  specialistId?: string;

  @ApiPropertyOptional({
    description: 'ID del empleador (si quien crea es Especialista)',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @IsOptional()
  @IsUUID('all', { message: 'El ID del empleador debe ser un UUID válido' })
  employerId?: string;

  @ApiPropertyOptional({
    description: 'ID del usuario contraparte genérico con quien abrir la sala',
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  })
  @IsOptional()
  @IsUUID('all', { message: 'El ID debe ser un UUID válido' })
  targetUserId?: string;
}

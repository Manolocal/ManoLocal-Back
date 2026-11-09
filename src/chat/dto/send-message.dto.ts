import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    description: 'ID de la sala de chat privada',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @IsNotEmpty({ message: 'El ID de la sala es obligatorio' })
  @IsUUID('all', { message: 'El ID de la sala debe ser un UUID válido' })
  roomId: string;

  @ApiProperty({
    description: 'Contenido del mensaje de texto',
    example: 'Hola, me interesa acordar los detalles del servicio.',
  })
  @IsNotEmpty({ message: 'El contenido del mensaje no puede estar vacío' })
  @IsString({ message: 'El mensaje debe ser una cadena de texto' })
  @MaxLength(3000, { message: 'El mensaje no puede exceder 3000 caracteres' })
  content: string;
}

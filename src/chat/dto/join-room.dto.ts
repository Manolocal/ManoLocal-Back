import { IsNotEmpty, IsUUID } from 'class-validator';

export class JoinRoomDto {
  @IsNotEmpty({ message: 'El ID de la sala es obligatorio' })
  @IsUUID('all', { message: 'El ID de la sala debe ser un UUID válido' })
  roomId: string;
}

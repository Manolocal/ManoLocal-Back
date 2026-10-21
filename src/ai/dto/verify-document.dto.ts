import { IsNotEmpty, IsUUID } from 'class-validator';

export class VerifyDocumentDto {
  @IsNotEmpty({ message: 'El ID del conocimiento es requerido' })
  @IsUUID('4', { message: 'El ID del conocimiento debe ser un UUID válido' })
  knowledgeId: string;
}

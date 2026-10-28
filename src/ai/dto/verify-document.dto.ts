import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyDocumentDto {
  @ApiProperty({
    description: 'UUID del conocimiento/oficio a respaldar con el certificado',
    example: 'a80e73fe-14e1-44fe-afc8-331afdc300e1',
  })
  @IsNotEmpty({ message: 'El ID del conocimiento es requerido' })
  @IsUUID('4', { message: 'El ID del conocimiento debe ser un UUID válido' })
  knowledgeId: string;
}

import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateKnowledgeDto {
  @IsArray({ message: 'Los conocimientos deben enviarse como una lista' })
  @ArrayNotEmpty({ message: 'Debe registrar al menos un conocimiento' })
  @ArrayMaxSize(50, {
    message: 'No puede registrar más de 50 conocimientos',
  })
  @IsString({
    each: true,
    message: 'Cada conocimiento debe ser una cadena de texto',
  })
  @MaxLength(100, {
    each: true,
    message: 'Cada conocimiento no puede exceder 100 caracteres',
  })
  knowledges: string[];
}

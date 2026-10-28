import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { IsPostalCodeMx } from '../../common/validators/is-postal-code-mx.validator';

export class SearchSpecialistsDto extends PaginationQueryDto {
  /**
   * Nombre o término clave del oficio o conocimiento buscado (ej: 'Plomero', 'Electricista').
   */
  @ApiProperty({
    description: 'Nombre o término clave del oficio o habilidad buscada',
    example: 'Plomero',
  })
  @IsNotEmpty({ message: 'El término de búsqueda (oficio/conocimiento) es requerido' })
  @IsString({ message: 'El término de búsqueda debe ser una cadena de texto' })
  skill: string;

  /**
   * Código Postal opcional para realizar la búsqueda en una ubicación específica distinta
   * a la del perfil registrado del empleador.
   */
  @ApiPropertyOptional({
    description: 'Código Postal de 5 dígitos (opcional, si se omite usa el del perfil)',
    example: '01000',
  })
  @IsOptional()
  @IsPostalCodeMx({ message: 'El código postal debe tener 5 dígitos numéricos válidos de México' })
  postalCode?: string;
}

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { SearchService } from './services/search.service';
import { CopomexService } from './services/copomex.service';
import { SearchSpecialistsDto } from './dto/search-specialists.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Búsqueda & Geolocalización')
@ApiBearerAuth('JWT-Auth')
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly copomexService: CopomexService,
  ) {}

  /**
   * Búsqueda geolocalizada de especialistas (BACK-05).
   */
  @ApiOperation({
    summary: 'Buscar especialistas por oficio y geofiltro de municipio (SEPOMEX / Copomex)',
    description:
      'Detecta automáticamente el Código Postal del perfil del empleador autenticado (o permite especificar uno) y filtra especialistas dentro del mismo municipio que posean el oficio buscado.',
  })
  @Get('specialists')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLEADOR, Role.ADMIN)
  async searchSpecialists(
    @CurrentUser('id') userId: string,
    @Query() query: SearchSpecialistsDto,
  ) {
    return this.searchService.searchSpecialists(userId, query);
  }

  /**
   * Endpoint de diagnóstico e información geográfica (BACK-05).
   */
  @ApiOperation({
    summary: 'Consultar información geográfica y lista de CPs municipales de un Código Postal',
  })
  @Get('geo-info/:cp')
  @UseGuards(JwtAuthGuard)
  async getGeoInfo(@Param('cp') cp: string) {
    return this.copomexService.getPostalCodesForCp(cp);
  }
}

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

@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly copomexService: CopomexService,
  ) {}

  /**
   * Búsqueda geolocalizada de especialistas (BACK-05).
   */
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
  @Get('geo-info/:cp')
  @UseGuards(JwtAuthGuard)
  async getGeoInfo(@Param('cp') cp: string) {
    return this.copomexService.getPostalCodesForCp(cp);
  }
}

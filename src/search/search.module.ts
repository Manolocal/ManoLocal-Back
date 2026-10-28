import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './services/search.service';
import { CopomexService } from './services/copomex.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, CopomexService],
  exports: [SearchService, CopomexService],
})
export class SearchModule {}

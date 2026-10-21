import { Global, Module } from '@nestjs/common';
import { SupabaseStorageHelper } from './helpers/supabase-storage.helper';
import { HttpModule } from './http/http.module';

@Global()
@Module({
  imports: [HttpModule],
  providers: [SupabaseStorageHelper],
  exports: [SupabaseStorageHelper, HttpModule],
})
export class CommonModule {}

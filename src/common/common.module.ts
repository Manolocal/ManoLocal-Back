import { Global, Module } from '@nestjs/common';
import { SupabaseStorageHelper } from './helpers/supabase-storage.helper';

@Global()
@Module({
  providers: [SupabaseStorageHelper],
  exports: [SupabaseStorageHelper],
})
export class CommonModule {}

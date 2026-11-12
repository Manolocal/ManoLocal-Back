import { Global, Module } from '@nestjs/common';
import { SupabaseStorageHelper } from './helpers/supabase-storage.helper';
import { HttpModule } from './http/http.module';
import { TransactionManager } from './database/transaction.manager';

@Global()
@Module({
  imports: [HttpModule],
  providers: [SupabaseStorageHelper, TransactionManager],
  exports: [SupabaseStorageHelper, HttpModule, TransactionManager],
})
export class CommonModule {}

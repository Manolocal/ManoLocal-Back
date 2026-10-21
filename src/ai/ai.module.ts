import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { MockOcrProvider } from './providers/mock-ocr.provider';
import { OCR_PROVIDER } from './interfaces/ocr-provider.interface';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    {
      provide: OCR_PROVIDER,
      useClass: MockOcrProvider,
    },
  ],
  exports: [AiService],
})
export class AiModule {}

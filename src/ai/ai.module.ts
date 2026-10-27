import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { GeminiService } from './gemini.service';
import { GeminiOcrProvider } from './providers/gemini-ocr.provider';
import { OCR_PROVIDER } from './interfaces/ocr-provider.interface';

@Module({
  controllers: [AiController],
  providers: [
    GeminiService,
    GeminiOcrProvider,
    {
      provide: OCR_PROVIDER,
      useClass: GeminiOcrProvider,
    },
    AiService,
  ],
  exports: [AiService, GeminiService],
})
export class AiModule {}

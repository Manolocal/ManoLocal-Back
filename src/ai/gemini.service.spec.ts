import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiService } from './gemini.service';
import { GeminiOcrProvider } from './providers/gemini-ocr.provider';

describe('GeminiService & GeminiOcrProvider', () => {
  describe('GeminiService - without API key (fallback mode)', () => {
    let service: GeminiService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GeminiService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'GEMINI_API_KEY') return '';
                if (key === 'GEMINI_MODEL') return 'gemini-2.5-flash';
                return null;
              }),
            },
          },
        ],
      }).compile();

      service = module.get<GeminiService>(GeminiService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should report isAvailable as false when API key is missing', () => {
      expect(service.isAvailable()).toBe(false);
    });

    it('should return default model name', () => {
      expect(service.getModelName()).toBe('gemini-2.5-flash');
    });

    it('should throw error when calling generateText without API key', async () => {
      await expect(service.generateText('Hola')).rejects.toThrow(
        'La API Key de Gemini no está configurada',
      );
    });

    it('should throw error when calling generateJson without API key', async () => {
      await expect(service.generateJson('Hola')).rejects.toThrow(
        'La API Key de Gemini no está configurada',
      );
    });
  });

  describe('GeminiOcrProvider - fallback behavior', () => {
    let provider: GeminiOcrProvider;
    let geminiService: GeminiService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GeminiOcrProvider,
          {
            provide: GeminiService,
            useValue: {
              isAvailable: jest.fn().mockReturnValue(false),
              analyzeFileJson: jest.fn(),
            },
          },
        ],
      }).compile();

      provider = module.get<GeminiOcrProvider>(GeminiOcrProvider);
      geminiService = module.get<GeminiService>(GeminiService);
    });

    it('should fallback to simulated validation when Gemini is unavailable', async () => {
      const result = await provider.verifyDocument({
        fileUrl: 'https://storage/diploma.png',
        knowledgeName: 'Plomería',
      });

      expect(result.isValid).toBe(true);
      expect(result.provider).toBe('gemini-fallback');
      expect(result.score).toBe(1.0);
    });

    it('should use Gemini multimodal vision when available and return parsed result', async () => {
      (geminiService.isAvailable as jest.Mock).mockReturnValue(true);
      (geminiService.analyzeFileJson as jest.Mock).mockResolvedValue({
        isValid: true,
        score: 0.95,
        reason: 'Certificado de plomería avalado por CONOCER',
      });

      const result = await provider.verifyDocument({
        fileUrl: 'https://storage/diploma.png',
        knowledgeName: 'Plomería',
        mimeType: 'image/png',
        fileBuffer: Buffer.from('fake-image-bytes'),
      });

      expect(geminiService.analyzeFileJson).toHaveBeenCalled();
      expect(result.isValid).toBe(true);
      expect(result.provider).toBe('gemini');
      expect(result.score).toBe(0.95);
      expect(result.reason).toContain('Certificado de plomería');
    });

    it('should catch Gemini exceptions and safely fallback', async () => {
      (geminiService.isAvailable as jest.Mock).mockReturnValue(true);
      (geminiService.analyzeFileJson as jest.Mock).mockRejectedValue(
        new Error('API quota exceeded'),
      );

      const result = await provider.verifyDocument({
        fileUrl: 'https://storage/diploma.png',
        knowledgeName: 'Electricidad',
        mimeType: 'image/png',
        fileBuffer: Buffer.from('fake'),
      });

      expect(result.isValid).toBe(true);
      expect(result.provider).toBe('gemini-fallback');
    });
  });
});

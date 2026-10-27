import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

export interface GenerateOptions {
  model?: string;
  systemInstruction?: string;
  temperature?: number;
}

/**
 * Servicio general de Inteligencia Artificial potenciado por Google Gemini.
 *
 * Expone capacidades reutilizables para cualquier módulo de la aplicación:
 * - Generación de texto y respuestas conversacionales.
 * - Respuestas estructuradas en formato JSON.
 * - Análisis multimodal de imágenes y documentos (OCR/Vision).
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly client: GoogleGenerativeAI | null = null;
  private readonly defaultModelName: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.defaultModelName =
      this.configService.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';

    if (
      apiKey &&
      apiKey !== '[YOUR_GEMINI_API_KEY]' &&
      !apiKey.startsWith('[') &&
      apiKey.trim().length > 0
    ) {
      this.client = new GoogleGenerativeAI(apiKey);
      this.logger.log(
        `Gemini AI inicializado exitosamente con modelo base "${this.defaultModelName}".`,
      );
    } else {
      this.logger.warn(
        'GEMINI_API_KEY no está configurada en .env. El módulo de IA utilizará respuestas simuladas (Mock) hasta que agregues una clave válida.',
      );
    }
  }

  /** Indica si la API Key de Gemini está configurada y lista. */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /** Obtiene el nombre del modelo configurado. */
  getModelName(): string {
    return this.defaultModelName;
  }

  private getModel(options?: GenerateOptions): GenerativeModel {
    if (!this.client) {
      throw new Error(
        'La API Key de Gemini no está configurada. Por favor agrega GEMINI_API_KEY en tu archivo .env.',
      );
    }
    const modelName = options?.model ?? this.defaultModelName;
    return this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: options?.systemInstruction,
      generationConfig: {
        temperature: options?.temperature ?? 0.4,
      },
    });
  }

  /**
   * Genera texto a partir de un prompt usando Gemini.
   * Utilizable por cualquier módulo (ej. asistente de tickets, sugerencias de texto, etc.)
   */
  async generateText(
    prompt: string,
    options?: GenerateOptions,
  ): Promise<string> {
    const model = this.getModel(options);
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  /**
   * Genera una respuesta estructurada garantizada en JSON.
   */
  async generateJson<T>(
    prompt: string,
    options?: GenerateOptions,
  ): Promise<T> {
    if (!this.client) {
      throw new Error(
        'La API Key de Gemini no está configurada. Por favor agrega GEMINI_API_KEY en tu archivo .env.',
      );
    }
    const modelName = options?.model ?? this.defaultModelName;
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: options?.systemInstruction,
      generationConfig: {
        temperature: options?.temperature ?? 0.2,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text) as T;
  }

  /**
   * Analiza un archivo (imagen, foto de catálogo, diploma o PDF) de forma multimodal.
   */
  async analyzeFile(
    fileBuffer: Buffer,
    mimeType: string,
    prompt: string,
    options?: GenerateOptions,
  ): Promise<string> {
    const model = this.getModel(options);
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: fileBuffer.toString('base64'),
          mimeType,
        },
      },
    ]);
    return result.response.text();
  }

  /**
   * Analiza un archivo de forma multimodal y devuelve una respuesta estructurada en JSON.
   */
  async analyzeFileJson<T>(
    fileBuffer: Buffer,
    mimeType: string,
    prompt: string,
    options?: GenerateOptions,
  ): Promise<T> {
    if (!this.client) {
      throw new Error(
        'La API Key de Gemini no está configurada. Por favor agrega GEMINI_API_KEY en tu archivo .env.',
      );
    }
    const modelName = options?.model ?? this.defaultModelName;
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: options?.systemInstruction,
      generationConfig: {
        temperature: options?.temperature ?? 0.2,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: fileBuffer.toString('base64'),
          mimeType,
        },
      },
    ]);
    const text = result.response.text();
    return JSON.parse(text) as T;
  }
}

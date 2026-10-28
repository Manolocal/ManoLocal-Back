import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';
import { VerifyDocumentDto } from './dto/verify-document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { documentFileFilter } from '../common/helpers/document-file-filter';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';

const DOCUMENT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@ApiTags('Inteligencia Artificial')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @ApiBearerAuth('JWT-Auth')
  @ApiOperation({
    summary:
      'Verificar documento/certificado de oficio con Gemini AI y OCR',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Documento probatorio (PDF o imagen) y el ID del oficio asociado',
    schema: {
      type: 'object',
      required: ['knowledgeId', 'document'],
      properties: {
        knowledgeId: {
          type: 'string',
          format: 'uuid',
          description: 'UUID del oficio/conocimiento al que corresponde el certificado',
          example: 'a80e73fe-14e1-44fe-afc8-331afdc300e1',
        },
        document: {
          type: 'string',
          format: 'binary',
          description: 'Archivo PDF o imagen del certificado/título (máx 10MB)',
        },
      },
    },
  })
  @Post('verify-document')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ESPECIALISTA)
  @UseInterceptors(
    FileInterceptor('document', {
      limits: { fileSize: DOCUMENT_MAX_FILE_SIZE },
      fileFilter: documentFileFilter,
    }),
  )
  verifyDocument(
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.aiService.verifyDocument(user.id, user.role, dto, file);
  }

  @ApiBearerAuth('JWT-Auth')
  @ApiOperation({ summary: 'Obtener historial de verificaciones de un oficio/conocimiento' })
  @Get('knowledge/:knowledgeId/verifications')
  @UseGuards(JwtAuthGuard)
  getKnowledgeVerifications(
    @CurrentUser('id') userId: string,
    @Param('knowledgeId', new ParseUUIDPipe()) knowledgeId: string,
  ) {
    return this.aiService.getKnowledgeVerifications(userId, knowledgeId);
  }

  @ApiOperation({ summary: 'Consultar estado y disponibilidad de Google Gemini AI' })
  @Get('status')
  getStatus() {
    return {
      provider: 'google-gemini',
      isConfigured: this.aiService.isGeminiConfigured(),
      model: this.aiService.getGeminiModelName(),
    };
  }

  @ApiBearerAuth('JWT-Auth')
  @ApiOperation({ summary: 'Generación general de texto con Gemini AI' })
  @Post('generate-text')
  @UseGuards(JwtAuthGuard)
  async generateText(@Body() body: { prompt?: string }) {
    if (!body?.prompt || typeof body.prompt !== 'string') {
      throw new BadRequestException('El campo "prompt" es requerido');
    }
    const response = await this.aiService.generateText(body.prompt);
    return { prompt: body.prompt, response };
  }
}

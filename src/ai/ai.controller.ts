import {
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

const DOCUMENT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('verify-document')
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

  @Get('knowledge/:knowledgeId/verifications')
  getKnowledgeVerifications(
    @CurrentUser('id') userId: string,
    @Param('knowledgeId', new ParseUUIDPipe()) knowledgeId: string,
  ) {
    return this.aiService.getKnowledgeVerifications(userId, knowledgeId);
  }
}

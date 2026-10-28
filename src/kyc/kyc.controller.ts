import {
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { KycService } from './kyc.service';
import type { KycFiles } from './kyc.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { imageFileFilter } from '../common/helpers/image-file-filter';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';

const KYC_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

@ApiTags('Verificación KYC')
@ApiBearerAuth('JWT-Auth')
@Controller('kyc')
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @ApiOperation({
    summary:
      'Subir documentos de identidad (INE frontal/reverso y selfie con rostro descubierto)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Fotografías de INE y Selfie en formato JPG, PNG o WebP (máx 5MB cada una)',
    schema: {
      type: 'object',
      required: ['ine', 'selfie'],
      properties: {
        ine: {
          type: 'string',
          format: 'binary',
          description: 'Fotografía de la credencial de elector (INE)',
        },
        selfie: {
          type: 'string',
          format: 'binary',
          description: 'Fotografía selfie del usuario con rostro descubierto',
        },
      },
    },
  })
  @Post('documents')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'ine', maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
      ],
      {
        limits: { fileSize: KYC_MAX_FILE_SIZE },
        fileFilter: imageFileFilter,
      },
    ),
  )
  uploadDocuments(
    @CurrentUser('id') userId: string,
    @UploadedFiles() files: KycFiles,
  ) {
    return this.kycService.uploadDocuments(userId, files);
  }
}

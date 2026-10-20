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

const KYC_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

@Controller('kyc')
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(private readonly kycService: KycService) {}

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

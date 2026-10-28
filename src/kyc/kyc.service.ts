import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageHelper } from '../common/helpers/supabase-storage.helper';
import { UsersService } from '../users/users.service';

export interface KycFiles {
  ine?: Express.Multer.File[];
  selfie?: Express.Multer.File[];
}

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageHelper,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Sube la foto del INE y la selfie a Supabase Storage, guarda las URLs
   * públicas en el perfil del usuario y recalcula su estatus.
   */
  async uploadDocuments(userId: string, files?: KycFiles) {
    const ine = files?.ine?.[0];
    const selfie = files?.selfie?.[0];

    if (!ine || !selfie) {
      throw new BadRequestException(
        'Debes adjuntar la foto del INE (campo "ine") y la selfie (campo "selfie")',
      );
    }

    const [ineUrl, selfieUrl] = await Promise.all([
      this.storage.uploadFile(ine, { folder: `kyc/${userId}/ine` }),
      this.storage.uploadFile(selfie, { folder: `kyc/${userId}/selfie` }),
    ]);

    await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, ineUrl, selfieUrl },
      update: { ineUrl, selfieUrl },
    });

    await this.usersService.refreshStatus(userId);

    return this.prisma.profile.findUnique({
      where: { userId },
      select: {
        ineUrl: true,
        selfieUrl: true,
        user: { select: { status: true } },
      },
    });
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageHelper } from '../common/helpers/supabase-storage.helper';
import { UploadCatalogImageDto } from './dto/upload-catalog-image.dto';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';

export const MAX_CATALOG_IMAGES_PER_SPECIALIST = 10;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageHelper,
  ) {}

  /**
   * Sube una foto de trabajo al catálogo del especialista.
   * Valida cuota máxima de 10 fotos activas simultáneas.
   */
  async uploadImage(
    userId: string,
    dto: UploadCatalogImageDto,
    file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Debe adjuntar una imagen válida');
    }

    const activeCount = await this.prisma.catalogImage.count({
      where: { userId, isActive: true },
    });

    if (activeCount >= MAX_CATALOG_IMAGES_PER_SPECIALIST) {
      throw new BadRequestException(
        `Has alcanzado el límite máximo permitido de ${MAX_CATALOG_IMAGES_PER_SPECIALIST} fotos activas en tu catálogo. Elimina alguna para poder subir una nueva.`,
      );
    }

    const imageUrl = await this.storage.uploadFile(file, {
      bucket: this.storage.getCatalogBucket(),
      folder: `catalog/${userId}`,
    });

    const image = await this.prisma.catalogImage.create({
      data: {
        userId,
        imageUrl,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
      },
      select: {
        id: true,
        userId: true,
        imageUrl: true,
        title: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const currentActive = activeCount + 1;
    return {
      message: 'Foto subida exitosamente al catálogo',
      image,
      quota: {
        active: currentActive,
        limit: MAX_CATALOG_IMAGES_PER_SPECIALIST,
        remaining: Math.max(0, MAX_CATALOG_IMAGES_PER_SPECIALIST - currentActive),
      },
    };
  }

  /**
   * Obtiene la lista de fotos activas del especialista autenticado con su cuota.
   */
  async getMyImages(userId: string) {
    const images = await this.prisma.catalogImage.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        imageUrl: true,
        title: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      images,
      quota: {
        active: images.length,
        limit: MAX_CATALOG_IMAGES_PER_SPECIALIST,
        remaining: Math.max(0, MAX_CATALOG_IMAGES_PER_SPECIALIST - images.length),
      },
    };
  }

  /**
   * Obtiene la galería pública de fotos de un especialista determinado.
   */
  async getSpecialistImages(specialistId: string) {
    const specialist = await this.prisma.user.findUnique({
      where: { id: specialistId },
      select: {
        id: true,
        name: true,
        role: true,
        status: true,
      },
    });

    if (
      !specialist ||
      specialist.role !== Role.ESPECIALISTA ||
      specialist.status === UserStatus.INACTIVO
    ) {
      throw new NotFoundException('Especialista no encontrado o inactivo');
    }

    const images = await this.prisma.catalogImage.findMany({
      where: { userId: specialistId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        imageUrl: true,
        title: true,
        description: true,
        createdAt: true,
      },
    });

    return {
      specialist: {
        id: specialist.id,
        name: specialist.name,
      },
      images,
    };
  }

  /**
   * Soft delete de una foto del catálogo.
   * Solo el especialista dueño de la foto o un administrador pueden eliminarla.
   * Al desactivarla (`isActive: false`), libera inmediatamente un espacio de la cuota.
   */
  async deleteImage(userId: string, userRole: Role, imageId: string) {
    const image = await this.prisma.catalogImage.findUnique({
      where: { id: imageId },
    });

    if (!image || !image.isActive) {
      throw new NotFoundException(
        'La foto especificada no existe en el catálogo',
      );
    }

    if (userRole !== Role.ADMIN && image.userId !== userId) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar esta foto del catálogo',
      );
    }

    await this.prisma.catalogImage.update({
      where: { id: imageId },
      data: {
        isActive: false,
        deletedAt: new Date(),
      },
    });

    return {
      message: 'Foto eliminada exitosamente del catálogo',
    };
  }
}

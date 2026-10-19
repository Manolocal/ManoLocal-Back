import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';

const USER_COMPLETION_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  createdAt: true,
  profile: true,
  knowledges: {
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' as const },
  },
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Estado completo del usuario autenticado: datos, perfil, conocimientos y estatus. */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_COMPLETION_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  /** Crea o actualiza los datos personales del perfil (parcial, tipo PATCH). */
  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const existingProfile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    if (!existingProfile && !updateProfileDto.fullName) {
      throw new BadRequestException(
        'El nombre completo es obligatorio para crear el perfil',
      );
    }

    await this.prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        fullName: updateProfileDto.fullName ?? null,
        phone: updateProfileDto.phone,
        address: updateProfileDto.address,
        postalCode: updateProfileDto.postalCode,
      },
      update: {
        ...(updateProfileDto.fullName !== undefined && {
          fullName: updateProfileDto.fullName,
        }),
        ...(updateProfileDto.phone !== undefined && {
          phone: updateProfileDto.phone,
        }),
        ...(updateProfileDto.address !== undefined && {
          address: updateProfileDto.address,
        }),
        ...(updateProfileDto.postalCode !== undefined && {
          postalCode: updateProfileDto.postalCode,
        }),
      },
    });

    // Mantener el nombre principal del usuario en sincronía con el perfil
    if (updateProfileDto.fullName) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { name: updateProfileDto.fullName },
      });
    }

    await this.refreshStatus(userId);
    return this.getMe(userId);
  }

  /** Reemplaza la lista de conocimientos de un ESPECIALISTA. */
  async updateKnowledge(
    userId: string,
    role: Role,
    updateKnowledgeDto: UpdateKnowledgeDto,
  ) {
    if (role !== Role.ESPECIALISTA) {
      throw new ForbiddenException(
        'Solo los especialistas pueden registrar conocimientos',
      );
    }

    const knowledges = [
      ...new Set(
        updateKnowledgeDto.knowledges
          .map((name) => name.trim())
          .filter(Boolean),
      ),
    ];

    if (knowledges.length === 0) {
      throw new BadRequestException('Debe registrar al menos un conocimiento');
    }

    await this.prisma.$transaction([
      this.prisma.knowledge.deleteMany({ where: { userId } }),
      this.prisma.knowledge.createMany({
        data: knowledges.map((name) => ({ userId, name })),
      }),
    ]);

    await this.refreshStatus(userId);

    return this.prisma.knowledge.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Recalcula el estatus del usuario según cuánto ha completado su cuenta:
   * - Perfil con datos personales completos.
   * - Documentos KYC (INE + selfie) subidos.
   * - Al menos un conocimiento (solo aplica a ESPECIALISTA).
   *
   * Si todo está completo pasa a PENDIENTE_VALIDACION (aprobación manual en BACK-11);
   * un usuario ya aprobado (ACTIVO) nunca se degrada.
   */
  async refreshStatus(userId: string): Promise<UserStatus> {
    const [user, profile, knowledgeCount] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, status: true },
      }),
      this.prisma.profile.findUnique({
        where: { userId },
        select: {
          fullName: true,
          phone: true,
          address: true,
          postalCode: true,
          ineUrl: true,
          selfieUrl: true,
        },
      }),
      this.prisma.knowledge.count({ where: { userId } }),
    ]);

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.status === UserStatus.ACTIVO) {
      return user.status;
    }

    const personalDataComplete =
      !!profile?.fullName &&
      !!profile.phone &&
      !!profile.address &&
      !!profile.postalCode;
    const kycComplete = !!profile?.ineUrl && !!profile?.selfieUrl;
    const knowledgeComplete =
      user.role !== Role.ESPECIALISTA || knowledgeCount > 0;

    const targetStatus =
      personalDataComplete && kycComplete && knowledgeComplete
        ? UserStatus.PENDIENTE_VALIDACION
        : UserStatus.INACTIVO;

    if (user.status !== targetStatus) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { status: targetStatus },
      });
    }

    return targetStatus;
  }
}

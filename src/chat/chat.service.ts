import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { GetMessagesQueryDto } from './dto/get-messages.dto';
import { Role } from '../common/enums/role.enum';

const USER_PREVIEW_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  profile: {
    select: {
      fullName: true,
      phone: true,
    },
  },
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtiene o crea la sala única entre un Empleador y un Especialista.
   */
  async getOrCreateRoom(currentUserId: string, dto: CreateRoomDto) {
    const targetUserId = dto.targetUserId || dto.specialistId || dto.employerId;

    if (!targetUserId) {
      throw new BadRequestException(
        'Debes especificar el ID del usuario contraparte (specialistId o targetUserId)',
      );
    }

    if (currentUserId === targetUserId) {
      throw new BadRequestException(
        'No puedes crear una sala de chat contigo mismo',
      );
    }

    const [currentUser, targetUser] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: currentUserId },
        select: { id: true, role: true, name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, role: true, name: true },
      }),
    ]);

    if (!currentUser || !targetUser) {
      throw new NotFoundException('Uno de los usuarios no existe');
    }

    // Determinar qué usuario funge como empleador y cuál como especialista
    let employerId: string;
    let specialistId: string;

    if (currentUser.role === Role.ESPECIALISTA) {
      specialistId = currentUser.id;
      employerId = targetUser.id;
    } else if (targetUser.role === Role.ESPECIALISTA) {
      specialistId = targetUser.id;
      employerId = currentUser.id;
    } else {
      // Si ninguno es explícitamente especialista o ambos son empleadores/admin
      employerId = currentUser.id;
      specialistId = targetUser.id;
    }

    // Verificar si ya existe la sala única
    let room = await this.prisma.chatRoom.findUnique({
      where: {
        employerId_specialistId: {
          employerId,
          specialistId,
        },
      },
      include: {
        employer: { select: USER_PREVIEW_SELECT },
        specialist: { select: USER_PREVIEW_SELECT },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!room) {
      room = await this.prisma.chatRoom.create({
        data: {
          employerId,
          specialistId,
        },
        include: {
          employer: { select: USER_PREVIEW_SELECT },
          specialist: { select: USER_PREVIEW_SELECT },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      this.logger.log(
        `Nueva sala de chat creada entre Empleador (${employerId}) y Especialista (${specialistId}): ${room.id}`,
      );
    }

    return room;
  }

  /**
   * Valida que el usuario pertenezca a la sala privada de chat.
   */
  async validateRoomAccess(userId: string, roomId: string) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundException(`La sala de chat ${roomId} no existe`);
    }

    if (room.employerId !== userId && room.specialistId !== userId) {
      throw new ForbiddenException(
        'No tienes autorización para acceder a esta sala privada de chat',
      );
    }

    return room;
  }

  /**
   * Guarda un nuevo mensaje en la base de datos dentro de la sala correspondiente.
   */
  async saveMessage(senderId: string, dto: SendMessageDto) {
    await this.validateRoomAccess(senderId, dto.roomId);

    const message = await this.prisma.message.create({
      data: {
        roomId: dto.roomId,
        senderId,
        content: dto.content.trim(),
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    // Actualizar timestamp de la sala para ordenamiento reciente
    await this.prisma.chatRoom.update({
      where: { id: dto.roomId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  /**
   * Consulta el historial de mensajes de una sala con paginación persistente.
   */
  async getRoomMessages(
    userId: string,
    roomId: string,
    query: GetMessagesQueryDto,
  ) {
    await this.validateRoomAccess(userId, roomId);

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 50;
    const skip = (page - 1) * limit;

    const [total, messages] = await Promise.all([
      this.prisma.message.count({ where: { roomId } }),
      this.prisma.message.findMany({
        where: { roomId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
    ]);

    // Devolver en orden cronológico ascendente para renderizado fácil en clientes
    const chronologicalMessages = [...messages].reverse();

    return {
      data: chronologicalMessages,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtiene todas las salas activas de un usuario con su último mensaje.
   */
  async getUserRooms(userId: string) {
    const rooms = await this.prisma.chatRoom.findMany({
      where: {
        OR: [{ employerId: userId }, { specialistId: userId }],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        employer: { select: USER_PREVIEW_SELECT },
        specialist: { select: USER_PREVIEW_SELECT },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            sender: {
              select: { id: true, name: true, role: true },
            },
          },
        },
      },
    });

    return rooms.map((room) => {
      const isEmployer = room.employerId === userId;
      const counterpart = isEmployer ? room.specialist : room.employer;
      const lastMessage = room.messages[0] || null;

      return {
        id: room.id,
        employerId: room.employerId,
        specialistId: room.specialistId,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        counterpart,
        lastMessage,
      };
    });
  }

  /**
   * Marca mensajes de la sala como leídos.
   */
  async markMessagesAsRead(userId: string, roomId: string) {
    await this.validateRoomAccess(userId, roomId);

    const updateResult = await this.prisma.message.updateMany({
      where: {
        roomId,
        senderId: { not: userId },
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    return {
      roomId,
      markedCount: updateResult.count,
    };
  }
}

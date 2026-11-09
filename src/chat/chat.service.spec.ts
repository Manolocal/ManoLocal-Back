import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enums/role.enum';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: jest.Mocked<PrismaService>;

  const mockEmployer = {
    id: 'emp-1',
    role: Role.EMPLEADOR,
    name: 'Carlos Empleador',
  };

  const mockSpecialist = {
    id: 'spec-1',
    role: Role.ESPECIALISTA,
    name: 'Mario Plomero',
  };

  const mockRoom = {
    id: 'room-1',
    employerId: 'emp-1',
    specialistId: 'spec-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    employer: mockEmployer,
    specialist: mockSpecialist,
    messages: [],
  };

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      chatRoom: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      message: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    prisma = module.get(PrismaService);
  });

  describe('getOrCreateRoom', () => {
    it('should throw BadRequestException if creating room with oneself', async () => {
      await expect(
        service.getOrCreateRoom('user-1', { specialistId: 'user-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if one of the users does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.getOrCreateRoom('emp-1', { specialistId: 'spec-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return existing room if already created', async () => {
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockEmployer)
        .mockResolvedValueOnce(mockSpecialist);

      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue(mockRoom);

      const result = await service.getOrCreateRoom('emp-1', {
        specialistId: 'spec-1',
      });

      expect(result).toEqual(mockRoom);
      expect(prisma.chatRoom.create).not.toHaveBeenCalled();
    });

    it('should create new room if not found', async () => {
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockEmployer)
        .mockResolvedValueOnce(mockSpecialist);

      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.chatRoom.create as jest.Mock).mockResolvedValue(mockRoom);

      const result = await service.getOrCreateRoom('emp-1', {
        specialistId: 'spec-1',
      });

      expect(result).toEqual(mockRoom);
      expect(prisma.chatRoom.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            employerId: 'emp-1',
            specialistId: 'spec-1',
          },
        }),
      );
    });
  });

  describe('validateRoomAccess', () => {
    it('should throw NotFoundException if room does not exist', async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.validateRoomAccess('emp-1', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is neither employer nor specialist', async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue(mockRoom);

      await expect(
        service.validateRoomAccess('intruder-id', 'room-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return room if user has permission', async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue(mockRoom);

      const result = await service.validateRoomAccess('emp-1', 'room-1');
      expect(result).toEqual(mockRoom);
    });
  });

  describe('saveMessage', () => {
    it('should persist message and update room timestamp', async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue(mockRoom);
      (prisma.chatRoom.update as jest.Mock).mockResolvedValue(mockRoom);

      const mockSavedMessage = {
        id: 'msg-1',
        roomId: 'room-1',
        senderId: 'emp-1',
        content: 'Hola, ¿cuándo puedes venir?',
        isRead: false,
        createdAt: new Date(),
        sender: {
          id: 'emp-1',
          name: 'Carlos Empleador',
          email: 'emp@test.com',
          role: Role.EMPLEADOR,
        },
      };

      (prisma.message.create as jest.Mock).mockResolvedValue(mockSavedMessage);

      const result = await service.saveMessage('emp-1', {
        roomId: 'room-1',
        content: 'Hola, ¿cuándo puedes venir?',
      });

      expect(result).toEqual(mockSavedMessage);
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            roomId: 'room-1',
            senderId: 'emp-1',
            content: 'Hola, ¿cuándo puedes venir?',
          },
        }),
      );
      expect(prisma.chatRoom.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'room-1' },
        }),
      );
    });
  });

  describe('getRoomMessages', () => {
    it('should return paginated messages in ascending chronological order', async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue(mockRoom);
      (prisma.message.count as jest.Mock).mockResolvedValue(2);

      const msg1 = { id: '1', content: 'Primero', createdAt: new Date(1000) };
      const msg2 = { id: '2', content: 'Segundo', createdAt: new Date(2000) };

      // Prisma devuelve orden desc: [msg2, msg1]
      (prisma.message.findMany as jest.Mock).mockResolvedValue([msg2, msg1]);

      const result = await service.getRoomMessages('emp-1', 'room-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toEqual([msg1, msg2]);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });
  });

  describe('getUserRooms', () => {
    it('should return user rooms with counterpart and last message mapped', async () => {
      const roomWithMsg = {
        ...mockRoom,
        messages: [{ id: 'm1', content: 'Último mensaje' }],
      };
      (prisma.chatRoom.findMany as jest.Mock).mockResolvedValue([roomWithMsg]);

      const result = await service.getUserRooms('emp-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('room-1');
      expect(result[0].counterpart).toEqual(mockSpecialist);
      expect(result[0].lastMessage).toEqual({
        id: 'm1',
        content: 'Último mensaje',
      });
    });
  });

  describe('markMessagesAsRead', () => {
    it('should mark unread messages as read', async () => {
      (prisma.chatRoom.findUnique as jest.Mock).mockResolvedValue(mockRoom);
      (prisma.message.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

      const result = await service.markMessagesAsRead('emp-1', 'room-1');

      expect(result).toEqual({ roomId: 'room-1', markedCount: 3 });
      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          roomId: 'room-1',
          senderId: { not: 'emp-1' },
          isRead: false,
        },
        data: { isRead: true },
      });
    });
  });
});

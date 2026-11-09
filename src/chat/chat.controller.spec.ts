import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: jest.Mocked<ChatService>;

  const mockUser = {
    id: 'user-1',
    email: 'user1@example.com',
    name: 'Juan Perez',
    role: Role.EMPLEADOR,
    status: UserStatus.ACTIVO,
  };

  beforeEach(async () => {
    const mockChatService = {
      getOrCreateRoom: jest.fn(),
      getUserRooms: jest.fn(),
      getRoomMessages: jest.fn(),
      markMessagesAsRead: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: mockChatService,
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    chatService = module.get(ChatService);
  });

  it('should create or get room', async () => {
    const mockRoom = { id: 'room-1' };
    chatService.getOrCreateRoom.mockResolvedValue(mockRoom as any);

    const dto = { specialistId: 'spec-1' };
    const result = await controller.createOrGetRoom(mockUser, dto);

    expect(chatService.getOrCreateRoom).toHaveBeenCalledWith('user-1', dto);
    expect(result).toEqual(mockRoom);
  });

  it('should get user rooms', async () => {
    const mockRooms = [{ id: 'room-1' }];
    chatService.getUserRooms.mockResolvedValue(mockRooms as any);

    const result = await controller.getUserRooms(mockUser);

    expect(chatService.getUserRooms).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(mockRooms);
  });

  it('should get room messages', async () => {
    const mockResponse = {
      data: [],
      meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
    };
    chatService.getRoomMessages.mockResolvedValue(mockResponse);

    const query = { page: 1, limit: 20 };
    const result = await controller.getRoomMessages(mockUser, 'room-1', query);

    expect(chatService.getRoomMessages).toHaveBeenCalledWith(
      'user-1',
      'room-1',
      query,
    );
    expect(result).toEqual(mockResponse);
  });

  it('should mark messages as read', async () => {
    const mockResponse = { roomId: 'room-1', markedCount: 2 };
    chatService.markMessagesAsRead.mockResolvedValue(mockResponse);

    const result = await controller.markAsRead(mockUser, 'room-1');

    expect(chatService.markMessagesAsRead).toHaveBeenCalledWith(
      'user-1',
      'room-1',
    );
    expect(result).toEqual(mockResponse);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import type { Socket } from 'socket.io';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { JobsService } from '../jobs/jobs.service';
import { JobStateChangedEvent } from '../common/events/job-state-changed.event';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let chatService: jest.Mocked<ChatService>;
  let wsJwtGuard: jest.Mocked<WsJwtGuard>;
  let jobsService: {
    createJob: jest.Mock;
    confirmJob: jest.Mock;
    completeJob: jest.Mock;
    cancelJob: jest.Mock;
  };

  const mockUser = {
    id: 'user-1',
    email: 'user1@example.com',
    name: 'Juan Perez',
    role: Role.EMPLEADOR,
    status: UserStatus.ACTIVO,
  };

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const mockChatService = {
      validateRoomAccess: jest.fn(),
      saveMessage: jest.fn(),
      getRoomMessages: jest.fn(),
    };

    const mockWsJwtGuard = {
      canActivate: jest.fn().mockResolvedValue(true),
      validateSocket: jest.fn(),
    };

    const mockJobsService = {
      createJob: jest.fn(),
      confirmJob: jest.fn(),
      completeJob: jest.fn(),
      cancelJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        {
          provide: ChatService,
          useValue: mockChatService,
        },
        {
          provide: WsJwtGuard,
          useValue: mockWsJwtGuard,
        },
        {
          provide: JobsService,
          useValue: mockJobsService,
        },
      ],
    })
      .overrideGuard(WsJwtGuard)
      .useValue(mockWsJwtGuard)
      .compile();

    gateway = module.get<ChatGateway>(ChatGateway);
    chatService = module.get(ChatService);
    wsJwtGuard = module.get(WsJwtGuard);
    jobsService = module.get(JobsService);
    gateway.server = mockServer as any;
  });

  describe('handleConnection', () => {
    it('should authenticate client and assign user to client.data', async () => {
      wsJwtGuard.validateSocket.mockResolvedValue(mockUser);
      const mockClient = {
        id: 'socket-1',
        data: {},
        disconnect: jest.fn(),
        emit: jest.fn(),
      } as any;

      await gateway.handleConnection(mockClient);

      expect(mockClient.data.user).toEqual(mockUser);
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it('should emit error and disconnect client if validation fails', async () => {
      wsJwtGuard.validateSocket.mockResolvedValue(null);
      const mockClient = {
        id: 'socket-bad',
        data: {},
        disconnect: jest.fn(),
        emit: jest.fn(),
      } as any;

      await gateway.handleConnection(mockClient);

      expect(mockClient.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          statusCode: 401,
          error: 'Unauthorized',
        }),
      );
      expect(mockClient.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleJoinRoom', () => {
    it('should join socket to room after validating access', async () => {
      chatService.validateRoomAccess.mockResolvedValue({} as any);

      const mockClient = {
        data: { user: mockUser },
        join: jest.fn().mockResolvedValue(undefined),
      } as any;

      const result = await gateway.handleJoinRoom(mockClient, {
        roomId: 'room-123',
      });

      expect(chatService.validateRoomAccess).toHaveBeenCalledWith(
        'user-1',
        'room-123',
      );
      expect(mockClient.join).toHaveBeenCalledWith('room-123');
      expect(result.event).toBe('joined_room');
      expect(result.data.roomId).toBe('room-123');
    });
  });

  describe('handleSendMessage', () => {
    it('should save message and emit to room via server.to(roomId).emit', async () => {
      const mockSavedMessage = {
        id: 'msg-abc',
        roomId: 'room-123',
        senderId: 'user-1',
        content: 'Detalles del servicio de carpintería',
        createdAt: new Date(),
        isRead: false,
        sender: {
          id: 'user-1',
          name: 'Juan Perez',
          email: 'user1@example.com',
          role: Role.EMPLEADOR,
        },
      };

      chatService.saveMessage.mockResolvedValue(mockSavedMessage);

      const mockClient = {
        data: { user: mockUser },
      } as any;

      const dto = {
        roomId: 'room-123',
        content: 'Detalles del servicio de carpintería',
      };

      const result = await gateway.handleSendMessage(mockClient, dto);

      expect(chatService.saveMessage).toHaveBeenCalledWith('user-1', dto);
      expect(mockServer.to).toHaveBeenCalledWith('room-123');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'new_message',
        mockSavedMessage,
      );
      expect(result).toEqual({
        event: 'message_sent',
        data: mockSavedMessage,
      });
    });
  });

  describe('handleGetMessages', () => {
    it('should return room history', async () => {
      const mockHistory = {
        data: [],
        meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
      };
      chatService.getRoomMessages.mockResolvedValue(mockHistory);

      const mockClient = {
        data: { user: mockUser },
      } as any;

      const result = await gateway.handleGetMessages(mockClient, {
        roomId: 'room-123',
      });

      expect(chatService.getRoomMessages).toHaveBeenCalledWith(
        'user-1',
        'room-123',
        { page: undefined, limit: undefined },
      );
      expect(result).toEqual({
        event: 'room_messages',
        data: mockHistory,
      });
    });
  });

  describe('job agreement chat events (BACK-09)', () => {
    it('should broadcast job_updated to chat room on job.state_changed event', () => {
      const event = new JobStateChangedEvent(
        'job_updated',
        'CONFIRMED',
        'room-123',
        'spec-1',
        { id: 'job-1', status: 'CONFIRMED' },
        '2026-01-01T12:00:00.000Z',
      );

      gateway.handleJobStateChanged(event);

      expect(mockServer.to).toHaveBeenCalledWith('room-123');
      expect(mockServer.emit).toHaveBeenCalledWith('job_updated', {
        action: 'CONFIRMED',
        roomId: 'room-123',
        job: { id: 'job-1', status: 'CONFIRMED' },
        actorId: 'spec-1',
        timestamp: '2026-01-01T12:00:00.000Z',
      });
    });

    it('should handle create_job event via JobsService', async () => {
      const mockCreated = { message: 'ok', job: { id: 'job-1' } };
      jobsService.createJob.mockResolvedValue(mockCreated);
      const mockClient = {
        data: { user: mockUser },
      } as unknown as Socket;

      const result = await gateway.handleCreateJob(mockClient, {
        roomId: 'room-123',
        title: 'Plomería',
      });

      expect(jobsService.createJob).toHaveBeenCalledWith('user-1', {
        roomId: 'room-123',
        title: 'Plomería',
      });
      expect(result).toEqual({
        event: 'job_created_ack',
        data: mockCreated,
      });
    });

    it('should handle confirm_job event via JobsService', async () => {
      const mockConfirmed = { job: { id: 'job-1', status: 'CONFIRMED' } };
      jobsService.confirmJob.mockResolvedValue(mockConfirmed);
      const mockClient = {
        data: { user: mockUser },
      } as unknown as Socket;

      const result = await gateway.handleConfirmJob(mockClient, {
        jobId: 'job-1',
      });

      expect(jobsService.confirmJob).toHaveBeenCalledWith('user-1', 'job-1');
      expect(result).toEqual({
        event: 'job_confirmed',
        data: mockConfirmed,
      });
    });

    it('should handle complete_job event via JobsService', async () => {
      const mockCompleted = { job: { id: 'job-1', status: 'COMPLETED' } };
      jobsService.completeJob.mockResolvedValue(mockCompleted);
      const mockClient = {
        data: { user: mockUser },
      } as unknown as Socket;

      const result = await gateway.handleCompleteJob(mockClient, {
        jobId: 'job-1',
      });

      expect(jobsService.completeJob).toHaveBeenCalledWith('user-1', 'job-1');
      expect(result).toEqual({
        event: 'job_completed',
        data: mockCompleted,
      });
    });

    it('should handle cancel_job event via JobsService', async () => {
      const mockCancelled = { job: { id: 'job-1', status: 'CANCELLED' } };
      jobsService.cancelJob.mockResolvedValue(mockCancelled);
      const mockClient = {
        data: { user: mockUser },
      } as unknown as Socket;

      const result = await gateway.handleCancelJob(mockClient, {
        jobId: 'job-1',
        reason: 'Cambio de horario',
      });

      expect(jobsService.cancelJob).toHaveBeenCalledWith('user-1', 'job-1', {
        reason: 'Cambio de horario',
      });
      expect(result).toEqual({
        event: 'job_cancelled',
        data: mockCancelled,
      });
    });
  });
});

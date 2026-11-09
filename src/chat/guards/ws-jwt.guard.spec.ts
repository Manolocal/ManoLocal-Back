import { ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { WsJwtGuard } from './ws-jwt.guard';
import { Role } from '../../common/enums/role.enum';
import { UserStatus } from '../../common/enums/user-status.enum';

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let prisma: jest.Mocked<PrismaService>;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'user@example.com',
    name: 'Test User',
    role: Role.EMPLEADOR,
    status: UserStatus.ACTIVO,
  };

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn(),
    } as any;

    configService = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as any;

    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    } as any;

    guard = new WsJwtGuard(jwtService, configService, prisma);
  });

  const createMockContext = (clientData: any, handshake: any) =>
    ({
      switchToWs: () => ({
        getClient: () => ({
          id: 'socket-1',
          data: clientData,
          handshake,
        }),
      }),
    }) as unknown as ExecutionContext;

  it('should return true if client.data.user is already set', async () => {
    const context = createMockContext({ user: mockUser }, {});
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should authenticate from handshake.auth.token with Bearer prefix', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: mockUser.id,
      email: mockUser.email,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const clientData: any = {};
    const context = createMockContext(clientData, {
      auth: { token: 'Bearer valid.jwt.token' },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(clientData.user).toEqual(mockUser);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid.jwt.token', {
      secret: 'test-secret',
    });
  });

  it('should authenticate from handshake.headers.authorization', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: mockUser.id,
      email: mockUser.email,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const clientData: any = {};
    const context = createMockContext(clientData, {
      headers: { authorization: 'Bearer token123' },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(clientData.user).toEqual(mockUser);
  });

  it('should throw WsException if token is missing', async () => {
    const context = createMockContext({}, { auth: {}, headers: {} });

    await expect(guard.canActivate(context)).rejects.toThrow(WsException);
  });

  it('should throw WsException if JWT verification fails', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const context = createMockContext(
      {},
      { auth: { token: 'invalid.token' } },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(WsException);
  });

  it('should throw WsException if user is not found in database', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'non-existent-user' });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const context = createMockContext(
      {},
      { auth: { token: 'valid.token' } },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(WsException);
  });
});

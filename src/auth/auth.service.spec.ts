import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
  };

  const mockMailService = {
    sendTwoFactorCode: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should throw ConflictException if email is already in use', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
      });

      await expect(
        service.register({
          email: 'test@test.com',
          password: 'Password123!',
          role: Role.EMPLEADOR,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should hash password and create user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'u-1',
        email: 'test@test.com',
        name: 'Test User',
        role: Role.EMPLEADOR,
        createdAt: new Date(),
      });

      const result = await service.register({
        email: 'test@test.com',
        password: 'Password123!',
        role: Role.EMPLEADOR,
        name: 'Test User',
      });

      expect(result.id).toBe('u-1');
      expect(result.email).toBe('test@test.com');
      expect(mockPrismaService.user.create).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@test.com', password: 'Password123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      const hashedPassword = await bcrypt.hash('OtherPassword123!', 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        password: hashedPassword,
      });

      await expect(
        service.login({
          email: 'test@test.com',
          password: 'WrongPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should generate 6-digit 2FA code, update user and dispatch email', async () => {
      const password = 'Password123!';
      const hashedPassword = await bcrypt.hash(password, 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'test@test.com',
        password: hashedPassword,
      });
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.login({ email: 'test@test.com', password });

      expect(result.email).toBe('test@test.com');
      expect(result.message).toContain('2FA');
      const userUpdateMock = mockPrismaService.user.update;
      const [updateArgs] = userUpdateMock.mock.calls as Array<
        [{ where: { id: string }; data: { twoFactorCode: string } }]
      >;
      expect(updateArgs[0].where.id).toBe('u-1');
      expect(updateArgs[0].data.twoFactorCode).toMatch(/^[0-9]{6}$/);
      expect(mockMailService.sendTwoFactorCode).toHaveBeenCalledWith(
        'test@test.com',
        expect.stringMatching(/^[0-9]{6}$/),
      );
    });
  });

  describe('verify2fa', () => {
    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.verify2fa({ email: 'notfound@test.com', code: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if code is invalid', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'test@test.com',
        twoFactorCode: '654321',
        twoFactorExpiresAt: new Date(Date.now() + 60000),
      });

      await expect(
        service.verify2fa({ email: 'test@test.com', code: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if code is expired', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'test@test.com',
        twoFactorCode: '123456',
        twoFactorExpiresAt: new Date(Date.now() - 60000), // expired
      });

      await expect(
        service.verify2fa({ email: 'test@test.com', code: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should issue JWT accessToken and clear 2FA code on success', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'test@test.com',
        name: 'Test',
        role: Role.EMPLEADOR,
        twoFactorCode: '123456',
        twoFactorExpiresAt: new Date(Date.now() + 60000),
      });
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.verify2fa({
        email: 'test@test.com',
        code: '123456',
      });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.email).toBe('test@test.com');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { twoFactorCode: null, twoFactorExpiresAt: null },
      });
    });
  });
});

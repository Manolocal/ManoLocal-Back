import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Role } from '../common/enums/role.enum';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    verify2fa: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should delegate to authService.register', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'Password123!',
        role: Role.EMPLEADOR,
      };
      mockAuthService.register.mockResolvedValue({ id: '1', ...dto });

      const result = await controller.register(dto);
      expect(result).toEqual({ id: '1', ...dto });
      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
    });
  });

  describe('login', () => {
    it('should delegate to authService.login', async () => {
      const dto = { email: 'test@example.com', password: 'Password123!' };
      mockAuthService.login.mockResolvedValue({
        message: 'Código de verificación 2FA enviado al correo electrónico',
        email: dto.email,
      });

      const result = await controller.login(dto);
      expect(result.message).toContain('2FA');
      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
    });
  });

  describe('verify2fa', () => {
    it('should delegate to authService.verify2fa', async () => {
      const dto = { email: 'test@example.com', code: '123456' };
      mockAuthService.verify2fa.mockResolvedValue({
        accessToken: 'jwt-token',
        user: { id: '1', email: dto.email, role: Role.EMPLEADOR },
      });

      const result = await controller.verify2fa(dto);
      expect(result.accessToken).toBe('jwt-token');
      expect(mockAuthService.verify2fa).toHaveBeenCalledWith(dto);
    });
  });

  describe('protected endpoints', () => {
    it('getProfile should return current user', () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        role: Role.EMPLEADOR,
      };
      expect(controller.getProfile(mockUser)).toEqual(mockUser);
    });

    it('adminOnly should return message with current admin user', () => {
      const mockAdmin = {
        id: '1',
        email: 'admin@example.com',
        role: Role.ADMIN,
      };
      const response = controller.adminOnly(mockAdmin);
      expect(response.message).toContain('administradores');
      expect(response.user).toEqual(mockAdmin);
    });
  });
});

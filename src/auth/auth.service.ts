import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, role, name } = registerDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role,
        name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    this.logger.log(`Usuario registrado exitosamente: ${user.email} con rol ${user.role}`);
    return user;
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Generar PIN de 6 dígitos para 2FA
    const twoFactorCode = Math.floor(100000 + Math.random() * 900000).toString();
    const twoFactorExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos de validez

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorCode,
        twoFactorExpiresAt,
      },
    });

    // Enviar código por correo
    await this.mailService.sendTwoFactorCode(user.email, twoFactorCode);

    return {
      message: 'Código de verificación 2FA enviado al correo electrónico',
      email: user.email,
    };
  }

  async verify2fa(verify2faDto: Verify2faDto) {
    const { email, code } = verify2faDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (!user.twoFactorCode || user.twoFactorCode !== code) {
      throw new UnauthorizedException('Código de verificación 2FA incorrecto');
    }

    if (!user.twoFactorExpiresAt || user.twoFactorExpiresAt < new Date()) {
      throw new UnauthorizedException('El código de verificación 2FA ha expirado');
    }

    // Limpiar el código 2FA una vez usado exitosamente
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorCode: null,
        twoFactorExpiresAt: null,
      },
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}

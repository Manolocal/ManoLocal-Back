import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Verify2faDto } from './dto/verify-2fa.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Registrar nuevo usuario (Empleador o Especialista)' })
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @ApiOperation({ summary: 'Iniciar sesión (genera y envía código 2FA al correo)' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @ApiOperation({ summary: 'Verificar código 2FA y obtener token de acceso JWT' })
  @Post('verify-2fa')
  @HttpCode(HttpStatus.OK)
  async verify2fa(@Body() verify2faDto: Verify2faDto) {
    return this.authService.verify2fa(verify2faDto);
  }

  @ApiBearerAuth('JWT-Auth')
  @ApiOperation({ summary: 'Obtener información básica del usuario autenticado' })
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: AuthUser) {
    return user;
  }

  @ApiBearerAuth('JWT-Auth')
  @ApiOperation({ summary: 'Ruta protegida exclusiva para rol ADMIN' })
  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminOnly(@CurrentUser() user: AuthUser) {
    return {
      message: 'Acceso concedido exclusivamente para administradores',
      user,
    };
  }

  @ApiBearerAuth('JWT-Auth')
  @ApiOperation({ summary: 'Ruta protegida exclusiva para rol EMPLEADOR' })
  @Get('empleador-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLEADOR)
  empleadorOnly(@CurrentUser() user: AuthUser) {
    return {
      message: 'Acceso concedido exclusivamente para empleadores',
      user,
    };
  }

  @ApiBearerAuth('JWT-Auth')
  @ApiOperation({ summary: 'Ruta protegida exclusiva para rol ESPECIALISTA' })
  @Get('especialista-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ESPECIALISTA)
  especialistaOnly(@CurrentUser() user: AuthUser) {
    return {
      message: 'Acceso concedido exclusivamente para especialistas',
      user,
    };
  }
}

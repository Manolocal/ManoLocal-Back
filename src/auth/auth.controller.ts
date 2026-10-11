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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('verify-2fa')
  @HttpCode(HttpStatus.OK)
  async verify2fa(@Body() verify2faDto: Verify2faDto) {
    return this.authService.verify2fa(verify2faDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: any) {
    return user;
  }

  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminOnly(@CurrentUser() user: any) {
    return {
      message: 'Acceso concedido exclusivamente para administradores',
      user,
    };
  }

  @Get('empleador-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.EMPLEADOR)
  empleadorOnly(@CurrentUser() user: any) {
    return {
      message: 'Acceso concedido exclusivamente para empleadores',
      user,
    };
  }

  @Get('especialista-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ESPECIALISTA)
  especialistaOnly(@CurrentUser() user: any) {
    return {
      message: 'Acceso concedido exclusivamente para especialistas',
      user,
    };
  }
}

import { Body, Controller, Get, Patch, Put, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Usuarios & Perfiles')
@ApiBearerAuth('JWT-Auth')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Obtener perfil e información completa del usuario actual' })
  @Get('me')
  getMyProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getMe(userId);
  }

  @ApiOperation({ summary: 'Actualizar datos de perfil (nombre, teléfono, dirección, CP)' })
  @Patch('me/profile')
  updateMyProfile(
    @CurrentUser('id') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, updateProfileDto);
  }

  @ApiOperation({ summary: 'Actualizar conocimientos u oficios (solo Especialistas)' })
  @Put('me/knowledge')
  updateMyKnowledge(
    @CurrentUser() user: AuthUser,
    @Body() updateKnowledgeDto: UpdateKnowledgeDto,
  ) {
    return this.usersService.updateKnowledge(
      user.id,
      user.role,
      updateKnowledgeDto,
    );
  }
}

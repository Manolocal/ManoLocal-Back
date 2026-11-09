import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Patch,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { GetMessagesQueryDto } from './dto/get-messages.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('rooms')
  @ApiOperation({
    summary: 'Crear u obtener la sala privada entre Empleador y Especialista',
    description:
      'Garantiza una sala única por par Empleador-Especialista para negociar servicios.',
  })
  @ApiResponse({
    status: 201,
    description: 'Sala de chat obtenida o creada exitosamente.',
  })
  async createOrGetRoom(
    @CurrentUser() user: AuthUser,
    @Body() createRoomDto: CreateRoomDto,
  ) {
    return this.chatService.getOrCreateRoom(user.id, createRoomDto);
  }

  @Get('rooms')
  @ApiOperation({
    summary: 'Listar salas de chat activas del usuario autenticado',
    description:
      'Devuelve las salas donde el usuario participa como Empleador o Especialista con el último mensaje.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de salas obtenida.',
  })
  async getUserRooms(@CurrentUser() user: AuthUser) {
    return this.chatService.getUserRooms(user.id);
  }

  @Get('rooms/:roomId/messages')
  @ApiOperation({
    summary: 'Consultar el historial persistente de mensajes de una sala',
    description:
      'Permite paginar los mensajes guardados en base de datos para cargar al abrir la aplicación.',
  })
  @ApiParam({ name: 'roomId', description: 'ID de la sala de chat' })
  @ApiResponse({
    status: 200,
    description: 'Historial de mensajes paginado obtenido exitosamente.',
  })
  async getRoomMessages(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
    @Query() query: GetMessagesQueryDto,
  ) {
    return this.chatService.getRoomMessages(user.id, roomId, query);
  }

  @Patch('rooms/:roomId/read')
  @ApiOperation({
    summary: 'Marcar mensajes como leídos dentro de una sala',
  })
  @ApiParam({ name: 'roomId', description: 'ID de la sala de chat' })
  async markAsRead(
    @CurrentUser() user: AuthUser,
    @Param('roomId') roomId: string,
  ) {
    return this.chatService.markMessagesAsRead(user.id, roomId);
  }
}

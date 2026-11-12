import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import {
  forwardRef,
  Inject,
  Logger,
  Optional,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { WsExceptionFilter } from '../common/filters/ws-exception.filter';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { SendMessageDto } from './dto/send-message.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { GetMessagesQueryDto } from './dto/get-messages.dto';
import { CancelJobWsDto, JobActionDto } from './dto/job-action.dto';
import { JobsService } from '../jobs/jobs.service';
import { CreateJobDto } from '../jobs/dto/create-job.dto';
import { JobStateChangedEvent } from '../common/events/job-state-changed.event';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

const WS_VALIDATION_PIPE = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@UseFilters(WsExceptionFilter)
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly wsJwtGuard: WsJwtGuard,
    @Optional()
    @Inject(forwardRef(() => JobsService))
    private readonly jobsService?: JobsService,
  ) {}

  /**
   * Manejador de la conexión inicial del socket (handshake).
   * Extrae el JWT, valida la identidad del usuario y rechaza la conexión si no es válida.
   */
  async handleConnection(client: Socket) {
    try {
      const user = await this.wsJwtGuard.validateSocket(client);

      if (!user) {
        this.logger.warn(
          `Conexión rechazada para socket ${client.id}: Token no provisto o inválido`,
        );
        client.emit('error', {
          event: 'error',
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Autenticación requerida. Token JWT inválido o ausente',
          timestamp: new Date().toISOString(),
        });
        client.disconnect(true);
        return;
      }

      // Asociar usuario validado a la instancia del socket
      client.data.user = user;
      this.logger.log(
        `Socket autenticado: ${user.email} (${user.id}) en socket ${client.id}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Error al procesar handshake para socket ${client.id}: ${error?.message}`,
      );
      client.disconnect(true);
    }
  }

  /**
   * Manejador de desconexión del socket.
   */
  handleDisconnect(client: Socket) {
    const user = client.data?.user;
    this.logger.log(
      `Socket desconectado: ${client.id}${user ? ` (Usuario: ${user.email})` : ''}`,
    );
  }

  /**
   * Permite a un usuario unirse a una sala privada Empleador-Especialista.
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinRoomDto,
  ) {
    const userId = client.data.user.id;
    await this.chatService.validateRoomAccess(userId, data.roomId);

    await client.join(data.roomId);
    this.logger.log(
      `Usuario ${userId} se unió a la sala privada ${data.roomId}`,
    );

    return {
      event: 'joined_room',
      data: {
        roomId: data.roomId,
        message: 'Conectado a la sala privada exitosamente',
      },
    };
  }

  /**
   * Alias de evento joinRoom en camelCase para mayor compatibilidad con clientes frontend.
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('joinRoom')
  async handleJoinRoomCamelCase(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinRoomDto,
  ) {
    return this.handleJoinRoom(client, data);
  }

  /**
   * Permite a un usuario salir de una sala.
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leave_room')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinRoomDto,
  ) {
    await client.leave(data.roomId);
    return {
      event: 'left_room',
      data: { roomId: data.roomId },
    };
  }

  /**
   * Envía un mensaje en tiempo real a una sala privada.
   * Guarda el mensaje en Prisma y emite el evento 'new_message' exclusivamente
   * a los miembros de dicha sala mediante server.to(roomId).emit().
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const senderId = client.data.user.id;

    // Guardar en base de datos mediante Prisma
    const message = await this.chatService.saveMessage(senderId, dto);

    // Emitir en tiempo real a la sala correspondiente
    this.server.to(dto.roomId).emit('new_message', message);

    this.logger.log(
      `Mensaje emitido a la sala ${dto.roomId} por usuario ${senderId}`,
    );

    return {
      event: 'message_sent',
      data: message,
    };
  }

  /**
   * Alias de evento sendMessage en camelCase.
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('sendMessage')
  async handleSendMessageCamelCase(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    return this.handleSendMessage(client, dto);
  }

  /**
   * Consulta el historial de mensajes de la sala a través del canal de socket.
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('get_messages')
  async handleGetMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; page?: number; limit?: number },
  ) {
    const userId = client.data.user.id;
    const queryDto: GetMessagesQueryDto = {
      page: payload.page,
      limit: payload.limit,
    };

    const history = await this.chatService.getRoomMessages(
      userId,
      payload.roomId,
      queryDto,
    );

    return {
      event: 'room_messages',
      data: history,
    };
  }

  /**
   * Listener desacoplado de eventos de cambios de estado en acuerdos de trabajo (BACK-09).
   * Difunde en tiempo real los cambios a los participantes conectados a la sala de chat.
   */
  @OnEvent('job.state_changed')
  handleJobStateChanged(event: JobStateChangedEvent) {
    if (!this.server) {
      return;
    }

    this.server.to(event.roomId).emit(event.eventType, {
      action: event.action,
      roomId: event.roomId,
      job: event.job,
      actorId: event.actorId,
      timestamp: event.timestamp,
    });
  }

  /**
   * Crea un acuerdo de trabajo en la sala desde los botones del chat (BACK-09).
   */
  @UseGuards(WsJwtGuard)
  @UsePipes(WS_VALIDATION_PIPE)
  @SubscribeMessage('create_job')
  async handleCreateJob(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: CreateJobDto,
  ) {
    const userId = this.getSocketUserId(client);
    const result = await this.requireJobsService().createJob(userId, dto);

    return {
      event: 'job_created_ack',
      data: result,
    };
  }

  /**
   * Alias de create_job en camelCase.
   */
  @UseGuards(WsJwtGuard)
  @UsePipes(WS_VALIDATION_PIPE)
  @SubscribeMessage('createJob')
  async handleCreateJobCamelCase(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: CreateJobDto,
  ) {
    return this.handleCreateJob(client, dto);
  }

  /**
   * Confirma un trabajo desde el chat y congela la cuota de $50 MXN en transacción ACID.
   */
  @UseGuards(WsJwtGuard)
  @UsePipes(WS_VALIDATION_PIPE)
  @SubscribeMessage('confirm_job')
  async handleConfirmJob(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JobActionDto,
  ) {
    const userId = this.getSocketUserId(client);
    const result = await this.requireJobsService().confirmJob(
      userId,
      dto.jobId,
    );

    return {
      event: 'job_confirmed',
      data: result,
    };
  }

  /**
   * Alias de confirm_job en camelCase.
   */
  @UseGuards(WsJwtGuard)
  @UsePipes(WS_VALIDATION_PIPE)
  @SubscribeMessage('confirmJob')
  async handleConfirmJobCamelCase(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JobActionDto,
  ) {
    return this.handleConfirmJob(client, dto);
  }

  /**
   * Marca un trabajo como completado desde el chat y descuenta los $50 MXN congelados.
   */
  @UseGuards(WsJwtGuard)
  @UsePipes(WS_VALIDATION_PIPE)
  @SubscribeMessage('complete_job')
  async handleCompleteJob(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JobActionDto,
  ) {
    const userId = this.getSocketUserId(client);
    const result = await this.requireJobsService().completeJob(
      userId,
      dto.jobId,
    );

    return {
      event: 'job_completed',
      data: result,
    };
  }

  /**
   * Alias de complete_job en camelCase.
   */
  @UseGuards(WsJwtGuard)
  @UsePipes(WS_VALIDATION_PIPE)
  @SubscribeMessage('completeJob')
  async handleCompleteJobCamelCase(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JobActionDto,
  ) {
    return this.handleCompleteJob(client, dto);
  }

  /**
   * Cancela un trabajo desde el chat y devuelve el saldo congelado si estaba confirmado.
   */
  @UseGuards(WsJwtGuard)
  @UsePipes(WS_VALIDATION_PIPE)
  @SubscribeMessage('cancel_job')
  async handleCancelJob(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: CancelJobWsDto,
  ) {
    const userId = this.getSocketUserId(client);
    const result = await this.requireJobsService().cancelJob(
      userId,
      dto.jobId,
      dto.reason ? { reason: dto.reason } : undefined,
    );

    return {
      event: 'job_cancelled',
      data: result,
    };
  }

  /**
   * Alias de cancel_job en camelCase.
   */
  @UseGuards(WsJwtGuard)
  @UsePipes(WS_VALIDATION_PIPE)
  @SubscribeMessage('cancelJob')
  async handleCancelJobCamelCase(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: CancelJobWsDto,
  ) {
    return this.handleCancelJob(client, dto);
  }

  private getSocketUserId(client: Socket): string {
    const data = client.data as { user?: AuthUser } | undefined;
    if (!data?.user?.id) {
      throw new WsException('Usuario no autenticado en la conexión WebSocket');
    }
    return data.user.id;
  }

  private requireJobsService(): JobsService {
    if (!this.jobsService) {
      throw new WsException('Servicio de trabajos no disponible');
    }
    return this.jobsService;
  }
}

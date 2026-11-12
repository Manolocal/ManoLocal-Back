import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { CancelJobDto } from './dto/cancel-job.dto';
import { GetJobsQueryDto } from './dto/get-jobs-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

@ApiTags('Trabajos')
@ApiBearerAuth('JWT-Auth')
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear un acuerdo de trabajo en una sala de chat (estado PENDING)',
    description:
      'Permite al Empleador o Especialista de la sala formalizar una propuesta de trabajo antes de confirmarla.',
  })
  @ApiResponse({
    status: 201,
    description: 'Acuerdo de trabajo creado exitosamente en estado PENDING.',
  })
  @ApiResponse({
    status: 409,
    description: 'Ya existe un acuerdo de trabajo activo en la sala.',
  })
  async createJob(
    @CurrentUser() user: AuthUser,
    @Body() createJobDto: CreateJobDto,
  ) {
    return this.jobsService.createJob(user.id, createJobDto);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Listar acuerdos de trabajo del usuario autenticado',
    description:
      'Devuelve de forma paginada los acuerdos de trabajo donde el usuario participa como Empleador o Especialista.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de acuerdos de trabajo.',
  })
  async getMyJobs(
    @CurrentUser() user: AuthUser,
    @Query() query: GetJobsQueryDto,
  ) {
    return this.jobsService.getMyJobs(user.id, query);
  }

  @Get('room/:roomId')
  @ApiOperation({
    summary: 'Consultar acuerdos de trabajo asociados a una sala de chat',
    description:
      'Retorna el trabajo activo (si existe) y el historial de acuerdos dentro de la sala.',
  })
  @ApiParam({ name: 'roomId', description: 'UUID de la sala de chat' })
  @ApiResponse({
    status: 200,
    description: 'Acuerdos de trabajo de la sala obtenidos exitosamente.',
  })
  async getJobsByRoom(
    @CurrentUser() user: AuthUser,
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ) {
    return this.jobsService.getJobsByRoom(user.id, roomId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar detalle de un acuerdo de trabajo por ID',
  })
  @ApiParam({ name: 'id', description: 'UUID del acuerdo de trabajo' })
  @ApiResponse({
    status: 200,
    description: 'Detalle del acuerdo obtenido exitosamente.',
  })
  async getJobById(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobsService.getJobById(user.id, id);
  }

  @Patch(':id/confirm')
  @ApiOperation({
    summary:
      'Confirmar trabajo y congelar cuota de $50 MXN (PENDING -> CONFIRMED)',
    description:
      'Ejecuta una transacción ACID: valida que el Especialista cuente con al menos $50 MXN disponibles, congela el monto en la billetera, registra CONGELAMIENTO y cambia el trabajo a CONFIRMED.',
  })
  @ApiParam({ name: 'id', description: 'UUID del acuerdo de trabajo' })
  @ApiResponse({
    status: 200,
    description: 'Trabajo confirmado y saldo congelado correctamente.',
  })
  @ApiResponse({
    status: 402,
    description:
      'Saldo disponible insuficiente (< $50 MXN) en la billetera del especialista.',
  })
  @ApiResponse({
    status: 403,
    description: 'Solo el especialista de la sala puede confirmar el trabajo.',
  })
  async confirmJob(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobsService.confirmJob(user.id, id);
  }

  @Patch(':id/complete')
  @ApiOperation({
    summary:
      'Completar trabajo y descontar cuota congelada (CONFIRMED -> COMPLETED)',
    description:
      'Ejecuta una transacción ACID: solo el Empleador puede marcarlo completado; descuenta definitivamente los $50 MXN congelados, registra PAGO y cambia el trabajo a COMPLETED.',
  })
  @ApiParam({ name: 'id', description: 'UUID del acuerdo de trabajo' })
  @ApiResponse({
    status: 200,
    description: 'Trabajo completado y cuota descontada definitivamente.',
  })
  @ApiResponse({
    status: 403,
    description: 'Solo el empleador de la sala puede completar el trabajo.',
  })
  async completeJob(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobsService.completeJob(user.id, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary:
      'Cancelar trabajo y ejecutar rollback de saldo (PENDING/CONFIRMED -> CANCELLED)',
    description:
      'Ejecuta una transacción ACID: Empleador o Especialista pueden cancelar antes de completarse; si estaba CONFIRMED, los $50 MXN congelados regresan al saldo disponible y se registra DEVOLUCION.',
  })
  @ApiParam({ name: 'id', description: 'UUID del acuerdo de trabajo' })
  @ApiResponse({
    status: 200,
    description: 'Trabajo cancelado y saldo descongelado si aplicaba.',
  })
  async cancelJob(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cancelJobDto?: CancelJobDto,
  ) {
    return this.jobsService.cancelJob(user.id, id, cancelJobDto);
  }
}

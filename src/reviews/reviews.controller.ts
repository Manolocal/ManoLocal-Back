import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreateReviewDto } from './dto/create-review.dto';
import { GetReviewsQueryDto } from './dto/get-reviews-query.dto';
import { JobCompletedGuard } from './guards/job-completed.guard';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard, JobCompletedGuard)
  @Roles(Role.EMPLEADOR)
  @ApiBearerAuth('JWT-Auth')
  @ApiOperation({
    summary: 'Publicar reseña y calificación de un trabajo finalizado',
    description:
      'Permite únicamente al empleador del acuerdo calificar (1 a 5 estrellas) y comentar un trabajo cuyo estado sea COMPLETED. Actualiza automáticamente ratingAverage y ratingCount en el perfil del especialista.',
  })
  @ApiResponse({
    status: 201,
    description: 'Reseña publicada y reputación del especialista actualizada',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o ID de acuerdo no válido',
  })
  @ApiResponse({
    status: 403,
    description: 'Solo el empleador participante del acuerdo puede reseñar',
  })
  @ApiResponse({
    status: 404,
    description: 'Acuerdo de trabajo no encontrado',
  })
  @ApiResponse({
    status: 409,
    description: 'El acuerdo no está COMPLETED o ya fue reseñado',
  })
  async createReview(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(user.id, dto);
  }

  @Get('specialist/:specialistId')
  @ApiOperation({
    summary: 'Listar reseñas públicas y reputación de un especialista',
    description:
      'Endpoint público paginado que retorna el resumen de calificación (ratingAverage, ratingCount) y las reseñas visibles del especialista.',
  })
  @ApiParam({
    name: 'specialistId',
    description: 'UUID del especialista a consultar',
  })
  @ApiResponse({
    status: 200,
    description: 'Reputación y reseñas paginadas del especialista',
  })
  @ApiResponse({
    status: 404,
    description: 'Especialista no encontrado o inactivo',
  })
  async getReviewsBySpecialist(
    @Param('specialistId', new ParseUUIDPipe()) specialistId: string,
    @Query() query: GetReviewsQueryDto,
  ) {
    return this.reviewsService.getReviewsBySpecialist(specialistId, query);
  }

  @Get('job/:jobAgreementId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-Auth')
  @ApiOperation({
    summary: 'Consultar la reseña asociada a un acuerdo de trabajo',
  })
  @ApiParam({
    name: 'jobAgreementId',
    description: 'UUID del acuerdo de trabajo',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado de reseña del trabajo',
  })
  @ApiResponse({
    status: 403,
    description: 'El usuario no participa en el acuerdo de trabajo',
  })
  @ApiResponse({
    status: 404,
    description: 'Acuerdo de trabajo no encontrado',
  })
  async getReviewByJob(
    @CurrentUser() user: AuthUser,
    @Param('jobAgreementId', new ParseUUIDPipe()) jobAgreementId: string,
  ) {
    return this.reviewsService.getReviewByJob(
      user.id,
      user.role,
      jobAgreementId,
    );
  }
}

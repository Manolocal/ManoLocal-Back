import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { UploadCatalogImageDto } from './dto/upload-catalog-image.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';

const CATALOG_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

@ApiTags('Catálogo de Trabajos')
@ApiBearerAuth('JWT-Auth')
@UseGuards(JwtAuthGuard)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('images')
  @UseGuards(RolesGuard)
  @Roles(Role.ESPECIALISTA)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CATALOG_MAX_FILE_SIZE },
    }),
  )
  @ApiOperation({
    summary: 'Subir una foto al catálogo del especialista',
    description:
      'Permite a un especialista subir una foto de trabajo con título obligatorio y descripción opcional. Límite máximo de 10 fotos activas.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Foto de trabajo y metadatos asociados',
    schema: {
      type: 'object',
      required: ['file', 'title'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo de imagen (JPG, JPEG, PNG, WEBP, máx 5MB)',
        },
        title: {
          type: 'string',
          minLength: 3,
          maxLength: 100,
          example: 'Instalación de regadera tipo lluvia',
        },
        description: {
          type: 'string',
          maxLength: 300,
          example: 'Tubería de cobre y accesorios cromados.',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Foto subida exitosamente con cuota actualizada',
  })
  @ApiResponse({
    status: 400,
    description:
      'Archivo no válido, excedió límite de tamaño o cuota máxima de 10 fotos alcanzada',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado. Se requiere rol ESPECIALISTA',
  })
  async uploadImage(
    @CurrentUser() user: AuthUser,
    @UploadedFile(new FileValidationPipe({ maxSizeMb: 5 }))
    file: Express.Multer.File,
    @Body() dto: UploadCatalogImageDto,
  ) {
    return this.catalogService.uploadImage(user.id, dto, file);
  }

  @Get('me')
  @UseGuards(RolesGuard)
  @Roles(Role.ESPECIALISTA)
  @ApiOperation({
    summary: 'Listar fotos del catálogo del especialista autenticado',
    description:
      'Devuelve todas las fotos activas del especialista autenticado junto con su estado de cuota (activas, límite de 10 y disponibles).',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de fotos y cuota recuperada exitosamente',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado. Se requiere rol ESPECIALISTA',
  })
  async getMyImages(@CurrentUser() user: AuthUser) {
    return this.catalogService.getMyImages(user.id);
  }

  @Get('specialist/:specialistId')
  @ApiOperation({
    summary: 'Consultar portafolio de trabajos de un especialista',
    description:
      'Permite a cualquier usuario autenticado consultar la galería de fotos públicas de un especialista determinado.',
  })
  @ApiParam({
    name: 'specialistId',
    description: 'UUID del especialista',
    example: 'd9b2d63d-a233-4fba-bb80-1a74d2ffc142',
  })
  @ApiResponse({
    status: 200,
    description: 'Galería de fotos del especialista',
  })
  @ApiResponse({
    status: 404,
    description: 'Especialista no encontrado o inactivo',
  })
  async getSpecialistImages(
    @Param('specialistId', ParseUUIDPipe) specialistId: string,
  ) {
    return this.catalogService.getSpecialistImages(specialistId);
  }

  @Delete('images/:id')
  @ApiOperation({
    summary: 'Eliminar una foto del catálogo',
    description:
      'Permite al especialista dueño de la foto o a un administrador eliminarla lógicamente del catálogo, liberando de inmediato un espacio en la cuota.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID de la foto a eliminar',
    example: 'c8a3e75e-26f1-4db8-b59a-5bfa81309852',
  })
  @ApiResponse({
    status: 200,
    description: 'Foto eliminada exitosamente del catálogo',
  })
  @ApiResponse({
    status: 403,
    description: 'No tienes permiso para eliminar esta foto del catálogo',
  })
  @ApiResponse({
    status: 404,
    description: 'La foto especificada no existe en el catálogo',
  })
  async deleteImage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.catalogService.deleteImage(user.id, user.role, id);
  }
}


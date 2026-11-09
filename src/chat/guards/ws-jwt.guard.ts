import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { AuthUser } from '../../common/interfaces/auth-user.interface';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();

    // Si ya fue autenticado en la conexión (handshake), reutilizar el usuario
    if (client.data?.user) {
      return true;
    }

    const user = await this.validateSocket(client);
    if (!user) {
      throw new WsException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Token de autenticación inválido o ausente',
      });
    }

    client.data.user = user;
    return true;
  }

  /**
   * Extrae el JWT desde handshake (auth.token, headers.authorization o query.token),
   * verifica la firma criptográfica y obtiene el usuario en la base de datos.
   */
  async validateSocket(client: Socket): Promise<AuthUser | null> {
    try {
      const authHeader =
        (client.handshake?.auth?.token as string | undefined) ||
        (client.handshake?.headers?.authorization as string | undefined) ||
        (client.handshake?.query?.token as string | undefined);

      if (!authHeader) {
        return null;
      }

      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : authHeader.trim();

      if (!token) {
        return null;
      }

      const secret =
        this.configService.get<string>('JWT_SECRET') ||
        'super-secret-key-change-in-production';

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });

      if (!payload || !payload.sub) {
        return null;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
        },
      });

      return user as AuthUser | null;
    } catch (error: any) {
      this.logger.warn(`Error de validación JWT en socket: ${error?.message}`);
      return null;
    }
  }
}

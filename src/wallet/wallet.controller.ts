import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { RechargeWalletDto } from './dto/recharge-wallet.dto';
import { GetTransactionsQueryDto } from './dto/get-transactions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';

@ApiTags('Wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ESPECIALISTA, Role.ADMIN)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  @ApiOperation({
    summary: 'Consultar saldo actual de la billetera virtual',
    description:
      'Retorna el saldo disponible, saldo congelado y saldo total del Especialista autenticado.',
  })
  @ApiResponse({
    status: 200,
    description: 'Saldos de la billetera obtenidos correctamente.',
  })
  async getBalance(@CurrentUser() user: AuthUser) {
    return this.walletService.getWallet(user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'Consultar información y saldo de la billetera (Alias)',
  })
  async getWallet(@CurrentUser() user: AuthUser) {
    return this.walletService.getWallet(user.id);
  }

  @Get('transactions')
  @ApiOperation({
    summary: 'Consultar historial de movimientos y transacciones',
    description:
      'Lista las transacciones (pagos, recargas, congelamientos, devoluciones) con paginación.',
  })
  @ApiResponse({
    status: 200,
    description: 'Historial de transacciones obtenido exitosamente.',
  })
  async getTransactions(
    @CurrentUser() user: AuthUser,
    @Query() query: GetTransactionsQueryDto,
  ) {
    return this.walletService.getTransactions(user.id, query);
  }

  @Post('mock-recharge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recarga simulada de saldo (Mock)',
    description:
      'Suma el monto especificado al saldo disponible del Especialista y registra la transacción correspondiente.',
  })
  @ApiResponse({
    status: 200,
    description: 'Recarga procesada exitosamente con actualización de saldo.',
  })
  async mockRecharge(
    @CurrentUser() user: AuthUser,
    @Body() rechargeDto: RechargeWalletDto,
  ) {
    return this.walletService.rechargeWallet(user.id, rechargeDto);
  }

  @Post('recharge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Alias para recarga de saldo simulada',
  })
  async recharge(
    @CurrentUser() user: AuthUser,
    @Body() rechargeDto: RechargeWalletDto,
  ) {
    return this.walletService.rechargeWallet(user.id, rechargeDto);
  }
}

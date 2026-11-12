import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Excepción estructurada para indicar que la billetera del especialista
 * no cuenta con saldo disponible suficiente para cubrir la cuota requerida.
 */
export class InsufficientBalanceException extends HttpException {
  constructor(requiredAmount: number, availableBalance: number) {
    const missingAmount = Number(
      Math.max(0, requiredAmount - availableBalance).toFixed(2),
    );

    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Payment Required',
        code: 'INSUFFICIENT_BALANCE',
        message: `Saldo insuficiente para confirmar el trabajo. Se requieren $${requiredAmount.toFixed(2)} MXN disponibles y tu saldo actual es de $${availableBalance.toFixed(2)} MXN.`,
        details: {
          requiredAmount,
          availableBalance,
          missingAmount,
          currency: 'MXN',
        },
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}


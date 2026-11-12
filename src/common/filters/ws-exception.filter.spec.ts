import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsExceptionFilter } from './ws-exception.filter';
import { InsufficientBalanceException } from '../exceptions/insufficient-balance.exception';

describe('WsExceptionFilter', () => {
  let filter: WsExceptionFilter;
  let mockClient: { emit: jest.Mock };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new WsExceptionFilter();
    mockClient = { emit: jest.fn() };
    mockHost = {
      switchToWs: jest.fn().mockReturnValue({
        getClient: jest.fn().mockReturnValue(mockClient),
        getData: jest.fn(),
      }),
    } as unknown as ArgumentsHost;
  });

  it('should emit error event with WsException details (string)', () => {
    const exception = new WsException('Room not found');

    filter.catch(exception, mockHost);

    expect(mockClient.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        event: 'error',
        statusCode: 400,
        error: 'WsException',
        message: 'Room not found',
      }),
    );
  });

  it('should emit error event with WsException details (object)', () => {
    const exception = new WsException({
      message: 'Unauthorized access',
      statusCode: 401,
      error: 'Unauthorized',
    });

    filter.catch(exception, mockHost);

    expect(mockClient.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        event: 'error',
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Unauthorized access',
      }),
    );
  });

  it('should handle HttpException correctly', () => {
    const exception = new HttpException(
      { message: 'Forbidden room access', error: 'Forbidden' },
      HttpStatus.FORBIDDEN,
    );

    filter.catch(exception, mockHost);

    expect(mockClient.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        event: 'error',
        statusCode: 403,
        error: 'Forbidden',
        message: 'Forbidden room access',
      }),
    );
  });

  it('should handle generic standard JavaScript Error', () => {
    const exception = new Error('Database connection failed');

    filter.catch(exception, mockHost);

    expect(mockClient.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        event: 'error',
        statusCode: 400,
        error: 'Error',
        message: 'Database connection failed',
      }),
    );
  });

  it('should emit structured 402 error payload for InsufficientBalanceException', () => {
    const exception = new InsufficientBalanceException(50, 15);

    filter.catch(exception, mockHost);

    expect(mockClient.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        event: 'error',
        statusCode: 402,
        error: 'Payment Required',
        code: 'INSUFFICIENT_BALANCE',
        details: {
          requiredAmount: 50,
          availableBalance: 15,
          missingAmount: 35,
          currency: 'MXN',
        },
      }),
    );
  });
});

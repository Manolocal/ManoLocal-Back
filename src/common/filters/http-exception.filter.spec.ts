import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { InsufficientBalanceException } from '../exceptions/insufficient-balance.exception';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue({ status: mockStatus }),
        getRequest: jest.fn().mockReturnValue({ url: '/jobs/123/confirm' }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('should format InsufficientBalanceException as HTTP 402 with structured code and details', () => {
    const exception = new InsufficientBalanceException(50, 20);

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.PAYMENT_REQUIRED);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 402,
        error: 'Payment Required',
        code: 'INSUFFICIENT_BALANCE',
        details: {
          requiredAmount: 50,
          availableBalance: 20,
          missingAmount: 30,
          currency: 'MXN',
        },
        path: '/jobs/123/confirm',
      }),
    );
  });
});


import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('MailService', () => {
  const sendMailMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: sendMailMock,
    });
  });

  function buildConfig(values: Record<string, string | number | undefined>) {
    return {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        values[key] !== undefined ? values[key] : defaultValue,
      ),
    } as unknown as ConfigService;
  }

  it('strips spaces from Gmail App Password when initializing transporter', () => {
    new MailService(
      buildConfig({
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: 465,
        SMTP_USER: 'demo@gmail.com',
        SMTP_PASS: 'abcd efgh ijkl mnop',
      }),
    );

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: 'demo@gmail.com',
        pass: 'abcdefghijklmnop',
      },
    });
  });

  it('falls back to console simulator on SMTP 535 error in development', async () => {
    const authError = Object.assign(new Error('535-5.7.8 BadCredentials'), {
      code: 'EAUTH',
      responseCode: 535,
    });
    sendMailMock.mockRejectedValueOnce(authError);

    const service = new MailService(
      buildConfig({
        NODE_ENV: 'development',
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: 465,
        SMTP_USER: 'demo@gmail.com',
        SMTP_PASS: 'abcdefghijklmnop',
      }),
    );

    await expect(
      service.sendTwoFactorCode('user@example.com', '123456'),
    ).resolves.toBeUndefined();
  });

  it('throws ServiceUnavailableException on SMTP failure in production', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('535-5.7.8 BadCredentials'));

    const service = new MailService(
      buildConfig({
        NODE_ENV: 'production',
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: 465,
        SMTP_USER: 'demo@gmail.com',
        SMTP_PASS: 'abcdefghijklmnop',
      }),
    );

    await expect(
      service.sendTwoFactorCode('user@example.com', '123456'),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});

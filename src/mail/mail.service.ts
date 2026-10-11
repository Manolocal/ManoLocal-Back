import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const port = this.configService.get<number>('SMTP_PORT', 587);

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(port),
        secure: Number(port) === 465,
        auth: {
          user,
          pass,
        },
      });
      this.logger.log('Nodemailer SMTP transporter initialized');
    } else {
      this.logger.warn(
        'SMTP credentials not fully provided. Falling back to local console mail logger for 2FA PINs.',
      );
    }
  }

  async sendTwoFactorCode(email: string, code: string): Promise<void> {
    const from =
      this.configService.get<string>('SMTP_FROM') ||
      'ManoLocal <no-reply@manolocal.com>';

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to: email,
          subject: 'Código de verificación de 2 factores (2FA) - ManoLocal',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #1a202c; text-align: center;">ManoLocal - Autenticación de Dos Factores</h2>
              <p>Hola,</p>
              <p>Has solicitado iniciar sesión en tu cuenta. Usa el siguiente código de 6 dígitos para completar tu inicio de sesión:</p>
              <div style="text-align: center; margin: 30px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2b6cb0; background-color: #ebf8ff; padding: 12px 24px; border-radius: 6px; display: inline-block;">
                  ${code}
                </span>
              </div>
              <p style="color: #718096; font-size: 14px;">Este código expirará en 10 minutos. Si no intentaste iniciar sesión, ignora este mensaje o cambia tu contraseña inmediatamente.</p>
            </div>
          `,
        });
        this.logger.log(`2FA PIN sent to ${email} via SMTP`);
      } catch (error) {
        this.logger.error(`Error sending 2FA PIN to ${email}`, error);
        throw error;
      }
    } else {
      this.logger.log(`
======================================================
[2FA EMAIL SIMULATOR]
To: ${email}
Subject: Código de verificación de 2 factores - ManoLocal
2FA Code: ${code}
Expires in: 10 minutes
======================================================
      `);
    }
  }
}

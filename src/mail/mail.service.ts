import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fallbackToConsoleOnError: boolean;

  constructor(private readonly configService: ConfigService) {
    const smtpEnabled =
      this.configService.get<string>('SMTP_ENABLED', 'true').trim().toLowerCase() !==
      'false';
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const rawPass = this.configService.get<string>('SMTP_PASS')?.trim();
    const port = Number(this.configService.get<number>('SMTP_PORT', 587));

    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    const smtpStrict =
      this.configService.get<string>('SMTP_STRICT', 'false').trim().toLowerCase() ===
      'true';
    this.fallbackToConsoleOnError = nodeEnv !== 'production' && !smtpStrict;

    // Las contraseñas de aplicación de Gmail se muestran en bloques de 4 separados por espacios;
    // eliminar los espacios evita rechazos 535 BadCredentials en AUTH PLAIN.
    const pass =
      rawPass && host?.toLowerCase().includes('gmail.com')
        ? rawPass.replace(/\s+/g, '')
        : rawPass;

    if (smtpEnabled && host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });
      this.logger.log(
        `Nodemailer SMTP transporter initialized (${host}:${port} as ${user})`,
      );
    } else {
      this.logger.warn(
        'SMTP disabled or credentials not fully provided. Falling back to local console mail logger for 2FA PINs.',
      );
    }
  }

  async sendTwoFactorCode(email: string, code: string): Promise<void> {
    const from =
      this.configService.get<string>('SMTP_FROM')?.trim() ||
      'ManoLocal <no-reply@manolocal.com>';

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to: email,
          subject: 'Código de verificación de 2 factores (2FA) - ManoLocal',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #2B2D31; text-align: center;">ManoLocal - Autenticación de Dos Factores</h2>
              <p>Hola,</p>
              <p>Has solicitado iniciar sesión en tu cuenta. Usa el siguiente código de 6 dígitos para completar tu inicio de sesión:</p>
              <div style="text-align: center; margin: 30px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2B2D31; background-color: #FFF4D1; border: 2px solid #FFC93C; padding: 12px 24px; border-radius: 8px; display: inline-block;">
                  ${code}
                </span>
              </div>
              <p style="color: #5E626B; font-size: 14px;">Este código expirará en 10 minutos. Si no intentaste iniciar sesión, ignora este mensaje o cambia tu contraseña inmediatamente.</p>
            </div>
          `,
        });
        this.logger.log(`2FA PIN sent to ${email} via SMTP`);
        return;
      } catch (error) {
        const err = error as { code?: string; responseCode?: number; message?: string };
        this.logger.error(
          `Error sending 2FA PIN to ${email} via SMTP: ${err?.message ?? error}`,
        );

        if (err?.code === 'EAUTH' || err?.responseCode === 535) {
          this.logger.warn(
            'SMTP authentication failed (535 BadCredentials). Verifica que SMTP_USER coincida con la cuenta de Gmail y que SMTP_PASS sea una Contraseña de Aplicación vigente de 16 caracteres (sin espacios) con Verificación en 2 pasos activada.',
          );
        }

        if (this.fallbackToConsoleOnError) {
          this.logger.warn(
            'Falling back to local console 2FA simulator so development login is not blocked.',
          );
          this.logSimulatedEmail(email, code);
          return;
        }

        throw new ServiceUnavailableException(
          'No se pudo enviar el código de verificación 2FA por correo. Verifica la configuración SMTP.',
        );
      }
    }

    this.logSimulatedEmail(email, code);
  }

  private logSimulatedEmail(email: string, code: string): void {
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

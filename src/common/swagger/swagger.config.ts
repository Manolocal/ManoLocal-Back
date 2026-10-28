import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const SWAGGER_CUSTOM_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

  :root {
    --primary-color: #3b82f6;
    --primary-hover: #2563eb;
    --bg-dark: #0b1120;
    --card-bg: #131d31;
    --section-header-bg: #1c273c;
    --border-color: #293548;
    --border-light: rgba(255, 255, 255, 0.08);
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
  }

  body {
    background-color: var(--bg-dark) !important;
    color: var(--text-primary) !important;
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif !important;
    margin: 0;
  }

  .swagger-ui {
    color: var(--text-primary) !important;
  }

  /* Barra superior */
  .swagger-ui .topbar {
    background-color: #070a12 !important;
    border-bottom: 1px solid var(--border-color);
    padding: 14px 0;
  }

  .swagger-ui .topbar .download-url-wrapper {
    display: none !important;
  }

  .swagger-ui .topbar-wrapper a span {
    font-family: 'Plus Jakarta Sans', sans-serif !important;
    font-weight: 700 !important;
    font-size: 20px !important;
    color: #ffffff !important;
    letter-spacing: -0.02em;
  }

  /* Información de cabecera */
  .swagger-ui .info {
    margin: 28px 0 !important;
  }

  .swagger-ui .info .title {
    color: #ffffff !important;
    font-family: 'Plus Jakarta Sans', sans-serif !important;
    font-weight: 700 !important;
    letter-spacing: -0.025em;
    font-size: 30px !important;
  }

  .swagger-ui .info p, .swagger-ui .info li {
    color: var(--text-secondary) !important;
    font-size: 14.5px !important;
    line-height: 1.6 !important;
  }

  /* Contenedor de Scheme / Filtro */
  .swagger-ui .scheme-container {
    background-color: var(--card-bg) !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.25) !important;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 16px 20px !important;
    margin-bottom: 25px !important;
  }

  .swagger-ui .filter .operation-filter-input {
    background-color: var(--bg-dark) !important;
    color: var(--text-primary) !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 8px !important;
    padding: 8px 14px !important;
  }

  /* Tags / Categorías */
  .swagger-ui .opblock-tag {
    color: #ffffff !important;
    font-family: 'Plus Jakarta Sans', sans-serif !important;
    border-bottom: 1px solid var(--border-color) !important;
    font-size: 18px !important;
    font-weight: 600 !important;
    padding: 16px 0 !important;
  }

  .swagger-ui .opblock-tag small {
    color: var(--text-secondary) !important;
    font-size: 13px !important;
  }

  /* Tarjetas de Operación (Endpoints) */
  .swagger-ui .opblock {
    border-radius: 10px !important;
    border: 1px solid var(--border-light) !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2) !important;
    margin-bottom: 14px !important;
    background-color: var(--card-bg) !important;
  }

  /* Colores por método cuando están cerrados o abiertos */
  .swagger-ui .opblock.opblock-get {
    border-color: rgba(2, 132, 199, 0.4) !important;
    background-color: #0b1727 !important;
  }
  .swagger-ui .opblock.opblock-get .opblock-summary {
    border-color: rgba(2, 132, 199, 0.2) !important;
  }

  .swagger-ui .opblock.opblock-post {
    border-color: rgba(16, 185, 129, 0.4) !important;
    background-color: #071a14 !important;
  }
  .swagger-ui .opblock.opblock-post .opblock-summary {
    border-color: rgba(16, 185, 129, 0.2) !important;
  }

  .swagger-ui .opblock.opblock-put,
  .swagger-ui .opblock.opblock-patch {
    border-color: rgba(245, 158, 11, 0.4) !important;
    background-color: #181507 !important;
  }

  .swagger-ui .opblock.opblock-delete {
    border-color: rgba(239, 68, 68, 0.4) !important;
    background-color: #1a0b0b !important;
  }

  /* Cabecera del Endpoint */
  .swagger-ui .opblock .opblock-summary {
    padding: 10px 16px !important;
  }

  .swagger-ui .opblock .opblock-summary-method {
    border-radius: 6px !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-weight: 600 !important;
    font-size: 12.5px !important;
    padding: 6px 14px !important;
  }

  .swagger-ui .opblock .opblock-summary-path {
    color: #f1f5f9 !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 13.5px !important;
  }

  .swagger-ui .opblock .opblock-summary-description {
    color: var(--text-secondary) !important;
    font-size: 13px !important;
  }

  /* === SECCIONES DESPLEGADAS (FIX CONTRASTE BLANCO) === */

  /* Cabeceras de sección 'Parameters' y 'Responses' */
  .swagger-ui .opblock .opblock-section-header {
    background-color: var(--section-header-bg) !important;
    border-top: 1px solid var(--border-color) !important;
    border-bottom: 1px solid var(--border-color) !important;
    box-shadow: none !important;
    padding: 10px 16px !important;
  }

  .swagger-ui .opblock .opblock-section-header h4,
  .swagger-ui .opblock .opblock-section-header > label,
  .swagger-ui .opblock .opblock-section-header label span {
    color: #cbd5e1 !important;
    font-family: 'Plus Jakarta Sans', sans-serif !important;
    font-weight: 600 !important;
    font-size: 13.5px !important;
  }

  /* Cuerpo interno desplegado */
  .swagger-ui .opblock-body {
    background-color: #0d1526 !important;
    color: var(--text-primary) !important;
    padding-bottom: 16px !important;
  }

  .swagger-ui .opblock-body pre {
    background-color: #070b14 !important;
    color: #38bdf8 !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 8px !important;
  }

  /* Tablas de Parámetros y Respuestas */
  .swagger-ui .parameters-container,
  .swagger-ui .responses-wrapper,
  .swagger-ui .responses-inner {
    background-color: transparent !important;
    color: #cbd5e1 !important;
    padding: 8px 16px !important;
  }

  .swagger-ui table.parameters,
  .swagger-ui table.responses-table {
    background-color: transparent !important;
    color: #cbd5e1 !important;
    border-collapse: separate !important;
  }

  .swagger-ui table.parameters thead tr th,
  .swagger-ui table.responses-table thead tr th {
    color: var(--text-secondary) !important;
    border-bottom: 1px solid var(--border-color) !important;
    font-weight: 600 !important;
    font-size: 12.5px !important;
    font-family: 'Plus Jakarta Sans', sans-serif !important;
    padding: 10px 8px !important;
  }

  .swagger-ui table.parameters tbody tr td,
  .swagger-ui table.responses-table tbody tr td {
    color: #cbd5e1 !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
    padding: 12px 8px !important;
  }

  .swagger-ui .parameter__name {
    color: #f8fafc !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-weight: 600 !important;
    font-size: 13px !important;
  }

  .swagger-ui .parameter__name.required:after {
    color: #f87171 !important;
  }

  .swagger-ui .parameter__type {
    color: #38bdf8 !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 12px !important;
  }

  .swagger-ui .parameter__in {
    color: var(--text-muted) !important;
    font-style: italic !important;
    font-size: 12px !important;
  }

  .swagger-ui .parameter__extension, 
  .swagger-ui .parameter__empty_value_toggle {
    color: var(--text-secondary) !important;
  }

  /* Respuestas */
  .swagger-ui .response-col_status {
    color: #38bdf8 !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-weight: 700 !important;
    font-size: 13px !important;
  }

  .swagger-ui .response-col_description {
    color: #cbd5e1 !important;
  }

  .swagger-ui .response-col_description__inner div.markdown p {
    color: var(--text-secondary) !important;
  }

  .swagger-ui .responses-inner h4,
  .swagger-ui .responses-inner h5 {
    color: #e2e8f0 !important;
    font-family: 'Plus Jakarta Sans', sans-serif !important;
    font-weight: 600 !important;
  }

  /* Botones */
  .swagger-ui .btn.authorize {
    background-color: var(--primary-color) !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 8px !important;
    padding: 8px 20px !important;
    font-weight: 600 !important;
    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3) !important;
    transition: all 0.2s ease !important;
  }

  .swagger-ui .btn.authorize:hover {
    background-color: var(--primary-hover) !important;
    transform: translateY(-1px);
  }

  .swagger-ui .btn.authorize svg {
    fill: #ffffff !important;
  }

  .swagger-ui .btn.try-out__btn {
    background-color: #24324a !important;
    color: #f8fafc !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 6px !important;
    padding: 6px 14px !important;
    font-weight: 600 !important;
    font-size: 12px !important;
    transition: all 0.15s ease !important;
  }

  .swagger-ui .btn.try-out__btn:hover {
    background-color: #334466 !important;
  }

  .swagger-ui .btn.try-out__btn.cancel {
    background-color: #5c1d1d !important;
    color: #fecaca !important;
    border-color: #7f1d1d !important;
  }

  .swagger-ui .btn.execute {
    background-color: #2563eb !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 6px !important;
    font-weight: 600 !important;
    padding: 8px 24px !important;
    box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3) !important;
  }

  .swagger-ui .btn.execute:hover {
    background-color: #1d4ed8 !important;
  }

  .swagger-ui .btn.btn-clear {
    background-color: #24324a !important;
    color: #cbd5e1 !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 6px !important;
  }

  /* Entradas de formulario */
  .swagger-ui select, 
  .swagger-ui input[type=text], 
  .swagger-ui input[type=password],
  .swagger-ui textarea {
    background-color: #070b14 !important;
    color: #f8fafc !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 6px !important;
    padding: 8px 12px !important;
    font-family: 'JetBrains Mono', monospace !important;
    font-size: 13px !important;
  }

  .swagger-ui select:focus, 
  .swagger-ui input[type=text]:focus, 
  .swagger-ui input[type=password]:focus,
  .swagger-ui textarea:focus {
    border-color: #3b82f6 !important;
    outline: none !important;
  }

  /* Bloques de Código y JSON */
  .swagger-ui pre,
  .swagger-ui .highlight-code,
  .swagger-ui .microlight {
    background-color: #070b14 !important;
    color: #38bdf8 !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 8px !important;
    padding: 12px 16px !important;
    font-family: 'JetBrains Mono', monospace !important;
  }

  .swagger-ui .highlight-code pre {
    background-color: transparent !important;
  }

  .swagger-ui .curl-command {
    background-color: #070b14 !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 8px !important;
  }

  /* Modal de Autorización (Authorize Dialog) */
  .swagger-ui .dialog-ux .backdrop-ux {
    background-color: rgba(0, 0, 0, 0.75) !important;
    backdrop-filter: blur(4px);
  }

  .swagger-ui .dialog-ux .modal-ux {
    background-color: var(--card-bg) !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 12px !important;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5) !important;
  }

  .swagger-ui .dialog-ux .modal-ux-header {
    border-bottom: 1px solid var(--border-color) !important;
    padding: 16px 20px !important;
  }

  .swagger-ui .dialog-ux .modal-ux-header h3 {
    color: #ffffff !important;
    font-family: 'Plus Jakarta Sans', sans-serif !important;
    font-weight: 700 !important;
  }

  .swagger-ui .dialog-ux .modal-ux-content {
    padding: 20px !important;
    color: #cbd5e1 !important;
  }

  .swagger-ui .dialog-ux .modal-ux-content h4,
  .swagger-ui .dialog-ux .modal-ux-content p,
  .swagger-ui .dialog-ux .modal-ux-content label {
    color: #cbd5e1 !important;
  }

  .swagger-ui .auth-btn-wrapper .modal-btn.auth {
    background-color: var(--primary-color) !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 6px !important;
    font-weight: 600 !important;
  }

  .swagger-ui .auth-btn-wrapper .btn-done {
    background-color: #24324a !important;
    color: #ffffff !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 6px !important;
  }

  /* Sección de Modelos / Schemas */
  .swagger-ui section.models {
    background-color: var(--card-bg) !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 10px !important;
  }

  .swagger-ui section.models h4 {
    color: #e2e8f0 !important;
    border-bottom: 1px solid var(--border-color) !important;
  }

  .swagger-ui .model-box {
    background-color: #0b1120 !important;
    border: 1px solid var(--border-color) !important;
    border-radius: 8px !important;
  }

  .swagger-ui .model, .swagger-ui .model-title {
    color: #e2e8f0 !important;
  }

  .swagger-ui .prop-type {
    color: #38bdf8 !important;
  }

  .swagger-ui .prop-format {
    color: var(--text-muted) !important;
  }
`;

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('ManoLocal API')
    .setDescription(
      'Documentación interactiva de la API Backend de ManoLocal. Incluye Autenticación con 2FA por correo, Perfiles y Roles, Verificación de Identidad KYC, Validación de Documentos con IA Google Gemini, y Búsqueda de Especialistas con Geofiltro (Catálogo Oficial SEPOMEX y API Copomex).',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Pega tu token JWT aquí para acceder a endpoints protegidos (sin la palabra Bearer)',
        in: 'header',
      },
      'JWT-Auth',
    )
    .addTag('Autenticación', 'Registro de usuarios (ADMIN, EMPLEADOR, ESPECIALISTA), login y verificación 2FA')
    .addTag('Usuarios & Perfiles', 'Consulta y actualización de perfil, teléfono, dirección y oficios')
    .addTag('Catálogo de Trabajos', 'Galería de fotos de trabajos realizados por especialistas (límite de 10 fotos activas)')
    .addTag('Búsqueda & Geolocalización', 'Búsqueda geolocalizada de especialistas y resolución municipal')
    .addTag('Inteligencia Artificial', 'OCR y validación de certificaciones con Gemini AI')
    .addTag('Verificación KYC', 'Subida de documentos de identidad (INE y selfie)')
    .addTag('Sistema', 'Verificación de estado de la API')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'ManoLocal API - Documentación',
    customCss: SWAGGER_CUSTOM_CSS,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}

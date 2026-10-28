import { BadRequestException } from '@nestjs/common';
import { FileValidationPipe } from './file-validation.pipe';

describe('FileValidationPipe', () => {
  const createMockFile = (
    originalname: string,
    mimetype: string,
    sizeInBytes: number,
  ): Express.Multer.File => ({
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size: sizeInBytes,
    buffer: Buffer.from('test-content'),
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
  });

  it('should pass validation for a valid JPG file', () => {
    const pipe = new FileValidationPipe();
    const file = createMockFile('trabajo.jpg', 'image/jpeg', 1024 * 1024); // 1MB
    const result = pipe.transform(file);
    expect(result).toBe(file);
  });

  it('should pass validation for a valid JPEG, PNG and WEBP file', () => {
    const pipe = new FileValidationPipe();

    const jpegFile = createMockFile('trabajo.jpeg', 'image/jpeg', 2 * 1024 * 1024);
    expect(pipe.transform(jpegFile)).toBe(jpegFile);

    const pngFile = createMockFile('foto.png', 'image/png', 3 * 1024 * 1024);
    expect(pipe.transform(pngFile)).toBe(pngFile);

    const webpFile = createMockFile('muestra.webp', 'image/webp', 500 * 1024);
    expect(pipe.transform(webpFile)).toBe(webpFile);
  });

  it('should throw BadRequestException if file is missing and required', () => {
    const pipe = new FileValidationPipe({ required: true });
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
    expect(() => pipe.transform(undefined)).toThrow('Debe adjuntar una imagen válida');
  });

  it('should not throw if file is missing and required is false', () => {
    const pipe = new FileValidationPipe({ required: false });
    expect(pipe.transform(undefined)).toBeUndefined();
  });

  it('should throw BadRequestException if file size exceeds the limit', () => {
    const pipe = new FileValidationPipe({ maxSizeMb: 2 });
    const largeFile = createMockFile('pesada.jpg', 'image/jpeg', 3 * 1024 * 1024); // 3MB > 2MB
    expect(() => pipe.transform(largeFile)).toThrow(BadRequestException);
    expect(() => pipe.transform(largeFile)).toThrow('El tamaño del archivo no debe exceder 2MB');
  });

  it('should throw BadRequestException if mime type is not allowed', () => {
    const pipe = new FileValidationPipe();
    const pdfFile = createMockFile('documento.pdf', 'application/pdf', 1024);
    expect(() => pipe.transform(pdfFile)).toThrow(BadRequestException);
    expect(() => pipe.transform(pdfFile)).toThrow('Tipo de archivo no permitido');
  });

  it('should throw BadRequestException if extension is not allowed even if mime type is spoofed', () => {
    const pipe = new FileValidationPipe();
    const badExtFile = createMockFile('virus.exe', 'image/jpeg', 1024);
    expect(() => pipe.transform(badExtFile)).toThrow(BadRequestException);
    expect(() => pipe.transform(badExtFile)).toThrow('Extensión de archivo no permitida');
  });
});


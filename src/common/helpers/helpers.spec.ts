import {
  calculatePagination,
  buildPaginatedResult,
} from './pagination.helper';
import { StringSanitizer } from './string-sanitizer.helper';
import { DateHelper } from './date.helper';
import { SupabaseStorageHelper } from './supabase-storage.helper';
import { ConfigService } from '@nestjs/config';

describe('Common Helpers', () => {
  describe('PaginationHelper', () => {
    it('should calculate correct skip and take defaults', () => {
      const params = calculatePagination();
      expect(params.skip).toBe(0);
      expect(params.take).toBe(10);
      expect(params.page).toBe(1);
      expect(params.limit).toBe(10);
    });

    it('should calculate custom skip and take for page 3 with limit 20', () => {
      const params = calculatePagination({ page: 3, limit: 20 });
      expect(params.skip).toBe(40);
      expect(params.take).toBe(20);
      expect(params.page).toBe(3);
    });

    it('should build complete paginated metadata', () => {
      const items = ['a', 'b'];
      const result = buildPaginatedResult(items, 25, { page: 2, limit: 10 });
      expect(result.items).toEqual(items);
      expect(result.meta.total).toBe(25);
      expect(result.meta.page).toBe(2);
      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.hasNext).toBe(true);
      expect(result.meta.hasPrev).toBe(true);
    });
  });

  describe('StringSanitizer', () => {
    it('should normalize accented characters and trim', () => {
      const normalized = StringSanitizer.normalize('  Plomería y Cerrajería  ');
      expect(normalized).toBe('plomeria y cerrajeria');
    });

    it('should strip HTML tags from input', () => {
      const clean = StringSanitizer.stripHtml('<p>Hola <b>Mundo</b><script>alert(1)</script></p>');
      expect(clean).toBe('Hola Mundoalert(1)');
    });

    it('should clean multiple spaces', () => {
      const clean = StringSanitizer.cleanWhitespace('Hola    mundo   de   NestJS');
      expect(clean).toBe('Hola mundo de NestJS');
    });
  });

  describe('DateHelper', () => {
    it('should correctly detect expired dates', () => {
      const past = new Date(Date.now() - 10000);
      const future = new Date(Date.now() + 10000);
      expect(DateHelper.isExpired(past)).toBe(true);
      expect(DateHelper.isExpired(future)).toBe(false);
      expect(DateHelper.isExpired(null)).toBe(true);
    });

    it('should add minutes and days accurately', () => {
      const now = new Date();
      const in10Min = DateHelper.addMinutes(10, now);
      expect(in10Min.getTime() - now.getTime()).toBe(10 * 60 * 1000);

      const in2Days = DateHelper.addDays(2, now);
      expect(in2Days.getTime() - now.getTime()).toBe(2 * 24 * 60 * 60 * 1000);
    });
  });

  describe('SupabaseStorageHelper', () => {
    let configService: ConfigService;

    it('should warn and disable client if env variables are missing', async () => {
      configService = {
        get: jest.fn((key: string) => {
          if (key === 'SUPABASE_STORAGE_BUCKET') return 'kyc';
          if (key === 'SUPABASE_CATALOG_BUCKET') return 'catalog';
          return undefined;
        }),
      } as unknown as ConfigService;

      const helper = new SupabaseStorageHelper(configService);
      expect(helper.getCatalogBucket()).toBe('catalog');

      await expect(
        helper.uploadFile({ originalname: 'test.jpg' } as any),
      ).rejects.toThrow('El servicio de almacenamiento no está configurado');

      await expect(helper.createSignedUrl('test.jpg')).rejects.toThrow(
        'El servicio de almacenamiento no está configurado',
      );

      await expect(helper.deleteFile('test.jpg')).rejects.toThrow(
        'El servicio de almacenamiento no está configurado',
      );
    });

    it('should operate correctly when client is configured', async () => {
      const mockUpload = jest.fn().mockResolvedValue({ error: null });
      const mockGetPublicUrl = jest.fn().mockReturnValue({
        data: { publicUrl: 'https://supabase.co/storage/v1/object/public/catalog/file.jpg' },
      });
      const mockCreateSignedUrl = jest.fn().mockResolvedValue({
        data: { signedUrl: 'https://supabase.co/storage/v1/object/sign/kyc/file.pdf?token=abc' },
        error: null,
      });
      const mockRemove = jest.fn().mockResolvedValue({ error: null });

      const mockFrom = jest.fn().mockReturnValue({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
        createSignedUrl: mockCreateSignedUrl,
        remove: mockRemove,
      });

      configService = {
        get: jest.fn((key: string) => {
          if (key === 'SUPABASE_URL') return 'https://test.supabase.co';
          if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-key';
          if (key === 'SUPABASE_STORAGE_BUCKET') return 'kyc';
          if (key === 'SUPABASE_CATALOG_BUCKET') return 'catalog';
          return undefined;
        }),
      } as unknown as ConfigService;

      const helper = new SupabaseStorageHelper(configService);
      (helper as any).client = {
        storage: {
          from: mockFrom,
        },
      };

      // Test uploadFile
      const fakeFile = {
        originalname: 'Foto Trabajo.PNG',
        mimetype: 'image/png',
        buffer: Buffer.from('fake-data'),
      } as Express.Multer.File;

      const publicUrl = await helper.uploadFile(fakeFile, {
        bucket: 'catalog',
        folder: 'catalog/user-123',
      });
      expect(publicUrl).toBe('https://supabase.co/storage/v1/object/public/catalog/file.jpg');
      expect(mockFrom).toHaveBeenCalledWith('catalog');

      // Test createSignedUrl with relative path
      const signedUrl = await helper.createSignedUrl('kyc/user-123/ine.pdf', 1800, 'kyc');
      expect(signedUrl).toContain('token=abc');
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('kyc/user-123/ine.pdf', 1800);

      // Test createSignedUrl with full URL
      await helper.createSignedUrl('https://supabase.co/storage/v1/object/public/kyc/doc.pdf', 3600);
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('doc.pdf', 3600);

      // Test deleteFile
      await helper.deleteFile('catalog/user-123/image.webp', 'catalog');
      expect(mockRemove).toHaveBeenCalledWith(['catalog/user-123/image.webp']);
    });
  });
});

import {
  calculatePagination,
  buildPaginatedResult,
} from './pagination.helper';
import { StringSanitizer } from './string-sanitizer.helper';
import { DateHelper } from './date.helper';

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
});

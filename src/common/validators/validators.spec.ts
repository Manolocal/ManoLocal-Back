import { validate } from 'class-validator';
import { RegisterDto } from '../../auth/dto/register.dto';
import { Role } from '../enums/role.enum';
import {
  IsPostalCodeMx,
  IsPhoneNumberMx,
  IsRating,
  IsPositiveAmount,
} from './index';

class TestProfileDto {
  @IsPostalCodeMx()
  postalCode: string;

  @IsPhoneNumberMx()
  phone: string;
}

class TestReviewDto {
  @IsRating()
  rating: number;
}

class TestWalletDto {
  @IsPositiveAmount()
  amount: number;
}

describe('Custom Validators', () => {
  describe('Auth Validators (IsStrongPassword, IsValidRole)', () => {
    it('should fail validation if password is weak (missing uppercase, number or special char)', async () => {
      const dto = new RegisterDto();
      dto.email = 'valid@example.com';
      dto.role = Role.EMPLEADOR;
      dto.password = 'weakpassword';

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const passwordError = errors.find((e) => e.property === 'password');
      expect(passwordError).toBeDefined();
      expect(passwordError?.constraints).toHaveProperty('isStrongPassword');
    });

    it('should fail validation if role is invalid', async () => {
      const dto = new RegisterDto();
      dto.email = 'valid@example.com';
      dto.password = 'StrongPass123!';
      dto.role = 'INVALID_ROLE' as unknown as Role;

      const errors = await validate(dto);
      const roleError = errors.find((e) => e.property === 'role');
      expect(roleError).toBeDefined();
      expect(roleError?.constraints).toHaveProperty('isValidRole');
    });

    it('should pass validation with valid email, strong password, and valid role', async () => {
      const dto = new RegisterDto();
      dto.email = 'valid@example.com';
      dto.password = 'StrongPass123!';
      dto.role = Role.ESPECIALISTA;

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('IsPostalCodeMx', () => {
    it('should accept valid 5-digit Mexican postal codes', async () => {
      const dto = new TestProfileDto();
      dto.postalCode = '03100';
      dto.phone = '5512345678';
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'postalCode')).toBeUndefined();
    });

    it('should reject postal codes with letters or wrong length', async () => {
      const dto = new TestProfileDto();
      dto.postalCode = '0310';
      dto.phone = '5512345678';
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'postalCode')).toBeDefined();
    });
  });

  describe('IsPhoneNumberMx', () => {
    it('should accept 10-digit Mexican numbers with or without spaces/prefix', async () => {
      const dto1 = new TestProfileDto();
      dto1.postalCode = '03100';
      dto1.phone = '5512345678';
      const errors1 = await validate(dto1);
      expect(errors1.find((e) => e.property === 'phone')).toBeUndefined();

      const dto2 = new TestProfileDto();
      dto2.postalCode = '03100';
      dto2.phone = '+52 55 1234 5678';
      const errors2 = await validate(dto2);
      expect(errors2.find((e) => e.property === 'phone')).toBeUndefined();
    });

    it('should reject invalid phone numbers', async () => {
      const dto = new TestProfileDto();
      dto.postalCode = '03100';
      dto.phone = '123';
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'phone')).toBeDefined();
    });
  });

  describe('IsRating', () => {
    it('should accept ratings between 1 and 5 in steps of 0.5', async () => {
      const dto = new TestReviewDto();
      dto.rating = 4.5;
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject ratings outside 1-5 or invalid increments', async () => {
      const dto = new TestReviewDto();
      dto.rating = 5.5;
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'rating')).toBeDefined();
    });
  });

  describe('IsPositiveAmount', () => {
    it('should accept positive amounts with max 2 decimals', async () => {
      const dto = new TestWalletDto();
      dto.amount = 150.5;
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject negative, zero or more than 2 decimals', async () => {
      const dto = new TestWalletDto();
      dto.amount = -10;
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'amount')).toBeDefined();
    });
  });
});

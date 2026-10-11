import { validate } from 'class-validator';
import { RegisterDto } from '../../auth/dto/register.dto';
import { Role } from '../enums/role.enum';

describe('Custom Validators', () => {
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
    dto.role = 'INVALID_ROLE' as any;

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

import { TrimStringsPipe } from './trim-strings.pipe';
import { ArgumentMetadata } from '@nestjs/common';

describe('TrimStringsPipe', () => {
  let pipe: TrimStringsPipe;

  beforeEach(() => {
    pipe = new TrimStringsPipe();
  });

  it('should trim string values in object body', () => {
    const metadata: ArgumentMetadata = { type: 'body' };
    const input = {
      name: '  Juan Pérez  ',
      email: ' juan@example.com ',
      age: 30,
      skills: ['  plomero  ', ' electricista '],
      address: {
        street: '  Calle 123  ',
      },
    };

    const result = pipe.transform(input, metadata) as typeof input;

    expect(result.name).toBe('Juan Pérez');
    expect(result.email).toBe('juan@example.com');
    expect(result.age).toBe(30);
    expect(result.skills).toEqual(['plomero', 'electricista']);
    expect(result.address.street).toBe('Calle 123');
  });

  it('should leave non-body types untouched', () => {
    const metadata: ArgumentMetadata = { type: 'query' };
    const input = '  test  ';
    expect(pipe.transform(input, metadata)).toBe('  test  ');
  });
});

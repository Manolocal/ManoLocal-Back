import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { SearchService } from './search.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CopomexService } from './copomex.service';
import { SearchSpecialistsDto } from '../dto/search-specialists.dto';

describe('SearchService', () => {
  let service: SearchService;
  let mockPrisma: {
    profile: {
      findUnique: jest.Mock;
    };
    user: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let mockCopomex: {
    getPostalCodesForCp: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      profile: {
        findUnique: jest.fn(),
      },
      user: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };

    mockCopomex = {
      getPostalCodesForCp: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: CopomexService,
          useValue: mockCopomex,
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('searchSpecialists con CP explícito', () => {
    it('debe utilizar el CP de la consulta, llamar a Copomex y filtrar especialistas', async () => {
      const query: SearchSpecialistsDto = {
        skill: 'plomero',
        postalCode: '01000',
        page: 1,
        limit: 10,
      };

      mockCopomex.getPostalCodesForCp.mockResolvedValueOnce({
        municipio: 'Álvaro Obregón',
        postalCodes: ['01000', '01010', '01020'],
      });

      const mockUsers = [
        {
          id: 'user-esp-1',
          name: 'Juan Perez',
          email: 'juan@test.com',
          status: UserStatus.ACTIVO,
          profile: {
            fullName: 'Juan Perez',
            phone: '5512345678',
            postalCode: '01000',
          },
          knowledges: [
            {
              id: 'k-1',
              name: 'Plomero certificado',
              verifications: [{ id: 'v-1', status: 'VALIDATED', score: 0.95 }],
            },
          ],
        },
      ];

      mockPrisma.user.count.mockResolvedValueOnce(1);
      mockPrisma.user.findMany.mockResolvedValueOnce(mockUsers);

      const result = await service.searchSpecialists(undefined, query);

      expect(mockCopomex.getPostalCodesForCp).toHaveBeenCalledWith('01000');
      expect(mockPrisma.user.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          role: Role.ESPECIALISTA,
          profile: {
            postalCode: {
              in: ['01000', '01010', '01020'],
            },
          },
        }),
      });
      expect(result.specialists).toHaveLength(1);
      expect(result.geoFilter.municipio).toBe('Álvaro Obregón');
      expect(result.geoFilter.totalPostalCodesInMunicipality).toBe(3);
      expect(result.pagination.total).toBe(1);
    });
  });

  describe('searchSpecialists con CP de perfil del Empleador', () => {
    it('debe leer el CP del perfil del usuario cuando no se envía en query', async () => {
      const userId = 'empleador-123';
      const query: SearchSpecialistsDto = {
        skill: 'electricista',
      };

      mockPrisma.profile.findUnique.mockResolvedValueOnce({
        postalCode: '03100',
      });

      mockCopomex.getPostalCodesForCp.mockResolvedValueOnce({
        municipio: 'Benito Juárez',
        postalCodes: ['03100', '03104'],
      });

      mockPrisma.user.count.mockResolvedValueOnce(0);
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      const result = await service.searchSpecialists(userId, query);

      expect(mockPrisma.profile.findUnique).toHaveBeenCalledWith({
        where: { userId },
        select: { postalCode: true },
      });
      expect(mockCopomex.getPostalCodesForCp).toHaveBeenCalledWith('03100');
      expect(result.geoFilter.municipio).toBe('Benito Juárez');
      expect(result.specialists).toHaveLength(0);
    });

    it('debe lanzar BadRequestException si el empleador no tiene CP en su perfil', async () => {
      const userId = 'empleador-sin-cp';
      const query: SearchSpecialistsDto = {
        skill: 'carpintero',
      };

      mockPrisma.profile.findUnique.mockResolvedValueOnce({
        postalCode: null,
      });

      await expect(service.searchSpecialists(userId, query)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException si no hay userId ni postalCode', async () => {
      const query: SearchSpecialistsDto = {
        skill: 'carpintero',
      };

      await expect(service.searchSpecialists(undefined, query)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

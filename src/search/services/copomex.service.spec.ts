import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { CopomexService } from './copomex.service';
import { HttpClient } from '../../common/http/http-client.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('CopomexService', () => {
  let service: CopomexService;
  let mockHttpClient: {
    get: jest.Mock;
  };
  let mockConfigService: {
    get: jest.Mock;
  };

  let mockPrismaService: {
    sepomexPostalCode: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockHttpClient = {
      get: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'COPOMEX_API_URL') return 'https://api.copomex.com/query';
        if (key === 'COPOMEX_TOKEN') return 'pruebas';
        return null;
      }),
    };

    mockPrismaService = {
      sepomexPostalCode: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CopomexService,
        {
          provide: HttpClient,
          useValue: mockHttpClient,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CopomexService>(CopomexService);
    service.clearCache();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('getMunicipioByCp', () => {
    it('debe consultar la API de Copomex y retornar el municipio', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: [
          {
            error: false,
            code_error: 0,
            response: {
              cp: '01000',
              municipio: 'Álvaro Obregón',
              estado: 'Ciudad de México',
            },
          },
        ],
      });

      const municipio = await service.getMunicipioByCp('01000');
      expect(municipio).toBe('Álvaro Obregón');
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        'https://api.copomex.com/query/info_cp/01000?type=simplified&token=pruebas',
      );
    });

    it('debe resolver el municipio directamente desde Supabase sin consumir la API externa', async () => {
      mockPrismaService.sepomexPostalCode.findFirst.mockResolvedValueOnce({
        municipio: 'Álvaro Obregón',
      });

      const municipio = await service.getMunicipioByCp('01000');
      expect(municipio).toBe('Álvaro Obregón');
      expect(mockHttpClient.get).not.toHaveBeenCalled();
      expect(mockPrismaService.sepomexPostalCode.findFirst).toHaveBeenCalledWith({
        where: { postalCode: '01000' },
        select: { municipio: true },
      });
    });

    it('debe servir la segunda consulta desde la caché de 24h sin volver a llamar a la API externa', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: [
          {
            error: false,
            response: {
              cp: '01000',
              municipio: 'Álvaro Obregón',
            },
          },
        ],
      });

      // Primera llamada: consulta la API
      const res1 = await service.getMunicipioByCp('01000');
      // Segunda llamada: debe resolver desde caché en memoria
      const res2 = await service.getMunicipioByCp('01000');

      expect(res1).toBe('Álvaro Obregón');
      expect(res2).toBe('Álvaro Obregón');
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    });

    it('debe lanzar NotFoundException si Copomex retorna error o no halla el CP', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          error: true,
          code_error: 104,
          error_message: 'CP no encontrado',
          response: null,
        },
      });

      await expect(service.getMunicipioByCp('99999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getPostalCodesByMunicipio', () => {
    it('debe retornar lista de CPs únicos para el municipio dado', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          error: false,
          response: {
            cp: ['01000', '01010', '01020', '01000'],
          },
        },
      });

      const cps = await service.getPostalCodesByMunicipio('Álvaro Obregón');
      expect(cps).toEqual(['01000', '01010', '01020']);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    });

    it('debe utilizar la caché independientemente de mayúsculas o acentos en el municipio', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          error: false,
          response: {
            cp: ['01000', '01010'],
          },
        },
      });

      const cps1 = await service.getPostalCodesByMunicipio('Álvaro Obregón');
      const cps2 = await service.getPostalCodesByMunicipio('alvaro obregon');

      expect(cps1).toEqual(['01000', '01010']);
      expect(cps2).toEqual(['01000', '01010']);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPostalCodesForCp', () => {
    it('debe resolver municipio y CPs, asegurando que el CP original esté incluido', async () => {
      mockHttpClient.get
        .mockResolvedValueOnce({
          data: [
            {
              error: false,
              response: { cp: '01000', municipio: 'Álvaro Obregón' },
            },
          ],
        })
        .mockResolvedValueOnce({
          data: {
            error: false,
            response: { cp: ['01010', '01020'] },
          },
        });

      const result = await service.getPostalCodesForCp('01000');
      expect(result.municipio).toBe('Álvaro Obregón');
      expect(result.postalCodes).toContain('01000');
      expect(result.postalCodes).toContain('01010');
      expect(result.postalCodes).toContain('01020');
    });
  });
});

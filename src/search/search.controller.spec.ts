import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './services/search.service';
import { CopomexService } from './services/copomex.service';
import { SearchSpecialistsDto } from './dto/search-specialists.dto';

describe('SearchController', () => {
  let controller: SearchController;
  let mockSearchService: {
    searchSpecialists: jest.Mock;
  };
  let mockCopomexService: {
    getPostalCodesForCp: jest.Mock;
  };

  beforeEach(async () => {
    mockSearchService = {
      searchSpecialists: jest.fn(),
    };

    mockCopomexService = {
      getPostalCodesForCp: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        {
          provide: SearchService,
          useValue: mockSearchService,
        },
        {
          provide: CopomexService,
          useValue: mockCopomexService,
        },
      ],
    }).compile();

    controller = module.get<SearchController>(SearchController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  describe('searchSpecialists', () => {
    it('debe invocar a searchService.searchSpecialists con el userId y query', async () => {
      const userId = 'empleador-uuid';
      const query: SearchSpecialistsDto = {
        skill: 'plomero',
        postalCode: '01000',
      };

      const expectedResponse = {
        specialists: [],
        geoFilter: {
          searchedPostalCode: '01000',
          municipio: 'Álvaro Obregón',
          totalPostalCodesInMunicipality: 10,
        },
        pagination: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      mockSearchService.searchSpecialists.mockResolvedValueOnce(expectedResponse);

      const result = await controller.searchSpecialists(userId, query);

      expect(mockSearchService.searchSpecialists).toHaveBeenCalledWith(
        userId,
        query,
      );
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('getGeoInfo', () => {
    it('debe invocar a copomexService.getPostalCodesForCp con el CP proporcionado', async () => {
      const cp = '01000';
      const expectedResponse = {
        municipio: 'Álvaro Obregón',
        postalCodes: ['01000', '01010'],
      };

      mockCopomexService.getPostalCodesForCp.mockResolvedValueOnce(expectedResponse);

      const result = await controller.getGeoInfo(cp);

      expect(mockCopomexService.getPostalCodesForCp).toHaveBeenCalledWith(cp);
      expect(result).toEqual(expectedResponse);
    });
  });
});

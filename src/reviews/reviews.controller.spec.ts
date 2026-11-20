import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { JobCompletedGuard } from './guards/job-completed.guard';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';

describe('ReviewsController', () => {
  let controller: ReviewsController;
  let reviewsService: {
    createReview: jest.Mock;
    getReviewsBySpecialist: jest.Mock;
    getReviewByJob: jest.Mock;
  };

  beforeEach(async () => {
    reviewsService = {
      createReview: jest.fn(),
      getReviewsBySpecialist: jest.fn(),
      getReviewByJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [{ provide: ReviewsService, useValue: reviewsService }],
    })
      .overrideGuard(JobCompletedGuard)
      .useValue({ canActivate: jest.fn().mockResolvedValue(true) })
      .compile();

    controller = module.get<ReviewsController>(ReviewsController);
  });

  it('delega createReview con el usuario autenticado', async () => {
    const dto = { jobAgreementId: 'job-uuid', rating: 5, comment: 'Gran trabajo' };
    reviewsService.createReview.mockResolvedValue({ message: 'Reseña publicada' });

    const res = await controller.createReview(
      {
        id: 'emp-1',
        email: 'e@test.com',
        name: 'Empleador',
        role: Role.EMPLEADOR,
        status: UserStatus.ACTIVO,
      },
      dto,
    );

    expect(reviewsService.createReview).toHaveBeenCalledWith('emp-1', dto);
    expect(res).toEqual({ message: 'Reseña publicada' });
  });

  it('delega getReviewsBySpecialist públicamente', async () => {
    reviewsService.getReviewsBySpecialist.mockResolvedValue({ reviews: [] });

    const res = await controller.getReviewsBySpecialist('spec-1', {
      page: 2,
      limit: 5,
    });

    expect(reviewsService.getReviewsBySpecialist).toHaveBeenCalledWith('spec-1', {
      page: 2,
      limit: 5,
    });
    expect(res).toEqual({ reviews: [] });
  });

  it('delega getReviewByJob con usuario y rol', async () => {
    reviewsService.getReviewByJob.mockResolvedValue({ hasReview: false });

    const res = await controller.getReviewByJob(
      {
        id: 'spec-1',
        email: 's@test.com',
        name: 'Especialista',
        role: Role.ESPECIALISTA,
        status: UserStatus.ACTIVO,
      },
      'job-1',
    );

    expect(reviewsService.getReviewByJob).toHaveBeenCalledWith(
      'spec-1',
      Role.ESPECIALISTA,
      'job-1',
    );
    expect(res).toEqual({ hasReview: false });
  });
});

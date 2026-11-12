import { Test, TestingModule } from '@nestjs/testing';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { JobStatus } from '@prisma/client';

describe('JobsController', () => {
  let controller: JobsController;
  let mockJobsService: {
    createJob: jest.Mock;
    getMyJobs: jest.Mock;
    getJobsByRoom: jest.Mock;
    getJobById: jest.Mock;
    confirmJob: jest.Mock;
    completeJob: jest.Mock;
    cancelJob: jest.Mock;
  };

  const mockUser = {
    id: 'user-1',
    email: 'user@test.com',
    name: 'Carlos',
    role: Role.EMPLEADOR,
    status: UserStatus.ACTIVO,
  };

  beforeEach(async () => {
    mockJobsService = {
      createJob: jest.fn(),
      getMyJobs: jest.fn(),
      getJobsByRoom: jest.fn(),
      getJobById: jest.fn(),
      confirmJob: jest.fn(),
      completeJob: jest.fn(),
      cancelJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        {
          provide: JobsService,
          useValue: mockJobsService,
        },
      ],
    }).compile();

    controller = module.get<JobsController>(JobsController);
  });

  it('should create a job agreement', async () => {
    const mockResponse = { message: 'ok', job: { id: 'job-1' } };
    mockJobsService.createJob.mockResolvedValue(mockResponse);

    const dto = { roomId: 'room-1', title: 'Plomería' };
    const result = await controller.createJob(mockUser, dto);

    expect(mockJobsService.createJob).toHaveBeenCalledWith('user-1', dto);
    expect(result).toEqual(mockResponse);
  });

  it('should list authenticated user jobs', async () => {
    const mockResponse = {
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
    };
    mockJobsService.getMyJobs.mockResolvedValue(mockResponse);

    const query = { page: 1, limit: 10, status: JobStatus.CONFIRMED };
    const result = await controller.getMyJobs(mockUser, query);

    expect(mockJobsService.getMyJobs).toHaveBeenCalledWith('user-1', query);
    expect(result).toEqual(mockResponse);
  });

  it('should list jobs in a chat room', async () => {
    const mockResponse = { roomId: 'room-1', activeJob: null, jobs: [] };
    mockJobsService.getJobsByRoom.mockResolvedValue(mockResponse);

    const result = await controller.getJobsByRoom(mockUser, 'room-1');

    expect(mockJobsService.getJobsByRoom).toHaveBeenCalledWith(
      'user-1',
      'room-1',
    );
    expect(result).toEqual(mockResponse);
  });

  it('should get job by id', async () => {
    const mockJob = { id: 'job-1' };
    mockJobsService.getJobById.mockResolvedValue(mockJob);

    const result = await controller.getJobById(mockUser, 'job-1');

    expect(mockJobsService.getJobById).toHaveBeenCalledWith('user-1', 'job-1');
    expect(result).toEqual(mockJob);
  });

  it('should confirm a job', async () => {
    const mockResponse = { job: { id: 'job-1', status: JobStatus.CONFIRMED } };
    mockJobsService.confirmJob.mockResolvedValue(mockResponse);

    const result = await controller.confirmJob(mockUser, 'job-1');

    expect(mockJobsService.confirmJob).toHaveBeenCalledWith('user-1', 'job-1');
    expect(result).toEqual(mockResponse);
  });

  it('should complete a job', async () => {
    const mockResponse = { job: { id: 'job-1', status: JobStatus.COMPLETED } };
    mockJobsService.completeJob.mockResolvedValue(mockResponse);

    const result = await controller.completeJob(mockUser, 'job-1');

    expect(mockJobsService.completeJob).toHaveBeenCalledWith('user-1', 'job-1');
    expect(result).toEqual(mockResponse);
  });

  it('should cancel a job', async () => {
    const mockResponse = { job: { id: 'job-1', status: JobStatus.CANCELLED } };
    mockJobsService.cancelJob.mockResolvedValue(mockResponse);

    const dto = { reason: 'Ya no se requiere' };
    const result = await controller.cancelJob(mockUser, 'job-1', dto);

    expect(mockJobsService.cancelJob).toHaveBeenCalledWith(
      'user-1',
      'job-1',
      dto,
    );
    expect(result).toEqual(mockResponse);
  });
});

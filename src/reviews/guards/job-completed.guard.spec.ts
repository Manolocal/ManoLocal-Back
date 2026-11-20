import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { JobCompletedGuard } from './job-completed.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../../common/enums/role.enum';

describe('JobCompletedGuard', () => {
  let guard: JobCompletedGuard;
  let prisma: {
    jobAgreement: {
      findUnique: jest.Mock;
    };
  };

  const validJobId = '9c1d4c3e-6a8f-4f2b-a801-2c4d6e8f9a10';

  const makeContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    prisma = {
      jobAgreement: {
        findUnique: jest.fn(),
      },
    };
    guard = new JobCompletedGuard(prisma as unknown as PrismaService);
  });

  it('lanza BadRequestException si jobAgreementId no es UUID válido', async () => {
    const ctx = makeContext({
      user: { id: 'emp-1', role: Role.EMPLEADOR },
      body: { jobAgreementId: 'invalid-id' },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
  });

  it('lanza NotFoundException si el acuerdo no existe', async () => {
    prisma.jobAgreement.findUnique.mockResolvedValue(null);
    const ctx = makeContext({
      user: { id: 'emp-1', role: Role.EMPLEADOR },
      body: { jobAgreementId: validJobId },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });

  it('lanza ForbiddenException si quien reseña no es el empleador del acuerdo', async () => {
    prisma.jobAgreement.findUnique.mockResolvedValue({
      id: validJobId,
      status: JobStatus.COMPLETED,
      room: { employerId: 'emp-real', specialistId: 'spec-1' },
      review: null,
    });
    const ctx = makeContext({
      user: { id: 'emp-otro', role: Role.EMPLEADOR },
      body: { jobAgreementId: validJobId },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('lanza ConflictException si el acuerdo no está COMPLETED', async () => {
    prisma.jobAgreement.findUnique.mockResolvedValue({
      id: validJobId,
      status: JobStatus.CONFIRMED,
      room: { employerId: 'emp-1', specialistId: 'spec-1' },
      review: null,
    });
    const ctx = makeContext({
      user: { id: 'emp-1', role: Role.EMPLEADOR },
      body: { jobAgreementId: validJobId },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ConflictException);
  });

  it('lanza ConflictException si el trabajo ya fue reseñado', async () => {
    prisma.jobAgreement.findUnique.mockResolvedValue({
      id: validJobId,
      status: JobStatus.COMPLETED,
      room: { employerId: 'emp-1', specialistId: 'spec-1' },
      review: { id: 'rev-1' },
    });
    const ctx = makeContext({
      user: { id: 'emp-1', role: Role.EMPLEADOR },
      body: { jobAgreementId: validJobId },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ConflictException);
  });

  it('permite pasar cuando el empleador coincide, el estado es COMPLETED y no existe reseña', async () => {
    const job = {
      id: validJobId,
      status: JobStatus.COMPLETED,
      room: { employerId: 'emp-1', specialistId: 'spec-1' },
      review: null,
    };
    prisma.jobAgreement.findUnique.mockResolvedValue(job);

    const request: Record<string, unknown> = {
      user: { id: 'emp-1', role: Role.EMPLEADOR },
      body: { jobAgreementId: validJobId },
    };

    const allowed = await guard.canActivate(makeContext(request));

    expect(allowed).toBe(true);
    expect(request.validatedJob).toEqual(job);
  });
});

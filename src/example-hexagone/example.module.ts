// TODO(starter): Wire your adapters to ports here (swap InMemory for Prisma when ready)
import { InMemoryExampleRepository } from "./adapters/in-memory/repositories/in-memory-example.repository";
import { CreateExampleUseCase } from "./application/usecases/create-example.usecase";

const repository = new InMemoryExampleRepository();

export const createExampleUseCase = new CreateExampleUseCase(repository);

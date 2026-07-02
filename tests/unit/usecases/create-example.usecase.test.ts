import { describe, expect, it } from "vitest";
import { InMemoryExampleRepository } from "@/example-hexagone/adapters/in-memory/repositories/in-memory-example.repository";
import { ExampleStatus } from "@/example-hexagone/domain/value-objects/example-status.enum";
import { CreateExampleUseCase } from "@/example-hexagone/application/usecases/create-example.usecase";

describe("CreateExampleUseCase", () => {
  it("should create an example and persist it", async () => {
    const repo = new InMemoryExampleRepository();
    const useCase = new CreateExampleUseCase(repo);

    const result = await useCase.execute({
      name: "Test Example",
      status: ExampleStatus.PENDING,
    });

    expect(result.name).toBe("Test Example");
    expect(result.status).toBe(ExampleStatus.PENDING);
    expect(result.id).toBeDefined();

    const found = await repo.findById(result.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Test Example");
  });
});

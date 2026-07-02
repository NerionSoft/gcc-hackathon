import { Example } from "../../domain/entities/example.entity";
import { CreateExampleDto } from "../dto/create-example.dto";
import { ExampleRepository } from "../ports/example.repository";

export class CreateExampleUseCase {
  constructor(private readonly exampleRepo: ExampleRepository) {}

  async execute(input: CreateExampleDto) {
    const example = Example.create(input);
    return this.exampleRepo.create(example);
  }
}

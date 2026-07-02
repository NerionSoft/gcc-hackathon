import { ExampleStatus } from "../value-objects/example-status.enum";
import { v7 as uuidv7 } from "uuid";

// TODO(starter): Replace fields with your entity's properties
export class Example {
  constructor(
    public id: string,
    public readonly name: string,
    public status: ExampleStatus,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  // TODO(starter): Adapt factory input to match your entity's creation requirements
  static create(input: { name: string; status: ExampleStatus }) {
    const now = new Date();

    return new Example(uuidv7(), input.name, input.status, now, now);
  }
}

import { z } from "zod";
import { ExampleStatus } from "../../domain/value-objects/example-status.enum";

// TODO(starter): Define validation schema for your entity's creation input
export const CreateExampleDtoSchema = z.object({
  name: z.string(),
  status: z.enum(ExampleStatus),
});

export type CreateExampleDto = z.infer<typeof CreateExampleDtoSchema>;

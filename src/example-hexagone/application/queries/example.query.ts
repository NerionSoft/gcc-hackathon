import { ExampleStatus } from "@/example-hexagone/domain/value-objects/example-status.enum";

// TODO(starter): Adapt query filters and sort fields to your entity
export interface ExampleQuery {
  filters?: {
    deleted?: boolean;
    status?: ExampleStatus;
    createdAfter?: Date;
    search?: string;
  };

  sort?: {
    field: "createdAt" | "name";
    direction: "asc" | "desc";
  };

  pagination?: {
    skip: number;
    take: number;
  };
}

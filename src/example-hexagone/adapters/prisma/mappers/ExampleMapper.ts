import { Example } from "@/example-hexagone/domain/entities/example.entity";
import { ExampleStatus } from "@/example-hexagone/domain/value-objects/example-status.enum";
import { Example as PrismaExample } from "@prisma/client";

// TODO(starter): Update mapping to match your entity's fields
export class ExampleMapper {
  static toDomain(row: PrismaExample): Example {
    return new Example(row.id, row.name, row.status as ExampleStatus, row.createdAt, row.updatedAt);
  }
}

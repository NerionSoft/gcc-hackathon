import { ExampleRepository } from "@/example-hexagone/application/ports/example.repository";
import { ExampleQuery } from "@/example-hexagone/application/queries/example.query";
import { Example } from "@/example-hexagone/domain/entities/example.entity";
import { ExampleMapper } from "../mappers/ExampleMapper";
import { prisma } from "@/infrastructure/db/prisma-client";

// TODO(starter): Update Prisma queries to match your entity's fields and filters
export class PrismaExampleRepository implements ExampleRepository {
  async exists(id: string): Promise<boolean> {
    const count = await prisma.example.count({
      where: { id, deletedAt: null },
    });

    return count > 0;
  }

  async findById(id: string): Promise<Example | null> {
    const row = await prisma.example.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!row) return null;

    return ExampleMapper.toDomain(row);
  }

  async findMany(query: ExampleQuery): Promise<Example[]> {
    const rows = await prisma.example.findMany({
      where: {
        ...(query.filters?.status && {
          status: query.filters.status,
        }),
        deletedAt: null,
      },
      skip: query.pagination?.skip,
      take: query.pagination?.take,
      orderBy: query.sort ? { [query.sort.field]: query.sort.direction } : { createdAt: "desc" },
    });

    return rows.map(ExampleMapper.toDomain);
  }

  async create(data: Example): Promise<Example> {
    const row = await prisma.example.create({
      data: {
        id: data.id,
        name: data.name,
        status: data.status,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
    });

    return ExampleMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.example.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}

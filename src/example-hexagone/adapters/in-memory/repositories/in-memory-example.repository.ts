import { ExampleRepository } from "@/example-hexagone/application/ports/example.repository";
import { ExampleQuery } from "@/example-hexagone/application/queries/example.query";
import { Example } from "@/example-hexagone/domain/entities/example.entity";

export class InMemoryExampleRepository implements ExampleRepository {
  private store: Map<string, Example> = new Map();

  async exists(id: string): Promise<boolean> {
    return this.store.has(id);
  }

  async findById(id: string): Promise<Example | null> {
    return this.store.get(id) ?? null;
  }

  async findMany(query: ExampleQuery): Promise<Example[]> {
    let results = Array.from(this.store.values());

    if (query.filters?.status) {
      results = results.filter((e) => e.status === query.filters!.status);
    }

    if (query.sort) {
      const dir = query.sort.direction === "asc" ? 1 : -1;
      results.sort((a, b) => {
        const aVal = a[query.sort!.field];
        const bVal = b[query.sort!.field];
        return aVal < bVal ? -dir : aVal > bVal ? dir : 0;
      });
    }

    const skip = query.pagination?.skip ?? 0;
    const take = query.pagination?.take ?? results.length;
    return results.slice(skip, skip + take);
  }

  async create(data: Example): Promise<Example> {
    this.store.set(data.id, data);
    return data;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

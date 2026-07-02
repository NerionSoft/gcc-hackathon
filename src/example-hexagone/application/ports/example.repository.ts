import { Example } from "../../domain/entities/example.entity";
import { ExampleQuery } from "../queries/example.query";

/**
 * Port interface for Example persistence operations.
 *
 * Abstracts Prisma access so use cases can be tested with mock
 * implementations. Follows the factory-function pattern established
 */
// TODO(starter): Adapt repository methods to your entity's persistence needs
export interface ExampleRepository {
  // ─── Reads ────────────────────────────────────────────────

  /**
   * Check whether a example with the given ID exists.
   *
   * @param {string} id - Example ID.
   * @returns {Promise<boolean>} True if the ID is already taken.
   */
  exists(id: string): Promise<boolean>;

  /**
   * Find a example by ID (excludes soft-deleted).
   *
   * @param {string} id - Example ID.
   * @returns {Promise<Example | null>} The example, or `null` if not found.
   */
  findById(id: string): Promise<Example | null>;

  /**
   * Find examples with pagination and sorting.
   *
   * @param {ExampleQuery} query - Query with fields, sorting & pagination.
   * @returns {Promise<Example[]>} The matching examples.
   */
  findMany(query: ExampleQuery): Promise<Example[]>;

  // ─── Writes ────────────────────────────────────────────────

  /**
   * Create a new example inside a transaction.
   *
   * @param {Example} data - Example creation payload.
   * @returns {Promise<Example>} The created example.
   */
  create(data: Example): Promise<Example>;

  // ─── Delete ────────────────────────────────────────────────

  /**
   * Delete existing example.
   *
   * @param {string} id - Example id to delete.
   * @returns {Promise<void>}
   */
  delete(id: string): Promise<void>;
}

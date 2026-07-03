import type Database from "better-sqlite3";
import { getDb } from "@/db/client";
import {
  riskFrameworkSchema,
  severityRubricSchema,
  type RiskDimension,
  type RiskFramework,
  type RiskSignalDefinition,
} from "@/db/schema";

interface FrameworkRow {
  id: string;
  name: string;
  version: string;
  effective_date: string;
}

interface DimensionRow {
  id: string;
  framework_id: string;
  code: string;
  title: string;
  description: string;
}

interface DefinitionRow {
  id: string;
  dimension_id: string;
  dimension_code: string;
  code: string;
  title: string;
  description: string;
  source_dataset: string;
  source_endpoint: string;
  source_licence: string;
  method: string;
  severity_rubric: string;
}

export function insertFramework(
  candidate: unknown,
  db: Database.Database = getDb(),
): RiskFramework {
  const framework = riskFrameworkSchema.parse(candidate);

  const write = db.transaction((fw: RiskFramework) => {
    db.prepare(
      "INSERT INTO risk_frameworks (id, name, version, effective_date) VALUES (?, ?, ?, ?)",
    ).run(fw.id, fw.name, fw.version, fw.effectiveDate);

    for (const dim of fw.dimensions) {
      db.prepare(
        "INSERT INTO risk_dimensions (id, framework_id, code, title, description) VALUES (?, ?, ?, ?, ?)",
      ).run(dim.id, fw.id, dim.code, dim.title, dim.description);

      for (const def of dim.signals) {
        db.prepare(
          `INSERT INTO risk_signal_definitions (
             id, dimension_id, dimension_code, code, title, description,
             source_dataset, source_endpoint, source_licence, method, severity_rubric)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          def.id,
          dim.id,
          def.dimensionCode,
          def.code,
          def.title,
          def.description,
          def.source.dataset,
          def.source.endpoint,
          def.source.licence,
          def.method,
          JSON.stringify(def.severityRubric),
        );
      }
    }
  });
  write(framework);
  return framework;
}

function rowToDefinition(row: DefinitionRow): RiskSignalDefinition {
  return {
    id: row.id,
    dimensionCode: row.dimension_code as RiskSignalDefinition["dimensionCode"],
    code: row.code,
    title: row.title,
    description: row.description,
    source: {
      dataset: row.source_dataset,
      endpoint: row.source_endpoint,
      licence: row.source_licence,
    },
    method: row.method,
    severityRubric: severityRubricSchema.parse(JSON.parse(row.severity_rubric)),
  };
}

export function getFrameworkByName(
  name: string,
  db: Database.Database = getDb(),
): RiskFramework | undefined {
  const fw = db
    .prepare("SELECT * FROM risk_frameworks WHERE name = ? ORDER BY version DESC LIMIT 1")
    .get(name) as FrameworkRow | undefined;
  if (!fw) return undefined;

  const dims = db
    .prepare("SELECT * FROM risk_dimensions WHERE framework_id = ? ORDER BY code")
    .all(fw.id) as DimensionRow[];

  const dimensions: RiskDimension[] = dims.map((dim) => {
    const defs = db
      .prepare("SELECT * FROM risk_signal_definitions WHERE dimension_id = ? ORDER BY code")
      .all(dim.id) as DefinitionRow[];
    return {
      id: dim.id,
      code: dim.code as RiskDimension["code"],
      title: dim.title,
      description: dim.description,
      signals: defs.map(rowToDefinition),
    };
  });

  return riskFrameworkSchema.parse({
    id: fw.id,
    name: fw.name,
    version: fw.version,
    effectiveDate: fw.effective_date,
    dimensions,
  });
}

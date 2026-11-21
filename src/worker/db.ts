import type { D1Database, D1PreparedStatement, D1Result } from './env';

type Param = string | number | null;

/**
 * Envoltura mínima sobre D1 para mantener consultas parametrizadas y
 * consistentes. Todas las consultas de negocio incluyen org_id.
 */
export class Db {
  constructor(private readonly d1: D1Database) {}

  prepare(sql: string, params: Param[] = []): D1PreparedStatement {
    const statement = this.d1.prepare(sql);
    if (params.length === 0) return statement;
    return statement.bind(...params);
  }

  async first<T>(sql: string, params: Param[] = []): Promise<T | null> {
    return this.prepare(sql, params).first<T>();
  }

  async all<T>(sql: string, params: Param[] = []): Promise<T[]> {
    const result = await this.prepare(sql, params).all<T>();
    return result.results ?? [];
  }

  async run(sql: string, params: Param[] = []): Promise<D1Result<Record<string, unknown>>> {
    return this.prepare(sql, params).run();
  }

  /** `batch` de D1 se ejecuta como una transacción atómica. */
  async batch(statements: Array<{ sql: string; params?: Param[] }>): Promise<D1Result<Record<string, unknown>>[]> {
    return this.d1.batch(statements.map((item) => this.prepare(item.sql, item.params ?? [])));
  }

  async count(sql: string, params: Param[] = []): Promise<number> {
    const row = await this.first<{ total: number }>(sql, params);
    return Number(row?.total ?? 0);
  }

  async sum(sql: string, params: Param[] = []): Promise<number> {
    const row = await this.first<{ total: number | null }>(sql, params);
    return Number(row?.total ?? 0);
  }
}

export function dbFrom(d1: D1Database): Db {
  return new Db(d1);
}

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

export function buildInClause(values: string[]): string {
  return placeholders(values.length);
}

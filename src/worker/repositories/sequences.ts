import type { Db } from '../db';

/**
 * Secuencias por organización. Se incrementan de forma atómica con RETURNING,
 * de modo que dos requests concurrentes nunca obtienen el mismo número.
 */
export async function nextSequence(db: Db, orgId: string, name: string, fallbackPrefix: string): Promise<string> {
  const row = await db.first<{ next_value: number; prefix: string }>(
    `UPDATE sequences SET next_value = next_value + 1
      WHERE org_id = ? AND name = ?
      RETURNING next_value, prefix`,
    [orgId, name],
  );

  if (row) {
    return `${row.prefix}-${String(Math.max(1, row.next_value - 1)).padStart(5, '0')}`;
  }

  await db.run(
    `INSERT INTO sequences (org_id, name, prefix, next_value) VALUES (?, ?, ?, 2)
     ON CONFLICT (org_id, name) DO UPDATE SET next_value = sequences.next_value + 1`,
    [orgId, name, fallbackPrefix],
  );
  return `${fallbackPrefix}-00001`;
}

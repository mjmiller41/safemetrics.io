/**
 * A minimal D1-compatible database backed by node:sqlite, for unit tests.
 *
 * D1 is SQLite, so running the real `schema.sql` and the real migration files
 * against an in-memory SQLite database exercises the actual SQL the worker issues —
 * including the CHECK constraints, the ON CONFLICT idempotency claim, and the
 * `billing_event_at` guard — without needing Miniflare or a network.
 *
 * Only the surface the worker actually uses is implemented:
 *   db.prepare(sql).bind(...args).first() / .run() / .all()
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

type Bindable = string | number | bigint | null | Uint8Array;

class FakePreparedStatement {
  private args: Bindable[] = [];
  private readonly db: DatabaseSync;
  private readonly sql: string;

  // Written out longhand rather than as constructor parameter properties, which
  // Node's type-stripping loader cannot handle.
  constructor(db: DatabaseSync, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  bind(...args: unknown[]): FakePreparedStatement {
    // D1 accepts booleans and undefined; node:sqlite does not. Normalise so tests
    // fail on real logic errors rather than on binding trivia.
    this.args = args.map((arg) => {
      if (arg === undefined) return null;
      if (typeof arg === 'boolean') return arg ? 1 : 0;
      return arg as Bindable;
    });
    return this;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.args);
    return (row ?? null) as T | null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: true }> {
    const results = this.db.prepare(this.sql).all(...this.args) as T[];
    return { results, success: true };
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const info = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(info.changes) } };
  }
}

export class FakeD1 {
  readonly sqlite: DatabaseSync;

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
  }

  prepare(sql: string): FakePreparedStatement {
    return new FakePreparedStatement(this.sqlite, sql);
  }

  /** Escape hatch for assertions inside tests. */
  query<T = Record<string, unknown>>(sql: string, ...args: Bindable[]): T[] {
    return this.sqlite.prepare(sql).all(...args) as T[];
  }

  one<T = Record<string, unknown>>(sql: string, ...args: Bindable[]): T | null {
    return (this.sqlite.prepare(sql).get(...args) ?? null) as T | null;
  }
}

/**
 * Builds a database with the production schema and every migration applied,
 * seeded with one tenant on the free tier and one user belonging to it.
 */
export function createTestDatabase(): FakeD1 {
  const sqlite = new DatabaseSync(':memory:');

  for (const file of [
    'schema.sql',
    'migrations/0002_stripe_billing.sql',
    'migrations/0003_fix_plan_check_constraint.sql',
    'migrations/0004_unique_domain_name.sql',
  ]) {
    sqlite.exec(readFileSync(join(repoRoot, file), 'utf8'));
  }

  sqlite.exec(`
    INSERT INTO tenants (id, name, slug, plan, monthly_event_limit)
    VALUES ('tenant_acme', 'Acme Inc', 'acme', 'hobby', 10000);

    INSERT INTO users (id, tenant_id, email, full_name, role)
    VALUES ('user_clerk_123', 'tenant_acme', 'Owner@Acme.test', 'Acme Owner', 'owner');
  `);

  return new FakeD1(sqlite);
}

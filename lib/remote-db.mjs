import { createClient } from '@libsql/client/web';
import fs from 'node:fs/promises';

export function wrapRemoteClient(client) {
  const prepare = (sql, args = []) => ({
    statement: { sql, args },
    bind: (...values) => prepare(sql, values),
    first: async () => (await client.execute({ sql, args })).rows[0] || null,
    all: async () => ({ results: (await client.execute({ sql, args })).rows }),
    run: async () => { const result = await client.execute({ sql, args }); return { success: true, meta: { changes: result.rowsAffected } }; },
  });
  return { prepare, batch: statements => client.batch(statements.map(s => s.statement), 'write') };
}

export async function migrateRemote(client) {
  const dir = new URL('../drizzle/', import.meta.url);
  const files = (await fs.readdir(dir)).filter(name => name.endsWith('.sql')).sort();
  // The write lock serializes cold starts before checking the migration ledger.
  const tx = await client.transaction('write');
  try {
    await tx.execute('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)');
    const applied = new Set((await tx.execute('SELECT name FROM _local_migrations')).rows.map(row => row.name));
    for (const name of files) {
      if (applied.has(name)) continue;
      const sql = await fs.readFile(new URL(name, dir), 'utf8');
      const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
      await tx.batch([...statements, { sql: 'INSERT INTO _local_migrations(name) VALUES(?)', args: [name] }]);
    }
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
  finally { tx.close(); }
}

export async function openRemoteDatabase(env) {
  const url = new URL(env.TURSO_DATABASE_URL);
  if (!['libsql:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid database URL');
  const client = createClient({ url: url.href, authToken: env.TURSO_AUTH_TOKEN, intMode: 'number' });
  try { await migrateRemote(client); return wrapRemoteClient(client); }
  catch (error) { client.close(); throw error; }
}

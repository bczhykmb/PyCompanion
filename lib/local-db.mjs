import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export function openLocalDatabase(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)');
  const dir = fileURLToPath(new URL('../drizzle/', import.meta.url));
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT name FROM _local_migrations WHERE name = ?').get(name)) continue;
    db.exec('BEGIN');
    try { db.exec(fs.readFileSync(path.join(dir, name), 'utf8')); db.prepare('INSERT INTO _local_migrations(name) VALUES(?)').run(name); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const wrap = (sql, args = []) => ({
    bind: (...values) => wrap(sql, values),
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ success: true, meta: db.prepare(sql).run(...args) }),
    execute: () => db.prepare(sql).run(...args),
  });
  return { prepare: sql => wrap(sql), batch: async statements => { db.exec('BEGIN'); try { const results = statements.map(s => s.execute()); db.exec('COMMIT'); return results; } catch (e) { db.exec('ROLLBACK'); throw e; } }, close: () => db.close() };
}

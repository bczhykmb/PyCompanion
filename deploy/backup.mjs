import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve(process.env.DATA_DIR || '/var/lib/pycompanion', 'classroom.sqlite');
await fs.access(source);
const backupDir = path.resolve(process.env.BACKUP_DIR || '/var/lib/pycompanion/backups');
await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
const filename = path.join(backupDir, `classroom-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
const db = new DatabaseSync(source);
try {
  db.exec('PRAGMA busy_timeout = 10000');
  // SQLite makes a consistent snapshot, including committed data in the WAL.
  db.prepare('VACUUM INTO ?').run(filename);
} finally { db.close(); }
await fs.chmod(filename, 0o600);
console.log(filename);

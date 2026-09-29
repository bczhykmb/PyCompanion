import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const students = sqliteTable('students', {
  id: text('id').primaryKey(), codeHash: text('code_hash').notNull().unique(),
  group: text('group_id').notNull(), config: text('config').notNull(), created: integer('created').notNull(),
});
export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(), student: text('student'),
  role: text('role').notNull(), expires: integer('expires').notNull(),
});
export const turns = sqliteTable('turns', {
  id: text('id').primaryKey(), student: text('student').notNull().references(() => students.id),
  requestId: text('request_id').notNull(), question: text('question').notNull(),
  code: text('code').notNull(), task: text('task').notNull(), answer: text('answer'),
  status: text('status').notNull(), error: text('error'), mode: text('mode').notNull(),
  created: integer('created').notNull(), completed: integer('completed'),
}, t => [uniqueIndex('turn_request').on(t.student, t.requestId), index('turn_student_time').on(t.student, t.created),
  uniqueIndex('turn_pending').on(t.student).where(sql`${t.status} = 'pending'`)]);
export const limits = sqliteTable('limits', {
  key: text('key').primaryKey(), count: integer('count').notNull(), expires: integer('expires').notNull(),
});

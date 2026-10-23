import { GROUPS, PROMPT_VERSION, makePrompt } from './experiment.mjs';

export async function groupPrompt(db, group) {
  if (!Object.hasOwn(GROUPS, group)) throw new Error('Invalid group');
  return await db.prepare('SELECT group_id,prompt,revision,updated FROM prompt_settings WHERE group_id=?').bind(group).first()
    || { group_id: group, prompt: makePrompt(group), revision: `default:${PROMPT_VERSION}:${group}`, updated: null };
}

export function publicTurn(turn) {
  if (!turn) return turn;
  const { prompt_snapshot, ...visible } = turn;
  return visible;
}

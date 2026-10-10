import { randomBytes } from 'node:crypto';
import { sql } from '../db.ts';
import { sha256 } from '../lib/ids.ts';
import { sessionPrincipal } from '../admin/auth.ts';

export async function readAuthorized(cookie: string | undefined, authorization: string | undefined): Promise<boolean> {
  if (await sessionPrincipal(cookie)) return true;
  const match = /^Bearer (ih_[A-Za-z0-9_-]{43})$/.exec(authorization ?? '');
  if (!match) return false;
  const [row] = await sql`SELECT 1 FROM read_tokens WHERE token_hash = ${sha256(match[1]!)} AND revoked_at IS NULL AND expires_at > now()`;
  return !!row;
}

export async function listReadTokens() {
  return sql`SELECT id::text, name, created_at, expires_at, revoked_at FROM read_tokens ORDER BY id DESC`;
}

export async function createReadToken(name: string, days: number, actor: string) {
  if (!name.trim() || name.length > 100 || !Number.isInteger(days) || days < 1 || days > 365) throw Object.assign(new Error('名称须为 1–100 字，期限须为 1–365 天'),{statusCode:400});
  const token = `ih_${randomBytes(32).toString('base64url')}`;
  const [row] = await sql<{id:string;expires_at:Date}[]>`INSERT INTO read_tokens (name, token_hash, expires_at, created_by)
    VALUES (${name.trim()}, ${sha256(token)}, ${new Date(Date.now() + days * 86400000)}, ${actor}) RETURNING id::text, expires_at`;
  return {...row,token};
}

export async function revokeReadToken(id: string) {
  if (!/^\d+$/.test(id)) throw Object.assign(new Error('Invalid token id'),{statusCode:400});
  await sql`UPDATE read_tokens SET revoked_at = coalesce(revoked_at, now()) WHERE id = ${id}`;
}

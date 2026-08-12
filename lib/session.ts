const SESSION_COOKIE = "focus_party_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function createOAuthState(database: D1Database) {
  const state = randomToken();
  await database.prepare(
    "INSERT INTO oauth_states (state_hash, expires_at) VALUES (?, ?)",
  ).bind(await hash(state), Date.now() + OAUTH_STATE_TTL_MS).run();
  return state;
}

export async function consumeOAuthState(database: D1Database, state: string) {
  const stateHash = await hash(state);
  const row = await database.prepare(
    "DELETE FROM oauth_states WHERE state_hash = ? AND expires_at >= ? RETURNING state_hash",
  ).bind(stateHash, Date.now()).first<{ state_hash: string }>();
  return Boolean(row);
}

export async function createSession(database: D1Database, channelId: string) {
  const token = randomToken();
  await database.prepare(
    `INSERT INTO auth_sessions (token_hash, channel_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(
    await hash(token),
    channelId,
    Date.now() + SESSION_TTL_SECONDS * 1000,
    new Date().toISOString(),
  ).run();
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export async function getSessionChannelId(database: D1Database, request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await database.prepare(
    `SELECT channel_id FROM auth_sessions
     WHERE token_hash = ? AND expires_at >= ?`,
  ).bind(await hash(token), Date.now()).first<{ channel_id: string }>();
  return row?.channel_id ?? null;
}

export async function deleteSession(database: D1Database, request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    await database.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await hash(token)).run();
  }
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

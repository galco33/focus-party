import { env } from "cloudflare:workers";

const TWITCH_AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_API_URL = "https://api.twitch.tv/helix";
const TWITCH_SCOPES = ["channel:bot", "user:bot", "user:read:chat", "user:write:chat"];

type TwitchTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string[];
  token_type: string;
};

type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
};

type StoredChannelAuth = {
  id: string;
  twitch_channel_id: string;
  twitch_access_token: string | null;
  twitch_refresh_token: string | null;
  eventsub_subscription_id: string | null;
};

type EventSubSubscription = {
  id: string;
  status: string;
  type: string;
  condition: { broadcaster_user_id?: string; user_id?: string };
  transport: { method: string; callback?: string };
};

function twitchConfig() {
  return {
    clientId: env.TWITCH_CLIENT_ID,
    clientSecret: env.TWITCH_CLIENT_SECRET,
    eventSubSecret: env.TWITCH_EVENTSUB_SECRET,
    encryptionKey: env.TWITCH_TOKEN_ENCRYPTION_KEY,
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function hexToBytes(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("La clé de chiffrement Twitch n’est pas configurée correctement.");
  }
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
}

async function encryptionKey() {
  return crypto.subtle.importKey(
    "raw",
    hexToBytes(twitchConfig().encryptionKey),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return `v1:${bytesToBase64(combined)}`;
}

async function decryptToken(value: string) {
  const [version, encoded] = value.split(":", 2);
  if (version !== "v1" || !encoded) throw new Error("Jeton Twitch illisible.");
  const combined = base64ToBytes(encoded);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    await encryptionKey(),
    combined.slice(12),
  );
  return new TextDecoder().decode(plaintext);
}

function callbackUrl(request: Request) {
  return new URL("/api/auth/twitch/callback", request.url).toString();
}

export function twitchAuthorizationUrl(request: Request, state: string) {
  const parameters = new URLSearchParams({
    response_type: "code",
    client_id: twitchConfig().clientId,
    redirect_uri: callbackUrl(request),
    scope: TWITCH_SCOPES.join(" "),
    state,
    force_verify: "true",
  });
  return `${TWITCH_AUTHORIZE_URL}?${parameters.toString()}`;
}

async function parseTwitchError(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { message?: string };
    return parsed.message ?? `Twitch a répondu ${response.status}.`;
  } catch {
    return `Twitch a répondu ${response.status}.`;
  }
}

export async function exchangeAuthorizationCode(request: Request, code: string) {
  const config = twitchConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: callbackUrl(request),
  });
  const response = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(await parseTwitchError(response));
  return response.json<TwitchTokenResponse>();
}

export async function getTwitchUser(accessToken: string) {
  const response = await fetch(`${TWITCH_API_URL}/users`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": twitchConfig().clientId,
    },
  });
  if (!response.ok) throw new Error(await parseTwitchError(response));
  const payload = await response.json<{ data: TwitchUser[] }>();
  const user = payload.data[0];
  if (!user) throw new Error("Impossible d’identifier ce compte Twitch.");
  return user;
}

export async function validateTwitchToken(accessToken: string, expectedUserId: string) {
  const response = await fetch("https://id.twitch.tv/oauth2/validate", {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (!response.ok) throw new Error("Le jeton Twitch n’est pas valide.");
  const validation = await response.json<{ client_id: string; user_id: string; scopes: string[] }>();
  if (validation.client_id !== twitchConfig().clientId || validation.user_id !== expectedUserId) {
    throw new Error("Le compte Twitch autorisé ne correspond pas à l’application.");
  }
  for (const scope of TWITCH_SCOPES) {
    if (!validation.scopes.includes(scope)) throw new Error(`Autorisation Twitch manquante : ${scope}`);
  }
}

export async function saveConnectedChannel(
  database: D1Database,
  user: TwitchUser,
  tokens: TwitchTokenResponse,
) {
  if (!tokens.refresh_token) throw new Error("Twitch n’a pas fourni de jeton de reconnexion.");
  const now = new Date().toISOString();
  const [accessToken, refreshToken] = await Promise.all([
    encryptToken(tokens.access_token),
    encryptToken(tokens.refresh_token),
  ]);
  await database.prepare(
    `INSERT INTO channels
     (id, twitch_channel_id, username, display_name, created_at, connected_at,
      twitch_access_token, twitch_refresh_token, token_expires_at, eventsub_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
     ON CONFLICT(twitch_channel_id) DO UPDATE SET
       username = excluded.username,
       display_name = excluded.display_name,
       connected_at = excluded.connected_at,
       twitch_access_token = excluded.twitch_access_token,
       twitch_refresh_token = excluded.twitch_refresh_token,
       token_expires_at = excluded.token_expires_at,
       eventsub_status = 'pending'`,
  ).bind(
    user.id,
    user.id,
    user.login,
    user.display_name,
    now,
    now,
    accessToken,
    refreshToken,
    Date.now() + tokens.expires_in * 1000,
  ).run();
  return user.id;
}

async function getAppAccessToken() {
  const config = twitchConfig();
  const response = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!response.ok) throw new Error(await parseTwitchError(response));
  return (await response.json<TwitchTokenResponse>()).access_token;
}

async function findExistingSubscription(appToken: string, broadcasterId: string) {
  let cursor: string | undefined;
  do {
    const parameters = new URLSearchParams({ user_id: broadcasterId });
    if (cursor) parameters.set("after", cursor);
    const response = await fetch(`${TWITCH_API_URL}/eventsub/subscriptions?${parameters}`, {
      headers: {
        Authorization: `Bearer ${appToken}`,
        "Client-Id": twitchConfig().clientId,
      },
    });
    if (!response.ok) return null;
    const payload = await response.json<{
      data: EventSubSubscription[];
      pagination?: { cursor?: string };
    }>();
    const existing = payload.data.find((subscription) => (
      subscription.type === "channel.chat.message"
      && subscription.condition.broadcaster_user_id === broadcasterId
      && subscription.condition.user_id === broadcasterId
    ));
    if (existing) return existing;
    cursor = payload.pagination?.cursor;
  } while (cursor);
  return null;
}

export async function createChatSubscription(database: D1Database, request: Request, broadcasterId: string) {
  const appToken = await getAppAccessToken();
  const existing = await findExistingSubscription(appToken, broadcasterId);
  if (existing) {
    await database.prepare(
      "UPDATE channels SET eventsub_status = ?, eventsub_subscription_id = ? WHERE id = ?",
    ).bind(existing.status, existing.id, broadcasterId).run();
    return existing;
  }

  const response = await fetch(`${TWITCH_API_URL}/eventsub/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appToken}`,
      "Client-Id": twitchConfig().clientId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "channel.chat.message",
      version: "1",
      condition: {
        broadcaster_user_id: broadcasterId,
        user_id: broadcasterId,
      },
      transport: {
        method: "webhook",
        callback: new URL("/api/twitch/eventsub", request.url).toString(),
        secret: twitchConfig().eventSubSecret,
      },
    }),
  });
  if (!response.ok) throw new Error(await parseTwitchError(response));
  const payload = await response.json<{ data: EventSubSubscription[] }>();
  const subscription = payload.data[0];
  if (!subscription) throw new Error("Twitch n’a pas créé l’écoute du chat.");
  await database.prepare(
    "UPDATE channels SET eventsub_status = ?, eventsub_subscription_id = ? WHERE id = ?",
  ).bind(subscription.status, subscription.id, broadcasterId).run();
  return subscription;
}

async function refreshUserAccessToken(database: D1Database, channel: StoredChannelAuth) {
  if (!channel.twitch_refresh_token) throw new Error("Reconnexion Twitch nécessaire.");
  const config = twitchConfig();
  const response = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: await decryptToken(channel.twitch_refresh_token),
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  if (!response.ok) throw new Error("Reconnexion Twitch nécessaire.");
  const tokens = await response.json<TwitchTokenResponse>();
  const [accessToken, refreshToken] = await Promise.all([
    encryptToken(tokens.access_token),
    encryptToken(tokens.refresh_token ?? await decryptToken(channel.twitch_refresh_token)),
  ]);
  await database.prepare(
    `UPDATE channels SET twitch_access_token = ?, twitch_refresh_token = ?, token_expires_at = ?
     WHERE id = ?`,
  ).bind(accessToken, refreshToken, Date.now() + tokens.expires_in * 1000, channel.id).run();
  return tokens.access_token;
}

async function storedChannel(database: D1Database, channelId: string) {
  const channel = await database.prepare(
    `SELECT id, twitch_channel_id, twitch_access_token, twitch_refresh_token, eventsub_subscription_id
     FROM channels WHERE id = ?`,
  ).bind(channelId).first<StoredChannelAuth>();
  if (!channel) throw new Error("Chaîne Twitch introuvable.");
  return channel;
}

async function postChatMessage(channel: StoredChannelAuth, accessToken: string, message: string) {
  return fetch(`${TWITCH_API_URL}/chat/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": twitchConfig().clientId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      broadcaster_id: channel.twitch_channel_id,
      sender_id: channel.twitch_channel_id,
      message: message.slice(0, 480),
    }),
  });
}

export async function sendChatReply(database: D1Database, channelId: string, message: string) {
  const channel = await storedChannel(database, channelId);
  if (!channel.twitch_access_token) return;
  let accessToken = await decryptToken(channel.twitch_access_token);
  let response = await postChatMessage(channel, accessToken, message);
  if (response.status === 401) {
    accessToken = await refreshUserAccessToken(database, channel);
    response = await postChatMessage(channel, accessToken, message);
  }
  if (!response.ok) {
    console.error(JSON.stringify({
      message: "twitch_chat_reply_failed",
      status: response.status,
      channelId,
    }));
  }
}

function hexSignature(value: string) {
  const hex = value.startsWith("sha256=") ? value.slice(7) : "";
  if (!/^[a-f0-9]{64}$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
}

export async function verifyEventSubRequest(request: Request, rawBody: string) {
  const messageId = request.headers.get("Twitch-Eventsub-Message-Id") ?? "";
  const timestamp = request.headers.get("Twitch-Eventsub-Message-Timestamp") ?? "";
  const signature = hexSignature(request.headers.get("Twitch-Eventsub-Message-Signature") ?? "");
  const sentAt = Date.parse(timestamp);
  if (!messageId || !signature || !Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > 10 * 60 * 1000) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(twitchConfig().eventSubSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(`${messageId}${timestamp}${rawBody}`),
  );
}

export async function disconnectTwitch(database: D1Database, channelId: string) {
  const channel = await storedChannel(database, channelId);
  if (channel.eventsub_subscription_id) {
    try {
      const appToken = await getAppAccessToken();
      await fetch(
        `${TWITCH_API_URL}/eventsub/subscriptions?id=${encodeURIComponent(channel.eventsub_subscription_id)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${appToken}`,
            "Client-Id": twitchConfig().clientId,
          },
        },
      );
    } catch (error) {
      console.error(JSON.stringify({ message: "eventsub_delete_failed", channelId, error: String(error) }));
    }
  }
  if (channel.twitch_access_token) {
    try {
      await fetch("https://id.twitch.tv/oauth2/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: twitchConfig().clientId,
          token: await decryptToken(channel.twitch_access_token),
        }),
      });
    } catch (error) {
      console.error(JSON.stringify({ message: "twitch_token_revoke_failed", channelId, error: String(error) }));
    }
  }
  await database.prepare(
    `UPDATE channels SET twitch_access_token = NULL, twitch_refresh_token = NULL,
     token_expires_at = NULL, eventsub_status = 'disconnected', eventsub_subscription_id = NULL
     WHERE id = ?`,
  ).bind(channelId).run();
}

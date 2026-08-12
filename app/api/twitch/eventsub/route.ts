import { env } from "cloudflare:workers";
import { broadcastRealtime } from "@/lib/realtime";
import { claimEvent, recordChatEvent, runCommand, type Actor, type Role } from "@/lib/focus-party";
import { sendChatReply, verifyEventSubRequest } from "@/lib/twitch";

type ChatEvent = {
  broadcaster_user_id: string;
  chatter_user_id: string;
  chatter_user_login: string;
  chatter_user_name: string;
  message_id: string;
  message: { text: string };
  badges?: Array<{ set_id: string; id: string }>;
};

type EventSubBody = {
  challenge?: string;
  subscription?: {
    id: string;
    status: string;
    condition?: { broadcaster_user_id?: string };
  };
  event?: ChatEvent;
};

function roleFor(event: ChatEvent): Role {
  if (event.chatter_user_id === event.broadcaster_user_id) return "streamer";
  if (event.badges?.some((badge) => badge.set_id === "moderator")) return "moderator";
  return "viewer";
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (length > 256_000) return new Response("Payload too large", { status: 413 });
  const rawBody = await request.text();
  if (!(await verifyEventSubRequest(request, rawBody))) {
    return new Response("Invalid signature", { status: 403 });
  }

  const body = JSON.parse(rawBody) as EventSubBody;
  const messageType = request.headers.get("Twitch-Eventsub-Message-Type") ?? "";
  const broadcasterId = body.subscription?.condition?.broadcaster_user_id;

  if (messageType === "webhook_callback_verification" && body.challenge && broadcasterId) {
    await env.DB.prepare(
      `UPDATE channels SET eventsub_status = 'enabled', eventsub_subscription_id = ?
       WHERE twitch_channel_id = ?`,
    ).bind(body.subscription?.id ?? null, broadcasterId).run();
    return new Response(body.challenge, { headers: { "Content-Type": "text/plain" } });
  }

  if (messageType === "revocation" && broadcasterId) {
    await env.DB.prepare(
      "UPDATE channels SET eventsub_status = 'revoked' WHERE twitch_channel_id = ?",
    ).bind(broadcasterId).run();
    return new Response(null, { status: 204 });
  }

  const event = body.event;
  if (messageType !== "notification" || !event?.message?.text.trim().startsWith("!")) {
    return new Response(null, { status: 204 });
  }

  const eventId = request.headers.get("Twitch-Eventsub-Message-Id") ?? event.message_id;
  if (!(await claimEvent(env.DB, eventId))) return new Response(null, { status: 204 });

  const channel = await env.DB.prepare(
    "SELECT id FROM channels WHERE twitch_channel_id = ?",
  ).bind(event.broadcaster_user_id).first<{ id: string }>();
  if (!channel) return new Response(null, { status: 204 });

  const actor: Actor = {
    id: event.chatter_user_id,
    username: event.chatter_user_login || event.chatter_user_name,
    role: roleFor(event),
  };
  let reply: string;
  try {
    reply = await runCommand(env.DB, channel.id, actor, event.message.text);
  } catch (error) {
    reply = error instanceof Error ? error.message : "Commande refusée.";
  }

  await recordChatEvent(env.DB, {
    twitchMessageId: event.message_id,
    channelId: channel.id,
    actor,
    message: event.message.text,
    reply,
  });
  await broadcastRealtime(channel.id);
  await sendChatReply(env.DB, channel.id, `@${actor.username} ${reply}`);
  return new Response(null, { status: 204 });
}

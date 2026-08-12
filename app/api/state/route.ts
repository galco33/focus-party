import { env } from "cloudflare:workers";
import {
  configureTimer,
  disconnectedState,
  getState,
  timerAction,
} from "@/lib/focus-party";
import { broadcastRealtime } from "@/lib/realtime";
import { getSessionChannelId, sameOrigin } from "@/lib/session";

async function readChannel(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("channel");
  if (requested && /^[a-zA-Z0-9_-]{1,64}$/.test(requested)) return requested;
  const sessionChannel = await getSessionChannelId(env.DB, request);
  if (sessionChannel) return sessionChannel;
  return null;
}

export async function GET(request: Request) {
  try {
    const channelId = await readChannel(request);
    return Response.json(
      channelId ? await getState(env.DB, channelId) : disconnectedState(),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(JSON.stringify({ message: "state_read_failed", error: String(error) }));
    return Response.json({ error: "Impossible de charger Focus Party." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
    const channelId = await getSessionChannelId(env.DB, request);
    if (!channelId) return Response.json({ error: "Connectez d’abord votre chaîne Twitch." }, { status: 401 });

    const payload = await request.json<Record<string, unknown>>();
    const action = String(payload.action ?? "");
    let reply = "Mise à jour enregistrée.";
    if (["start", "pause", "resume", "stop"].includes(action)) {
      await timerAction(env.DB, channelId, action);
    } else if (action === "configure") {
      await configureTimer(env.DB, channelId, payload);
      reply = "Configuration enregistrée.";
    } else {
      throw new Error("Action inconnue.");
    }
    await broadcastRealtime(channelId);
    return Response.json({ reply, state: await getState(env.DB, channelId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return Response.json({ error: message }, { status: message.includes("cooldown") ? 429 : 400 });
  }
}

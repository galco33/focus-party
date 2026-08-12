import { env } from "cloudflare:workers";
import { deleteSession, getSessionChannelId, sameOrigin } from "@/lib/session";
import { disconnectTwitch } from "@/lib/twitch";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
  const channelId = await getSessionChannelId(env.DB, request);
  const expiredCookie = await deleteSession(env.DB, request);
  if (channelId) await disconnectTwitch(env.DB, channelId);
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": expiredCookie, "Cache-Control": "no-store" } },
  );
}

import { env } from "cloudflare:workers";

export async function broadcastRealtime(channelId: string) {
  if (!channelId) return;
  const room = env.REALTIME.getByName(channelId);
  await room.broadcast("refresh");
}

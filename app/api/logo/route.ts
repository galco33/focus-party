import { env } from "cloudflare:workers";
import { getBrandingRow } from "@/lib/branding";

export async function GET(request: Request) {
  const channelId = new URL(request.url).searchParams.get("channel") ?? "";
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(channelId)) return new Response("Not found", { status: 404 });

  const branding = await getBrandingRow(env.DB, channelId);
  if (!branding) return new Response("Not found", { status: 404 });

  return new Response(branding.logo_data, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

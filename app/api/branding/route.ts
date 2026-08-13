import { env } from "cloudflare:workers";
import {
  defaultBranding,
  getBrandingRow,
  isLogoPosition,
  saveBranding,
} from "@/lib/branding";
import { broadcastRealtime } from "@/lib/realtime";
import { getSessionChannelId, sameOrigin } from "@/lib/session";

const MAX_LOGO_BYTES = 512 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function parseSize(value: FormDataEntryValue | null) {
  const size = Number(value ?? defaultBranding.size);
  return Math.max(40, Math.min(180, Number.isFinite(size) ? Math.round(size) : defaultBranding.size));
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
    const channelId = await getSessionChannelId(env.DB, request);
    if (!channelId) return Response.json({ error: "Connectez d’abord votre chaîne Twitch." }, { status: 401 });

    const form = await request.formData();
    const requestedPosition = String(form.get("position") ?? defaultBranding.position);
    const position = isLogoPosition(requestedPosition) ? requestedPosition : defaultBranding.position;
    const size = parseSize(form.get("size"));
    const file = form.get("logo");
    const current = await getBrandingRow(env.DB, channelId);

    let data = current?.logo_data;
    let filename = current?.logo_filename ?? "logo.png";

    if (file instanceof File && file.size > 0) {
      if (file.type !== "image/png") throw new Error("Choisissez une image au format PNG.");
      if (file.size > MAX_LOGO_BYTES) throw new Error("Le PNG ne doit pas dépasser 500 Ko.");
      data = await file.arrayBuffer();
      const bytes = new Uint8Array(data);
      if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
        throw new Error("Ce fichier ne semble pas être un PNG valide.");
      }
      filename = file.name.slice(0, 120) || "logo.png";
    } else if (!current) {
      throw new Error("Choisissez d’abord un petit logo PNG.");
    }

    if (!data) throw new Error("Choisissez d’abord un petit logo PNG.");
    const branding = await saveBranding(env.DB, channelId, { data, filename, position, size });
    await broadcastRealtime(channelId);
    return Response.json({ branding });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible d’enregistrer le logo.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: "Origine refusée." }, { status: 403 });
    const channelId = await getSessionChannelId(env.DB, request);
    if (!channelId) return Response.json({ error: "Connectez d’abord votre chaîne Twitch." }, { status: 401 });
    await env.DB.prepare("DELETE FROM overlay_branding WHERE channel_id = ?").bind(channelId).run();
    await broadcastRealtime(channelId);
    return Response.json({ branding: defaultBranding });
  } catch (error) {
    console.error(JSON.stringify({ message: "branding_delete_failed", error: String(error) }));
    return Response.json({ error: "Impossible de retirer le logo." }, { status: 500 });
  }
}

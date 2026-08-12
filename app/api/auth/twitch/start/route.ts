import { env } from "cloudflare:workers";
import { createOAuthState } from "@/lib/session";
import { twitchAuthorizationUrl } from "@/lib/twitch";

export async function GET(request: Request) {
  const state = await createOAuthState(env.DB);
  return Response.redirect(twitchAuthorizationUrl(request, state), 302);
}

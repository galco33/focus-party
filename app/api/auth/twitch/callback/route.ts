import { env } from "cloudflare:workers";
import { ensureChannelTimer } from "@/lib/focus-party";
import { consumeOAuthState, createSession } from "@/lib/session";
import {
  createChatSubscription,
  exchangeAuthorizationCode,
  getTwitchUser,
  saveConnectedChannel,
  validateTwitchToken,
} from "@/lib/twitch";

function redirectHome(request: Request, status: "connected" | "error" | "warning") {
  const url = new URL("/", request.url);
  url.searchParams.set("twitch", status);
  return url.toString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !(await consumeOAuthState(env.DB, state))) {
    return Response.redirect(redirectHome(request, "error"), 302);
  }

  try {
    const tokens = await exchangeAuthorizationCode(request, code);
    const user = await getTwitchUser(tokens.access_token);
    await validateTwitchToken(tokens.access_token, user.id);
    const channelId = await saveConnectedChannel(env.DB, user, tokens);
    await ensureChannelTimer(env.DB, channelId);

    let result: "connected" | "warning" = "connected";
    try {
      await createChatSubscription(env.DB, request, channelId);
    } catch (error) {
      result = "warning";
      console.error(JSON.stringify({ message: "eventsub_subscription_failed", channelId, error: String(error) }));
      await env.DB.prepare(
        "UPDATE channels SET eventsub_status = 'error' WHERE id = ?",
      ).bind(channelId).run();
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectHome(request, result),
        "Set-Cookie": await createSession(env.DB, channelId),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(JSON.stringify({ message: "twitch_oauth_failed", error: String(error) }));
    return Response.redirect(redirectHome(request, "error"), 302);
  }
}

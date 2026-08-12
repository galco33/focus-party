/** Cloudflare Worker entry point for Focus Party. */
import { DurableObject } from "cloudflare:workers";
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

export class RealtimeRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async broadcast(message: string): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        socket.close(1011, "Unable to deliver update");
      }
    }
  }

  async webSocketMessage(_socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message === "string" && message === "refresh") await this.broadcast("refresh");
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/realtime" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const origin = request.headers.get("Origin");
      if (origin && new URL(origin).host !== url.host) {
        return new Response("Origin not allowed", { status: 403 });
      }
      const channelId = url.searchParams.get("channel") ?? "public";
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(channelId)) {
        return new Response("Invalid channel", { status: 400 });
      }
      return env.REALTIME.getByName(channelId).fetch(request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker satisfies ExportedHandler<Env>;

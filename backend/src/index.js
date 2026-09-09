import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

export class SherlockBackend extends Container {
  defaultPort = 5000;
  sleepAfter = "30m";

  envVars = {
    FLASK_DEBUG: "false",
    PORT: "5000",
    SECRET_KEY: env.SECRET_KEY,
    JWT_SECRET_KEY: env.JWT_SECRET_KEY,
    JWT_ACCESS_TOKEN_EXPIRES_MINUTES: env.JWT_ACCESS_TOKEN_EXPIRES_MINUTES || "60",
    DATABASE_URL: env.DATABASE_URL || "sqlite:///sherlock.db",
    FRONTEND_ORIGIN: env.FRONTEND_ORIGIN || "*",
  };
}

export default {
  async fetch(request, workerEnv) {
    const url = new URL(request.url);

    // Keep a simple Worker-level response for accidental non-API requests.
    // The frontend is deployed separately on Cloudflare Pages.
    if (!url.pathname.startsWith("/api/")) {
      return new Response("Sherlock Protocol API is running. Use /api/health.", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const container = getContainer(workerEnv.BACKEND_CONTAINER, "sherlock-backend");
    return container.fetch(request);
  },
};

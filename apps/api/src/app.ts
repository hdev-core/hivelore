import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoute } from "./routes/health.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  await app.register(cors, {
    origin: env.NODE_ENV === "production" ? env.CORS_ORIGIN : [env.CORS_ORIGIN],
  });

  await registerHealthRoute(app);
  await registerAuthRoutes(app);

  return app;
}

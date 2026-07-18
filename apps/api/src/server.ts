import { env } from "./config/env.js";
import { buildApp } from "./app.js";

const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down API server");

  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ error }, "API server shutdown failed");
    process.exit(1);
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({
    host: env.HOST,
    port: env.PORT,
  });
} catch (error) {
  app.log.error({ error }, "API server failed to start");
  process.exit(1);
}

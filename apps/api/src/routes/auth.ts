import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const challengeSchema = z.object({
  hiveUsername: z.string().min(1).max(32),
});

const verifySchema = z.object({
  hiveUsername: z.string().min(1).max(32),
  message: z.string().min(1),
  signature: z.string().min(1),
});

const challenges = new Map<
  string,
  {
    message: string;
    expiresAt: number;
  }
>();

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/auth/challenge", async (request, reply) => {
    const parsed = challengeSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid Hive username.",
      });
    }

    const normalizedHiveUsername = parsed.data.hiveUsername
      .trim()
      .toLowerCase();

    const nonce = randomUUID();
    const issuedAt = new Date().toISOString();
    const message = [
      "Sign in to HiveLore",
      `Hive username: ${normalizedHiveUsername}`,
      `Nonce: ${nonce}`,
      `Issued at: ${issuedAt}`,
    ].join("\n");

    challenges.set(normalizedHiveUsername, {
      message,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return {
      hiveUsername: normalizedHiveUsername,
      message,
      expiresInSeconds: 300,
    };
  });

  app.post("/auth/verify", async (request, reply) => {
    const parsed = verifySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid verification payload.",
      });
    }

    const normalizedHiveUsername = parsed.data.hiveUsername
      .trim()
      .toLowerCase();

    const challenge = challenges.get(normalizedHiveUsername);

    if (!challenge) {
      return reply.code(400).send({
        error: "No active challenge found.",
      });
    }

    if (challenge.expiresAt < Date.now()) {
      challenges.delete(normalizedHiveUsername);

      return reply.code(400).send({
        error: "Challenge expired.",
      });
    }

    if (challenge.message !== parsed.data.message) {
      return reply.code(400).send({
        error: "Challenge message does not match.",
      });
    }

    return reply.code(501).send({
      error: "Hive signature verification is not implemented yet.",
    });
  });

  app.get("/me", async () => {
    return {
      user: null,
    };
  });
}
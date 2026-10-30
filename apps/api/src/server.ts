import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { AppError } from "./lib/errors.js";
import { setupAuth } from "./plugins/auth.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { businessRoutes } from "./modules/businesses/business.routes.js";
import { riderRoutes } from "./modules/riders/rider.routes.js";
import { adminAuthRoutes } from "./modules/admin/admin-auth.routes.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  setupAuth(app);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request",
          details: err.issues,
        },
      });
    }
    if (err instanceof AppError) {
      return reply
        .code(err.statusCode)
        .send({ error: { code: err.code, message: err.message } });
    }
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      err.code === "FST_REQ_FILE_TOO_LARGE"
    ) {
      return reply.code(413).send({
        error: {
          code: "FILE_TOO_LARGE",
          message: "File must be 5 MB or smaller",
        },
      });
    }
    req.log.error(err);
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
  });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(authRoutes, { prefix: "/v1" });
  await app.register(businessRoutes, { prefix: "/v1" });
  await app.register(riderRoutes, { prefix: "/v1" });
  await app.register(adminAuthRoutes, { prefix: "/v1" });
  await app.register(adminRoutes, { prefix: "/v1" });

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

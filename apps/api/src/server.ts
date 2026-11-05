import "./lib/bigint.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { Redis } from "ioredis";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { clientKey } from "./lib/rate-limit.js";
import { AppError } from "./lib/errors.js";
import { setupAuth } from "./plugins/auth.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { businessRoutes } from "./modules/businesses/business.routes.js";
import { riderRoutes } from "./modules/riders/rider.routes.js";
import { riderJobRoutes } from "./modules/riders/rider-jobs.routes.js";
import { adminAuthRoutes } from "./modules/admin/admin-auth.routes.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";
import {
  deliveryRoutes,
  trackingRoutes,
} from "./modules/deliveries/delivery.routes.js";
import { adminDeliveryRoutes } from "./modules/deliveries/admin-deliveries.routes.js";
import { adminPricingRoutes } from "./modules/pricing/pricing.admin.routes.js";
import { startDispatchWorker } from "./modules/dispatch/dispatch.service.js";
import { dispatchAdminRoutes } from "./modules/dispatch/dispatch.admin.routes.js";
import {
  businessWalletRoutes,
  paystackWebhookRoutes,
  riderWalletRoutes,
} from "./modules/finance/finance.routes.js";
import { financeAdminRoutes } from "./modules/finance/finance.admin.routes.js";
import { adminOpsRoutes } from "./modules/admin/admin-ops.routes.js";
import { adminSelfRoutes, staffRoutes } from "./modules/admin/staff.routes.js";

async function main() {
  const app = Fastify({ logger: true, trustProxy: config.TRUST_PROXY });

  // Browsers may only call the API from the addresses listed in CORS_ORIGINS. In development, any address is allowed.
  await app.register(cors, {
    origin:
      config.CORS_ORIGINS.length > 0
        ? config.CORS_ORIGINS
        : config.NODE_ENV !== "production",
  });
  await app.register(helmet);

  // A separate Redis connection for rate limiting, set up so a Redis problem never blocks requests
  const limiterRedis = new Redis(config.REDIS_URL, {
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
  });
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: "1 minute",
    redis: limiterRedis,
    skipOnError: true,
    keyGenerator: (req) => clientKey(req.headers.authorization, req.ip),
  });
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
    const error = err as {
      code?: string;
      statusCode?: number;
      message?: string;
    };
    if (error.code === "P2002") {
      return reply.code(409).send({
        error: {
          code: "ALREADY_EXISTS",
          message: "A record with these details already exists",
        },
      });
    }
    if (error.code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.code(413).send({
        error: {
          code: "FILE_TOO_LARGE",
          message: "File must be 5 MB or smaller",
        },
      });
    }
    if (error.statusCode === 429) {
      return reply.code(429).send({
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests. Please slow down and try again shortly.",
        },
      });
    }
    // Mistakes by the caller that Fastify itself detects (bad JSON, wrong content type) are 4xx, not server errors
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        error: { code: error.code ?? "BAD_REQUEST", message: error.message },
      });
    }
    req.log.error(err);
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
  });

  // The dispatch worker is started after the server is listening; this hook stops it on shutdown
  let stopWorker = () => {};
  app.addHook("onClose", async () => {
    stopWorker();
    await prisma.$disconnect();
    redis.disconnect();
    limiterRedis.disconnect();
  });

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(authRoutes, { prefix: "/v1" });
  await app.register(businessRoutes, { prefix: "/v1" });
  await app.register(riderRoutes, { prefix: "/v1" });
  await app.register(riderJobRoutes, { prefix: "/v1" });
  await app.register(adminAuthRoutes, { prefix: "/v1" });
  await app.register(adminRoutes, { prefix: "/v1" });
  await app.register(adminPricingRoutes, { prefix: "/v1" });
  await app.register(adminDeliveryRoutes, { prefix: "/v1" });
  await app.register(deliveryRoutes, { prefix: "/v1" });
  await app.register(trackingRoutes, { prefix: "/v1" });
  await app.register(dispatchAdminRoutes, { prefix: "/v1" });
  await app.register(businessWalletRoutes, { prefix: "/v1" });
  await app.register(riderWalletRoutes, { prefix: "/v1" });
  await app.register(financeAdminRoutes, { prefix: "/v1" });
  await app.register(adminOpsRoutes, { prefix: "/v1" });
  await app.register(staffRoutes, { prefix: "/v1" });
  await app.register(adminSelfRoutes, { prefix: "/v1" });
  await app.register(paystackWebhookRoutes, { prefix: "/v1" });

  // Admins created before roles existed become super admins once. New admins always get an explicit role.
  const upgraded = await prisma.user.updateMany({
    where: { role: "ADMIN", adminRole: null },
    data: { adminRole: "SUPER_ADMIN" },
  });
  if (upgraded.count > 0)
    app.log.warn(
      `${upgraded.count} existing admin account(s) were made SUPER_ADMIN`,
    );

  await app.listen({ port: config.PORT, host: "0.0.0.0" });

  if (config.DISPATCH_WORKER_ENABLED) {
    stopWorker = startDispatchWorker(app.log);
    app.log.info("Dispatch worker started (checks every 5 seconds)");
  } else {
    app.log.warn(
      "Dispatch worker is DISABLED: deliveries will not be offered to riders",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

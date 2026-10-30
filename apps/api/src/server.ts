import "./lib/bigint.js";
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

  // The dispatch worker is started after the server is listening; this hook stops it on shutdown
  let stopWorker = () => {};
  app.addHook("onClose", async () => {
    stopWorker();
    await prisma.$disconnect();
    redis.disconnect();
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
  await app.register(paystackWebhookRoutes, { prefix: "/v1" });

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

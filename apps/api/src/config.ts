import { z } from 'zod'

// An empty value in .env (for example "PAYSTACK_SECRET_KEY=") counts as "not set"
const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined))

const flag = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true')

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    OTP_SECRET: z.string().min(32, 'OTP_SECRET must be at least 32 characters'),
    UPLOAD_DIR: z.string().default('./uploads'),
    // Share of each delivery price kept by the platform. Moves into a database table later.
    COMMISSION_PERCENT: z.coerce.number().min(0).max(100).default(20),
    // Straight-line distance is multiplied by this to estimate road distance.
    // Replace with a real routing API (Google, Mapbox) when you are ready.
    ROAD_DISTANCE_FACTOR: z.coerce.number().min(1).max(3).default(1.3),

    // Dispatch
    OFFER_SECONDS: z.coerce.number().int().min(10).max(120).default(30),
    DISPATCH_RADIUS_KM: z.coerce.number().min(1).max(100).default(8),
    DISPATCH_TIMEOUT_MINUTES: z.coerce.number().min(1).max(240).default(15),
    // A rider whose location is older than this is treated as offline
    LOCATION_STALE_SECONDS: z.coerce.number().int().min(30).max(900).default(120),
    DISPATCH_WORKER_ENABLED: flag('true'),

    // Payments. Without a Paystack key, development uses a built-in fake gateway.
    PAYSTACK_SECRET_KEY: optionalText,
    PAYSTACK_CALLBACK_URL: optionalText,

    // Security
    // Comma-separated web addresses allowed to call the API from a browser,
    // for example https://app.example.com,https://admin.example.com
    CORS_ORIGINS: optionalText.transform((v) => (v ? v.split(',').map((o) => o.trim()).filter(Boolean) : [])),
    // Turn on when the API runs behind a proxy or load balancer, so each caller's real IP is used
    TRUST_PROXY: flag('false'),
    // The admin who approves a withdrawal cannot be the one who records it as paid.
    // Default: on in production, off in development (so one person can test alone).
    PAYOUT_TWO_PERSON_RULE: z.enum(['true', 'false']).optional(),
  })
  .refine((c) => c.NODE_ENV !== 'production' || Boolean(c.PAYSTACK_SECRET_KEY), {
    message: 'PAYSTACK_SECRET_KEY is required in production',
    path: ['PAYSTACK_SECRET_KEY'],
  })

const parsed = schema.parse(process.env)

export const config = {
  ...parsed,
  PAYOUT_TWO_PERSON_RULE:
    parsed.PAYOUT_TWO_PERSON_RULE !== undefined ? parsed.PAYOUT_TWO_PERSON_RULE === 'true' : parsed.NODE_ENV === 'production',
}

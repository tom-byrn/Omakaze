import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z
    .string()
    .default("http://localhost:3000")
    .transform((v) => v.replace(/\/+$/, "")),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),

  // GitHub
  GITHUB_URL: z
    .string()
    .default("https://github.com")
    .transform((v) => v.replace(/\/+$/, "")),
  GITHUB_API_URL: z
    .string()
    .default("https://api.github.com")
    .transform((v) => v.replace(/\/+$/, "")),
  GITHUB_APP_ID: optionalString,
  GITHUB_APP_SLUG: optionalString,
  GITHUB_APP_PRIVATE_KEY: optionalString,
  GITHUB_APP_WEBHOOK_SECRET: optionalString,
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  /** Secret for repository webhooks created for token connections. Defaults to a value derived from APP_SECRET. */
  GITHUB_WEBHOOK_SECRET: optionalString,

  // Auth
  AUTH_EMAIL_ENABLED: bool(true),
  AUTH_GITHUB_TOKEN_ENABLED: bool(false),
  AUTH_SIGNUP_ENABLED: bool(true),
  AUTH_ALLOWED_EMAIL_DOMAINS: optionalString,

  // Email
  SMTP_URL: optionalString,
  SMTP_FROM: z.string().default("Guided PRs <no-reply@localhost>"),

  // Storage
  STORAGE_DRIVER: z.enum(["database", "filesystem"]).default("database"),
  STORAGE_DIR: z.string().default("./data/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().default(50),

  // AI defaults (workspaces can override)
  AI_PROVIDER: z.enum(["openrouter", "anthropic", "openai", "openai-compatible"]).optional(),
  AI_MODEL: optionalString,
  AI_API_KEY: optionalString,
  AI_BASE_URL: optionalString,

  /**
   * How many reverse proxies in front of the app append to X-Forwarded-For. The client address used
   * for rate limits is the entry this many places from the right; 1 also fits a direct deployment,
   * where Next.js fills in the connection's address.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(1).max(10).default(1),

  // Worker
  WORKER_ENABLED: bool(true),
  /** 0 turns polling off; anything else is at least 30 seconds (the scheduler's tick). */
  POLL_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .default(300)
    .transform((v) => (v === 0 ? 0 : Math.max(30, v))),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isSecureUrl(): boolean {
  return env().APP_URL.startsWith("https://");
}

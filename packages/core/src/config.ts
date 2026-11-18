import { z } from 'zod';

/**
 * Single source of truth for runtime configuration.
 * Every provider choice is a plain env var, so swapping a vendor is a config change.
 */
const bool = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  API_TOKEN: z.string().min(8).default('dev-token-change-me'),
  INTAKE_SHARED_SECRET: z.string().min(8).default('dev-intake-secret'),
  DEFAULT_ORG_ID: z.string().uuid().default('00000000-0000-0000-0000-000000000001'),

  DATABASE_URL: z.string().default('postgres://realcognix:realcognix@localhost:5432/realcognix'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // LLM — OpenAI-compatible endpoint (LiteLLM proxy by default; can point straight at Ollama/Groq/Gemini-compat)
  LLM_PROVIDER: z.enum(['openai_compatible', 'none']).default('openai_compatible'),
  LLM_BASE_URL: z.string().default('http://localhost:4001/v1'),
  LLM_API_KEY: z.string().default('sk-litellm-dev'),
  LLM_MODEL: z.string().default('default'), // LiteLLM alias: default (ollama) | groq | gemini
  LLM_EMBED_MODEL: z.string().default('embed'),
  LLM_SCORING_ENABLED: bool,

  // WhatsApp
  WHATSAPP_PROVIDER: z.enum(['whatsapp_cloud', 'console']).default('console'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().default('dev-verify-token'),
  WHATSAPP_GRAPH_VERSION: z.string().default('v21.0'),
  WHATSAPP_TEMPLATE_LANG: z.string().default('en'),

  // Email
  EMAIL_PROVIDER: z.enum(['smtp', 'console']).default('smtp'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('RealCognix <no-reply@realcognix.test>'),

  // Lead sources
  META_APP_SECRET: z.string().optional(),
  META_VERIFY_TOKEN: z.string().default('dev-verify-token'),
  META_PAGE_ACCESS_TOKEN: z.string().optional(),
  META_GRAPH_VERSION: z.string().default('v21.0'),

  // Ads
  ADS_META_ENABLED: bool,
  META_ADS_ACCESS_TOKEN: z.string().optional(),
  META_AD_ACCOUNT_ID: z.string().optional(), // without act_ prefix
  ADS_GOOGLE_ENABLED: bool,
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
  GOOGLE_ADS_CUSTOMER_ID: z.string().optional(),
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().optional(),
  GOOGLE_ADS_OAUTH_ACCESS_TOKEN: z.string().optional(),

  // Storage
  STORAGE_PROVIDER: z.enum(['local']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),

  // Sales engine rules
  SLA_MINUTES: z.coerce.number().default(5),
  SLA_MAX_REASSIGNS: z.coerce.number().default(2),
  QUIET_HOURS_START: z.coerce.number().min(0).max(23).default(21), // IST
  QUIET_HOURS_END: z.coerce.number().min(0).max(23).default(9), // IST
  CADENCE_DAYS: z.string().default('0,1,3,7,14,30'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return parsed.data;
}

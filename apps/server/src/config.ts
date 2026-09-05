import { z } from 'zod';

/**
 * Loads a .env file into `process.env` via Node's built-in `loadEnvFile`
 * (no dotenv dependency). Existing environment variables are left alone —
 * `loadEnvFile` never overwrites a variable that's already set, so shell
 * exports win over the file. Missing file is not an error; anything else is.
 */
export function loadDotEnv(filePath: string): void {
  try {
    process.loadEnvFile(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      throw err;
    }
  }
}

const envSchema = z.object({
  SOTTO_STT_URL: z.string().url().default('http://127.0.0.1:9001/v1'),
  SOTTO_STT_MODEL: z.string().default('Systran/faster-whisper-base'),
  SOTTO_LLM_URL: z.string().url().default('http://127.0.0.1:8080/v1'),
  SOTTO_LLM_MODEL: z.string().default('qwen3.6-35b-a3b'),
  SOTTO_TTS_URL: z.string().url().default('http://127.0.0.1:8880/v1'),
  SOTTO_TTS_MODEL: z.string().default('kokoro'),
  SOTTO_API_KEY: z.string().optional(),
  SOTTO_PORT: z.coerce.number().int().positive().default(8790),
  // Localhost by default — this server has no auth (see docs/voice-pipeline.md
  // "Security"). Set SOTTO_HOST=0.0.0.0 to bind all interfaces for phone-on-LAN
  // testing, on a trusted network only.
  SOTTO_HOST: z.string().default('127.0.0.1'),
  // Comma-separated CORS allowlist for browser origins. Defaults cover the
  // Expo web dev server; any http://localhost:* / http://127.0.0.1:* origin
  // is also allowed regardless of this value (see src/security.ts).
  SOTTO_CORS_ORIGINS: z.string().optional(),
  // Caps concurrent voice sessions (pending + connected) across all clients.
  SOTTO_MAX_SESSIONS: z.coerce.number().int().positive().default(4),
  // Wall-clock ceiling for one import job (adversarial review 3, finding
  // 9) — a hung/adversarially slow import is aborted and failed once it
  // passes this, instead of leaving the importer permanently busy.
  IMPORT_JOB_MAX_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(45 * 60_000),
  // Absolute path to a static web build (apps/client's `dist/`, from
  // `pnpm web:export`) to serve at `/` with an SPA fallback to
  // `index.html`. Unset by default — this server has no static assets to
  // serve until you opt in. See docs/self-hosting.md.
  SOTTO_STATIC_DIR: z.string().optional(),
  // Optional `user:pass` shared credential, enforced via HTTP Basic auth on
  // every route except `/health`. This is a privacy fence for a personal,
  // single-user instance reached over a LAN or the open internet — not
  // multi-user auth (see docs/voice-pipeline.md "Security" and
  // docs/self-hosting.md). Unset by default (no auth, matching the rest of
  // this server's no-accounts design).
  SOTTO_BASIC_AUTH: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    console.error('Invalid server environment:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid server environment configuration');
  }
  return parsed.data;
}

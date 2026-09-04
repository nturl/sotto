import { z } from 'zod';

const envSchema = z.object({
  SOTTO_STT_URL: z.string().url().default('http://127.0.0.1:9001/v1'),
  SOTTO_STT_MODEL: z.string().default('Systran/faster-whisper-base'),
  SOTTO_LLM_URL: z.string().url().default('http://127.0.0.1:8080/v1'),
  SOTTO_LLM_MODEL: z.string().default('qwen3.6-35b-a3b'),
  SOTTO_TTS_URL: z.string().url().default('http://127.0.0.1:8880/v1'),
  SOTTO_TTS_MODEL: z.string().default('kokoro'),
  SOTTO_API_KEY: z.string().optional(),
  SOTTO_PORT: z.coerce.number().int().positive().default(8790),
  SOTTO_HOST: z.string().default('0.0.0.0'),
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

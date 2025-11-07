// src/utils/config.ts
import 'dotenv/config';

const toNumber = (v: string | undefined, d: number) =>
  v && !Number.isNaN(Number(v)) ? Number(v) : d;

export const config = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',

  DASHBOARD_PORT: toNumber(process.env.DASHBOARD_PORT, 5173),
  ASSETS_PATH: process.env.ASSETS_PATH ?? 'assets',
  EPSILON_EXPLORATION_RATE: toNumber(process.env.EPSILON_EXPLORATION_RATE, 0.3),
} as const;

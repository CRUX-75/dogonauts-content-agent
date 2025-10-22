# Dogonauts Content Agent

Multi-agent system for automated social media content generation using n8n, Claude API, and Supabase.

## Architecture

- **Agent 1:** Campaign Strategist - Determines content type based on schedule
- **Agent 2:** Copywriting - Generates German copy using Claude Sonnet 4

## Stack

- n8n (Docker)
- Supabase (PostgreSQL)
- Claude API (Anthropic)
- Docker Compose

## Setup

1. Install Docker Desktop
2. Copy `.env.example` to `.env` and add API keys
3. Run `docker-compose up -d`
4. Import workflow JSON to n8n
5. Configure Supabase credentials

## Status

- ✅ Phase 1: Agent 1 + 2 (Complete)
- ⏳ Phase 2: Visual Generation
- ⏳ Phase 3: QA & Approval
- ⏳ Phase 4: Publishing
- ⏳ Phase 5: Analytics

## Schedule

Posts generated automatically:

- Monday 19:00 - Product focus
- Wednesday 19:00 - Educational
- Friday 19:00 - Lifestyle

## Database Schema

See Supabase project: `dogonauts-content-agent`

Tables:

- campaigns
- products
- product_assets
- post_history

# ─────────────────────────────────────────────────────────────

# Dogonauts Super-Agent — monorepo (pnpm + TS + Fastify)

# ─────────────────────────────────────────────────────────────

set -e

REPO="dogonauts-agent"
mkdir -p "$REPO"
cd "$REPO"

# pnpm workspace

cat > pnpm-workspace.yaml <<'YAML'
packages:

- "packages/\*"
- "apps/\*"
  YAML

# git + .gitignore

git init -q
cat > .gitignore <<'GIT'
node_modules
dist
.env
.DS_Store
GIT

# root package.json

cat > package.json <<'JSON'
{
"name": "dogonauts-agent-monorepo",
"private": true,
"scripts": {
"build": "pnpm -r --filter ./packages/_ run build && pnpm -r --filter ./apps/_ run build",
"dev": "pnpm --filter @dogonauts/service-api dev",
"lint": "pnpm -r run lint",
"test": "pnpm -r run test"
},
"devDependencies": {
"typescript": "^5.6.3"
}
}
JSON

# tsconfig base

cat > tsconfig.base.json <<'JSON'
{
"compilerOptions": {
"target": "ES2021",
"lib": ["ES2021"],
"module": "ESNext",
"moduleResolution": "Bundler",
"strict": true,
"resolveJsonModule": true,
"esModuleInterop": true,
"forceConsistentCasingInFileNames": true,
"skipLibCheck": true,
"outDir": "dist"
}
}
JSON

# ── packages/agent-sdk ───────────────────────────────────────

mkdir -p packages/agent-sdk/src/{core,gen,meta,store,catalog}
cat > packages/agent-sdk/package.json <<'JSON'
{
"name": "@dogonauts/agent-sdk",
"version": "0.1.0",
"type": "module",
"main": "dist/index.js",
"types": "dist/index.d.ts",
"files": ["dist"],
"scripts": {
"build": "tsc -p tsconfig.json",
"lint": "echo \"lint placeholder\"",
"test": "vitest run"
},
"dependencies": {
"openai": "^4.56.0",
"undici": "^6.19.8"
},
"devDependencies": {
"typescript": "^5.6.3",
"vitest": "^2.0.5"
}
}
JSON

cat > packages/agent-sdk/tsconfig.json <<'JSON'
{
"extends": "../../tsconfig.base.json",
"compilerOptions": {
"outDir": "dist"
},
"include": ["src"]
}
JSON

# types

cat > packages/agent-sdk/src/core/types.ts <<'TS'
export type ProductAsset = {
id: string;
title: string;
description?: string;
imageUrl?: string;
price?: number;
url?: string;
tags?: string[];
};

export type GeneratedPost = {
caption: string;
hashtags: string[];
imageUrl?: string;
};

export interface Publisher {
publishFacebook(pageId: string, input: GeneratedPost): Promise<{ postId: string }>;
publishInstagram(igId: string, input: GeneratedPost): Promise<{ mediaId: string }>;
}
TS

# simple errors + utils

cat > packages/agent-sdk/src/core/errors.ts <<'TS'
export class MetaError extends Error {
constructor(message: string, public info?: unknown) {
super(message);
this.name = "MetaError";
}
}
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
TS

# caption engine (placeholder)

cat > packages/agent-sdk/src/gen/captionEngine.ts <<'TS'
import type { ProductAsset, GeneratedPost } from "../core/types.js";

export async function generateCaption(p: ProductAsset): Promise<GeneratedPost> {
const caption = `Nuevo: ${p.title}. ${p.description ?? ""}`.trim();
const hashtags = ["#Dogonauts", "#NewDrop"];
return { caption, hashtags, imageUrl: p.imageUrl };
}
TS

# moderation guard (stub)

cat > packages/agent-sdk/src/gen/moderationGuard.ts <<'TS'
export async function checkModeration(\_: { caption: string; imageUrl?: string }) {
// aquí puedes integrar omni-moderation-latest si lo deseas
return { ok: true as const };
}
TS

# Meta token manager (uses system user token)

cat > packages/agent-sdk/src/meta/tokenManager.ts <<'TS'
export type TokenBag = {
systemToken: string; // META_ACCESS_TOKEN (system user)
pageToken?: string; // opcional si ya lo tienes
};

export class TokenManager {
constructor(private bag: TokenBag) {}
getSystemToken() { return this.bag.systemToken; }
getPageToken() { return this.bag.pageToken; }
setPageToken(t: string) { this.bag.pageToken = t; }
}
TS

# Facebook publisher (feed)

cat > packages/agent-sdk/src/meta/facebookPublisher.ts <<'TS'
import { MetaError } from "../core/errors.js";
import type { GeneratedPost } from "../core/types.js";
import { request } from "undici";

/\*_ Publica en el feed de la página como la página _/
export async function publishFacebook(pageId: string, pageAccessToken: string, input: GeneratedPost) {
const url = new URL(`https://graph.facebook.com/v24.0/${pageId}/feed`);
const params = new URLSearchParams({
message: `${input.caption}\n\n${input.hashtags.join(" ")}`,
published: "true",
access_token: pageAccessToken
});
const res = await request(url, { method: "POST", body: params });
const data = await res.body.json();
if (!res.ok || data.error) throw new MetaError("FB publish failed", data);
return { postId: String(data.id) };
}

/\*_ Intercambia system token -> page token (me/accounts) y retorna el token de esa page _/
export async function getPageAccessToken(systemToken: string, pageId: string): Promise<string> {
const url = new URL("https://graph.facebook.com/v24.0/me/accounts");
url.searchParams.set("fields", "id,access_token");
url.searchParams.set("access_token", systemToken);
const res = await fetch(url);
const json: any = await res.json();
if (!res.ok || json.error) throw new MetaError("Cannot list pages", json);
const page = (json.data as any[]).find(p => String(p.id) === String(pageId));
if (!page?.access_token) throw new MetaError("Page token not found for given PAGE_ID");
return page.access_token as string;
}
TS

# Instagram publisher (media -> media_publish)

cat > packages/agent-sdk/src/meta/instagramPublisher.ts <<'TS'
import { MetaError } from "../core/errors.js";

export async function publishInstagram(igId: string, pageAccessToken: string, input: { imageUrl: string; caption: string; hashtags?: string[] }) {
const fullCaption = input.hashtags?.length ? `${input.caption}\n\n${input.hashtags.join(" ")}` : input.caption;

// 1) crear contenedor
const mediaUrl = new URL(`https://graph.facebook.com/v24.0/${igId}/media`);
const createRes = await fetch(mediaUrl, {
method: "POST",
body: new URLSearchParams({
image_url: input.imageUrl,
caption: fullCaption,
access_token: pageAccessToken
})
});
const createJson: any = await createRes.json();
if (!createRes.ok || createJson.error) throw new MetaError("IG media create failed", createJson);

// 2) publicar
const publishUrl = new URL(`https://graph.facebook.com/v24.0/${igId}/media_publish`);
const publishRes = await fetch(publishUrl, {
method: "POST",
body: new URLSearchParams({
creation_id: String(createJson.id),
access_token: pageAccessToken
})
});
const publishJson: any = await publishRes.json();
if (!publishRes.ok || publishJson.error) throw new MetaError("IG publish failed", publishJson);

return { mediaId: String(publishJson.id) };
}
TS

# simple repos (Supabase later)

cat > packages/agent-sdk/src/store/postsRepo.ts <<'TS'
export type PostRecord = {
network: "facebook" | "instagram";
externalId: string;
caption: string;
imageUrl?: string;
status: "published" | "failed";
error?: unknown;
};
export class PostsRepo {
async insert(rec: PostRecord) {
// TODO: integrar Supabase; por ahora log
console.log("[postsRepo.insert]", rec);
}
}
TS

# index barrel

cat > packages/agent-sdk/src/index.ts <<'TS'
export _ from "./core/types.js";
export _ from "./core/errors.js";
export _ from "./gen/captionEngine.js";
export _ from "./gen/moderationGuard.js";
export _ from "./meta/tokenManager.js";
export _ from "./meta/facebookPublisher.js";
export _ from "./meta/instagramPublisher.js";
export _ from "./store/postsRepo.js";
TS

# ── apps/service-api ─────────────────────────────────────────

mkdir -p apps/service-api/src/routes
cat > apps/service-api/package.json <<'JSON'
{
"name": "@dogonauts/service-api",
"version": "0.1.0",
"type": "module",
"scripts": {
"dev": "tsx watch src/server.ts",
"build": "tsc -p tsconfig.json"
},
"dependencies": {
"@dogonauts/agent-sdk": "workspace:\*",
"fastify": "^4.28.1",
"tsx": "^4.19.0",
"dotenv": "^16.4.5"
},
"devDependencies": {
"typescript": "^5.6.3"
}
}
JSON

cat > apps/service-api/tsconfig.json <<'JSON'
{
"extends": "../../tsconfig.base.json",
"compilerOptions": {
"outDir": "dist"
},
"include": ["src"]
}
JSON

cat > apps/service-api/src/server.ts <<'TS'
import Fastify from "fastify";
import \* as dotenv from "dotenv";
dotenv.config();

import {
generateCaption,
checkModeration,
getPageAccessToken,
publishFacebook,
publishInstagram
} from "@dogonauts/agent-sdk";

const fastify = Fastify({ logger: true });

fastify.get("/health", async () => ({ ok: true, time: new Date().toISOString() }));

fastify.post("/run", async (req: any, reply) => {
try {
const {
product = { id: "sku-1", title: "Gorro Dogonauts", description: "Edición invierno", imageUrl: "https://picsum.photos/seed/dogonauts/1080/1350" },
network = "instagram",
dryRun = false
} = req.body || {};

    const post = await generateCaption(product);
    await checkModeration({ caption: post.caption, imageUrl: post.imageUrl });

    const SYSTEM_TOKEN = process.env.META_ACCESS_TOKEN!;
    const FB_PAGE_ID = process.env.FB_PAGE_ID!;
    const IG_ACCOUNT_ID = process.env.IG_ACCOUNT_ID!;

    // intercambiar page token
    const pageToken = await getPageAccessToken(SYSTEM_TOKEN, FB_PAGE_ID);

    if (dryRun) return reply.send({ ok: true, dryRun: true, post });

    if (network === "facebook") {
      const res = await publishFacebook(FB_PAGE_ID, pageToken, post);
      return reply.send({ ok: true, network, res });
    } else {
      if (!post.imageUrl) throw new Error("Se requiere imageUrl para Instagram");
      const res = await publishInstagram(IG_ACCOUNT_ID, pageToken, {
        imageUrl: post.imageUrl,
        caption: post.caption,
        hashtags: post.hashtags
      });
      return reply.send({ ok: true, network, res });
    }

} catch (err: any) {
req.log.error(err);
return reply.code(500).send({ ok: false, error: err?.message ?? "error" });
}
});

const port = Number(process.env.PORT ?? 8080);
fastify.listen({ port, host: "0.0.0.0" }).then(() => {
fastify.log.info(`Service API listening on :${port}`);
});
TS

# env example

cat > .env.example <<'ENV'

# System user token (never expiring)

META_ACCESS_TOKEN=your_meta_system_user_token

# Page and IG IDs

FB_PAGE_ID=798526963351551
IG_ACCOUNT_ID=17841477368857680

# Server

PORT=8080
ENV

# Done

echo "✅ Scaffold listo. Ahora ejecuta:"
echo " pnpm install"
echo " pnpm dev # inicia service-api"

# 🐕‍🦺 Dogonauts Content Agent

Sistema **Agentic IA + Meta Graph** para automatizar publicaciones de e-commerce en Instagram y Facebook, con captions generativos, moderación automática y control de duplicados.

---

## 🚀 Estado Actual (Sprint 1 ✅)

**Infraestructura completa y estable:**

| Módulo                        | Estado | Descripción                      |
| :---------------------------- | :----: | :------------------------------- |
| Express API (Node + TS + ESM) |   ✅   | Endpoints `/health` y `/run`     |
| OpenAI SDK                    |   ✅   | Generación de captions           |
| Supabase (DB + Storage)       |   ✅   | Persistencia de historial y logs |
| Meta Graph API v24            |   ✅   | Publicación programática FB / IG |
| Moderación IA                 |   ✅   | Revisión previa al publish       |
| Idempotencia                  |   ✅   | Hash de contenido + índice único |
| Config n8n (L–M–V)            |   ✅   | Trigger HTTP → `POST /run`       |

**Resultado:**

- `POST /run {dryRun:true}` genera un plan con productos, captions y redes planificadas.
- `POST /run {dryRun:false}` publica realmente en las redes activas.
- `/health` verifica las claves y devuelve su estado (OK / Faltante).

---

## 🧠 Arquitectura simplificada

# Dockerfile (simple y funcional)

# --- ROMPEDOR DE CACHÉ ---
# Esta línea fuerza a Docker a no usar la caché anterior.
ARG CACHE_BUSTER=20251024-1700
# --- FIN ROMPEDOR DE CACHÉ ---

FROM node:20-alpine
WORKDIR /app

# Necesitamos devDependencies para compilar TypeScript
COPY package*.json ./
RUN npm ci --include=dev

# Copiamos el código y compilamos
COPY . .
RUN npm run build

# Quitamos devDependencies para runtime liviano
RUN npm prune --omit=dev

# EasyPanel suele usar 3000
EXPOSE 3000

# Opcional: identificar el build (te ayuda con /version y a romper caché)
ARG GIT_SHA=deploy-simple-1
ENV GIT_SHA=$GIT_SHA
ENV NODE_ENV=production

# Arranque
CMD ["node", "dist/index.js"]

# ============================================================================
# Stage 1: Build
# ============================================================================
FROM node:20-alpine AS build

WORKDIR /app

# Instalar dependencias de compilación para Sharp
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev

# Copiar archivos de dependencias
COPY package*.json ./
COPY tsconfig.json ./

# Instalar todas las dependencias (incluyendo dev)
RUN npm ci
RUN npm prune --omit=dev

# Copiar código fuente
COPY src ./src
COPY scripts ./scripts

# Compilar TypeScript
RUN npm run build

# ============================================================================
# Stage 2: Production
# ============================================================================
FROM node:20-alpine

WORKDIR /app

# Instalar dependencias runtime para Sharp
RUN apk add --no-cache cairo jpeg pango giflib

# Crear usuario no-root
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copiar package files
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --omit=dev

# Copiar código compilado desde build stage
COPY --from=build /app/dist ./dist

# Crear directorios necesarios
RUN mkdir -p /app/assets /app/logs && chown -R nodejs:nodejs /app

# Cambiar a usuario no-root
USER nodejs

# Exponer puerto
EXPOSE 3000

# Health check (ARREGLADO para ES Modules)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "import('http').then(http => http.get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)))"

# Comando de inicio (ARREGLADO: dist/index.js no dist/src/index.js)
CMD ["node", "dist/index.js"]
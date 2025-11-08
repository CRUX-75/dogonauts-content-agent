FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache cairo jpeg pango giflib
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/assets /app/logs && chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
CMD ["node", "dist/src/index.js"]

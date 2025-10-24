# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Instala dependencias
COPY package*.json ./
RUN npm ci

# Copia el código fuente
COPY . .

# Compila TypeScript -> dist/
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

# Copia sólo lo necesario para producción
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# Asegura que el puerto 8080 quede expuesto
EXPOSE 3000

# Ejecuta el archivo de salida principal (dist/index.js)
CMD ["node", "dist/index.js"]

# al final del stage runtime
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
# --- Etapa 1: "Build" (Construcción) ---
# Usamos una imagen oficial de Node.js (LTS - Alpine es ligera)
FROM node:18-alpine AS builder

# Establecemos el directorio de trabajo
WORKDIR /app

# Copiamos package.json y package-lock.json para cachear las dependencias
COPY package*.json ./

# Instalamos TODAS las dependencias (incluyendo devDependencies como 'typescript')
RUN npm install

# Copiamos el resto del código fuente (src/, tsconfig.json, etc.)
COPY . .

# Ejecutamos el script de build para compilar TS -> JS en /app/dist
RUN npm run build


# --- Etapa 2: "Production" (Ejecución) ---
# Empezamos desde una imagen limpia y ligera de Node
FROM node:18-alpine

WORKDIR /app

# Copiamos los package.json desde la etapa 'builder'
COPY --from=builder /app/package*.json ./

# Instalamos SOLAMENTE las dependencias de producción
RUN npm install --omit=dev

# Copiamos la carpeta 'dist' compilada desde la etapa 'builder'
COPY --from=builder /app/dist ./dist

# Exponemos el puerto 3000 (el que usa tu app)
EXPOSE 3000

# Añadimos un usuario 'node' por seguridad (buena práctica)
USER node

# El comando final para arrancar la aplicación
CMD ["node", "dist/index.js"]
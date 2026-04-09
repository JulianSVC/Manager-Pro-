FROM node:18-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install --omit=dev

# Copiar el resto de la aplicación
COPY . .

# Crear directorio para la base de datos (opcional, Railway creará el mount point)
RUN mkdir -p /data && chmod -R 777 /data

# Exponer el puerto
EXPOSE 3011

# Iniciar la aplicación
CMD ["node", "index.js"]
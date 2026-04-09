FROM node:18-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install --omit=dev

# Copiar el resto de la aplicación
COPY . .

# Exponer el puerto
EXPOSE 3011

# Iniciar la aplicación
CMD ["node", "index.js"]
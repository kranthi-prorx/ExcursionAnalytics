FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# App Runner / ECS expect the port in the ENV
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server.js"]

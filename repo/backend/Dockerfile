FROM node:18-alpine
RUN apk add --no-cache mysql-client
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

RUN npm prune --production

EXPOSE 4000
CMD ["node", "dist/index.js"]

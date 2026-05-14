FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
COPY web/package*.json ./web/
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
RUN apt-get update -y && apt-get install -y openssl libssl-dev
RUN npm install
RUN npm install --prefix web
RUN npx prisma generate
COPY . .
RUN npm run web:build
RUN npm run build

FROM node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
RUN apt-get update -y && apt-get install -y openssl libssl-dev
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/scripts ./scripts
EXPOSE 8080
# Pre-deploy step resolves any "failed" migration record before
# `prisma migrate deploy` runs (recovers from P3009 automatically).
# Safe no-op once all listed migrations are in "applied" state.
CMD ["sh", "-c", "node scripts/pre-deploy.mjs && npx prisma migrate deploy && node dist/main.js"]
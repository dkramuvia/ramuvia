# 서버 1대 배포용 API 이미지 (docker compose --profile app up -d --build)
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY scripts ./scripts
USER node
EXPOSE 3000
# 시작할 때 마이그레이션을 먼저 적용하고 API 실행
CMD ["sh", "-c", "node scripts/migrate.mjs && node dist/main.js"]

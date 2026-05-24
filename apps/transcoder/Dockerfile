FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/transcoder/package.json apps/transcoder/package.json
RUN pnpm install --filter @shareus/transcoder... --frozen-lockfile
COPY apps/transcoder apps/transcoder
RUN pnpm --filter @shareus/transcoder build

FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/apps/transcoder/dist ./dist
COPY --from=build /app/apps/transcoder/package.json ./package.json
RUN npm install --omit=dev
CMD ["node", "dist/index.js"]

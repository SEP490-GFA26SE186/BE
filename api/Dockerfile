# syntax=docker/dockerfile:1

# =============================================================================
# services/api — StoryWeaver AI core backend (Express 5 + Prisma)
#
# Dung node:22-slim (Debian) chu KHONG phai alpine: Prisma query engine build
# theo glibc/OpenSSL. Tren alpine (musl) phai khai bao binaryTargets va cai
# openssl thu cong, sai mot cho la loi "query engine not found" luc runtime.
# Slim nang hon ~40MB nhung Prisma chay thang, khong can cau hinh them.
# =============================================================================

# ---- stage 1: cai dependencies + sinh Prisma client -------------------------
FROM node:22-slim AS deps
WORKDIR /app

# Prisma can OpenSSL de load query engine
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# `prisma generate` doc prisma.config.ts, trong do co env("DATABASE_URL").
# Generate KHONG ket noi DB that, nhung bien phai ton tai -> dat gia tri gia.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DIRECT_URL="postgresql://build:build@localhost:5432/build"
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate

# ---- stage 2: runtime -------------------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# node_modules da co Prisma client duoc generate o stage tren
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/v1/health || exit 1

# Command mac dinh la HTTP server. Container `worker` trong docker-compose
# dung CHINH image nay nhung override thanh `node src/worker.js`.
CMD ["node", "src/server.js"]

# =============================================================
# Paraplyen – single-container image
#
# Contains both the Next.js frontend (port 3000) and the
# Express backend (port 3001, internal only).
# Requests to /api/* from the browser are transparently proxied
# by Next.js rewrites, so only port 3000 needs to be published:
#
#   docker build -t paraplyen .
#   docker run -p 3000:3000 paraplyen
# =============================================================

# ──────────────────────────────────────────────────────────────
# Stage 1 – install all workspace dependencies
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN npm install -g pnpm@8.15.6

WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json ./backend/

RUN pnpm install --frozen-lockfile

# ──────────────────────────────────────────────────────────────
# Stage 2 – compile the Express backend (TypeScript → JS)
# ──────────────────────────────────────────────────────────────
FROM deps AS backend-builder

COPY backend/tsconfig.json ./backend/
COPY backend/src           ./backend/src

# tsc compiles src/ → dist/; then copy the JSON data files so the
# compiled server can find them at dist/db/data/ (mirrors __dirname path)
RUN cd backend \
    && npx tsc \
    && if [ -d src/db/data ]; then cp -r src/db/data dist/db/; fi

# ──────────────────────────────────────────────────────────────
# Stage 3 – build the Next.js frontend
# ──────────────────────────────────────────────────────────────
FROM deps AS frontend-builder

# Setting this to "" makes the client use relative URLs (/api/…)
# which are proxied by Next.js rewrites to the local backend.
# Override at build time with --build-arg if needed.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY . .

RUN DOCKER_BUILD=true pnpm run build

# ──────────────────────────────────────────────────────────────
# Stage 4 – lean runtime image
# ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN npm install -g pm2

WORKDIR /app

# ── Backend ────────────────────────────────────────────────────
COPY --from=backend-builder /app/backend/dist         ./backend/dist
# pnpm hoists workspace deps to root node_modules – copy both
COPY --from=backend-builder /app/node_modules         ./node_modules
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules

# ── Frontend (Next.js standalone) ──────────────────────────────
# standalone/  contains a minimal server.js + its own node_modules
COPY --from=frontend-builder /app/.next/standalone ./
COPY --from=frontend-builder /app/.next/static     ./.next/static
COPY --from=frontend-builder /app/public           ./public

# ── Process manager config ─────────────────────────────────────
COPY ecosystem.config.cjs ./

# Only the Next.js port needs to be reachable from outside
EXPOSE 3000

CMD ["pm2-runtime", "ecosystem.config.cjs"]

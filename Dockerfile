# syntax=docker/dockerfile:1

# Slang AI Lab — Next.js app (in ./app) built as a standalone server image.
# Build context is the repository root so the monorepo layout is preserved.

FROM node:22-alpine AS base
# libc compatibility for some native/emscripten deps.
RUN apk add --no-cache libc6-compat

# ---- Dependencies ----
FROM base AS deps
WORKDIR /repo/app
COPY app/package.json app/package-lock.json ./
RUN npm ci

# ---- Builder ----
FROM base AS builder
WORKDIR /repo
COPY app ./app
COPY --from=deps /repo/app/node_modules ./app/node_modules
WORKDIR /repo/app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Runner ----
FROM base AS runner
WORKDIR /repo
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# The standalone server reads HOSTNAME/PORT; bind to all interfaces in a container.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup -g 1001 -S nodejs \
  && adduser -u 1001 -S nextjs -G nodejs

# Standalone output (contains app/server.js and app/node_modules), plus the
# static assets and public/ (which includes the bundled slang-wasm compiler).
COPY --from=builder --chown=nextjs:nodejs /repo/app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/app/.next/static ./app/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/app/public ./app/public

USER nextjs
EXPOSE 3000

# GROQ_API_KEY can be provided at runtime (optional — users may enter their own key in the UI).
CMD ["node", "app/server.js"]

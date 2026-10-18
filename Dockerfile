# syntax=docker/dockerfile:1
# ─── Merkster: multi-stage build → small, non-root runtime image ─────────────────────────────
ARG NODE_IMAGE=node:20.19-bookworm-slim

# 1) build: install everything, build the PWA (Vite) and bundle the server (esbuild)
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig*.json vite.config.ts ./
COPY scripts ./scripts
COPY shared ./shared
COPY server ./server
COPY web ./web
RUN npm run build

# 2) deps: production dependencies of the server only (the web app is fully bundled)
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

# 3) runtime
FROM ${NODE_IMAGE} AS runtime
LABEL org.opencontainers.image.title="merkster" \
      org.opencontainers.image.description="Merkster – snap your school material, practise like the real test, and earn a promised reward." \
      org.opencontainers.image.source="https://github.com/bandulix/merkster" \
      org.opencontainers.image.url="https://github.com/bandulix/merkster" \
      org.opencontainers.image.version="0.1.0" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0
WORKDIR /app
COPY --from=deps --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=build --chown=1000:1000 /app/dist ./dist
COPY --chown=1000:1000 package.json ./
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/server/index.cjs"]

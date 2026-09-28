# Build context is the repo root (see docker-compose.yml), so npm workspaces
# and the shared package-lock.json are available.

# ---- Stage 1: install dependencies and build the Next.js app ----
FROM node:24-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/web
COPY apps/web apps/web
# NEXT_PUBLIC_ values are written into the browser code at build time, so the
# API address must be known here, not only when the container starts.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build -w apps/web

# ---- Stage 2: only the self-contained server that `output: 'standalone'` made ----
FROM node:24-alpine
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

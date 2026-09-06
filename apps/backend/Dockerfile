FROM node:24-alpine AS base

# Rebuild the source code only when needed
FROM base AS builder
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy npm workspace manifests first so dependency installation remains cacheable.
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json

# Install only the backend workspace from the unified lockfile.
RUN npm ci --workspace @spice/backend --include-workspace-root=false

# Copy backend source after dependencies are installed.
COPY apps/backend ./apps/backend

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Build the app
RUN SPICE_STANDALONE_OUTPUT=1 npm run build --workspace @spice/backend

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Overridable at build time: vercel (default, cloud control plane),
# local (PC runtime), selfhost (VPS: full UI + media + cloud + local DB).
ARG SPICE_RUNTIME_TARGET=vercel
ENV SPICE_RUNTIME_TARGET=${SPICE_RUNTIME_TARGET}
ENV NEXT_PUBLIC_SPICE_RUNTIME_TARGET=${SPICE_RUNTIME_TARGET}

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/apps/backend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/backend/.next/static ./apps/backend/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/backend/public ./apps/backend/public
# Self-host support: drizzle migrations plus the entrypoint that applies them
# (plus the migrate script) when SPICE_RUN_MIGRATIONS=1. Inert otherwise.
COPY --from=builder --chown=nextjs:nodejs /app/apps/backend/db/migrations ./apps/backend/db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/apps/backend/scripts/migrate-selfhost.mjs ./apps/backend/scripts/migrate-selfhost.mjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/backend/docker-entrypoint.sh ./apps/backend/docker-entrypoint.sh
RUN chmod +x ./apps/backend/docker-entrypoint.sh

USER nextjs

WORKDIR /app/apps/backend

EXPOSE 3000

ENV PORT=3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]

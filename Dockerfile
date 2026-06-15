FROM node:22-alpine AS base

# Install runtime dependencies only
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/plugins/auth/package.json packages/plugins/auth/
COPY packages/plugins/rate-limit/package.json packages/plugins/rate-limit/
COPY packages/plugins/logger/package.json packages/plugins/logger/
COPY packages/plugins/tool-filter/package.json packages/plugins/tool-filter/
COPY packages/cli/package.json packages/cli/
RUN npm ci --omit=dev --workspaces

# Build stage
FROM base AS build
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/core/tsconfig.json packages/core/tsconfig.json
COPY packages/plugins/auth/tsconfig.json packages/plugins/auth/tsconfig.json
COPY packages/plugins/rate-limit/tsconfig.json packages/plugins/rate-limit/tsconfig.json
COPY packages/plugins/logger/tsconfig.json packages/plugins/logger/tsconfig.json
COPY packages/plugins/tool-filter/tsconfig.json packages/plugins/tool-filter/tsconfig.json
COPY packages/cli/tsconfig.json packages/cli/tsconfig.json
COPY --from=deps /app/node_modules ./node_modules
COPY packages/core/src ./packages/core/src
COPY packages/plugins/auth/src ./packages/plugins/auth/src
COPY packages/plugins/rate-limit/src ./packages/plugins/rate-limit/src
COPY packages/plugins/logger/src ./packages/plugins/logger/src
COPY packages/plugins/tool-filter/src ./packages/plugins/tool-filter/src
COPY packages/cli/src ./packages/cli/src
RUN npm run build --workspaces

# Runtime stage
FROM base AS runtime
WORKDIR /app
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/plugins/auth/dist ./packages/plugins/auth/dist
COPY --from=build /app/packages/plugins/rate-limit/dist ./packages/plugins/rate-limit/dist
COPY --from=build /app/packages/plugins/logger/dist ./packages/plugins/logger/dist
COPY --from=build /app/packages/plugins/tool-filter/dist ./packages/plugins/tool-filter/dist
COPY --from=build /app/packages/cli/dist ./packages/cli/dist

EXPOSE 3000
ENTRYPOINT ["node", "packages/cli/dist/cli.js"]

FROM node:24-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/bot/package.json apps/bot/package.json
COPY packages/core/package.json packages/core/package.json
RUN pnpm install --filter @piphacklup/bot... --prod=false --frozen-lockfile

FROM deps AS build
COPY apps/bot apps/bot
COPY packages/core packages/core
RUN pnpm --filter @piphacklup/core build && pnpm --filter @piphacklup/bot build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/bot apps/bot
COPY --from=build /app/packages/core packages/core
EXPOSE 8787
CMD ["pnpm", "--filter", "@piphacklup/bot", "start"]

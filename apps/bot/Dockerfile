FROM node:24-slim AS base
WORKDIR /app
RUN npm install --global pnpm@10.25.0

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/bot/package.json apps/bot/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --filter @piphacklup/bot... --prod=false --frozen-lockfile

FROM deps AS build
COPY apps/bot apps/bot
COPY packages/core packages/core
COPY packages/db packages/db
RUN pnpm --filter @piphacklup/bot build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/bot apps/bot
COPY --from=build /app/packages/core packages/core
COPY --from=build /app/packages/db packages/db
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '8787') + '/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "apps/bot/dist/index.js"]

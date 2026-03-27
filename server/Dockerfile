FROM node:lts-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apk upgrade --no-cache && corepack enable

WORKDIR /app


FROM base AS build

COPY . .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

RUN pnpm prisma generate

RUN pnpm build


FROM base

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts package.json ./

EXPOSE 8393

CMD ["/bin/sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/src/main"]

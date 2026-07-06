FROM node:26.2.0-slim

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && npm install --global pm2 tsx

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/server/package.json ./apps/server/package.json

RUN pnpm install --frozen-lockfile --prod

COPY apps/server/dist/process ./apps/server/dist/process

WORKDIR /app/apps/server

CMD ["pm2-runtime", "start", "./dist/process/node/index.mjs", "--interpreter", "node", "--name", "server"]

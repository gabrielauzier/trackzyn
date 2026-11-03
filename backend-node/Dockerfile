# Targets: `dev` (tsx, source mounted by docker-compose.yml) and `runtime` (the default, compiled).
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS dev
COPY . .
EXPOSE 8000
CMD ["npm", "run", "dev"]

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
RUN mkdir -p /app/data/files && chown -R node:node /app
USER node
EXPOSE 8000
CMD ["node", "dist/server.js"]

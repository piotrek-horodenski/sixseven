# RPS — zdalny serwis logiki gry (best-of-N, deterministyczny). Budowany z
# KONTEKSTU ROOTA repo, bo zależy od źródło-only `sixseven-sdk` (→ `sixseven-hmac`).
# compose: build: { context: ., dockerfile: catalog/rps/Dockerfile }
#
# Uruchamiany jako serwis: SIXSEVEN_GAME_SECRET (HMAC z rejestracji) + GAME_PORT.

FROM node:20-alpine AS build
RUN apk add --no-cache git
WORKDIR /repo
COPY . .
RUN npm ci
# łańcuch źródło-only zależności → dist
RUN npm run build --workspace packages/hmac
RUN npm run build --workspace packages/sdk
RUN cd catalog/rps && npx tsc

FROM node:20-alpine
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/catalog ./catalog
WORKDIR /repo/catalog/rps
EXPOSE 4310
CMD ["node", "dist/index.js"]

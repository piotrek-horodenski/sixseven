# games — silnik meczów. Budowany z KONTEKSTU ROOTA repo (monorepo), bo zależy
# od źródło-only pakietu `sixseven-hmac` (packages/hmac). compose ustawia:
#   build: { context: ., dockerfile: games/Dockerfile }
#
# Pakiety mają `main: dist/index.js`, więc PRZED uruchomieniem trzeba je zbudować
# do dist/ (blocker z ETAP2 „Decyzje/Na co uważać" — tu rozwiązany w obrazie).
# games NIE używa aliasu `@/` w runtime, więc czysty `tsc` daje działający output.

FROM node:20-alpine AS build
RUN apk add --no-cache git
WORKDIR /repo
COPY . .
RUN npm ci
# źródło-only zależność runtime games → dist
RUN npm run build --workspace packages/hmac
# games → dist (tsc; rootDir=., outDir=./dist ⇒ dist/index.js + dist/app/**)
RUN cd games && npx tsc --outDir dist --project .

FROM node:20-alpine
WORKDIR /repo
# node_modules (z symlinkami workspace'ów) + zbudowane pakiety + games/dist
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/games ./games
WORKDIR /repo/games
EXPOSE 4120
CMD ["node", "dist/index.js"]

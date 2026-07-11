FROM node:20-alpine AS build
ARG VITE_GATE_URL=wss://localhost:4114
ENV VITE_GATE_URL=${VITE_GATE_URL}
# REST bramki (2d): wymiana handoff→token meczu, join-guest (aplikacja gry /game/rps).
ARG VITE_GATE_HTTP_URL=https://localhost:4114
ENV VITE_GATE_HTTP_URL=${VITE_GATE_HTTP_URL}
# Serwis obrazków (admin/images) — przeglądarka łączy się z nim BEZPOŚREDNIO
# (nie przez gate). Na hoście wystawiony na 5279 (kontener 5179).
ARG VITE_IMAGE_URL=http://localhost:5279/api
ENV VITE_IMAGE_URL=${VITE_IMAGE_URL}
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build-only

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

FROM node:20-alpine AS build
ARG VITE_GATE_URL=wss://localhost:4114
ENV VITE_GATE_URL=${VITE_GATE_URL}
# REST bramki (2d): wymiana handoff→token meczu, join-guest (aplikacja gry /game/rps).
ARG VITE_GATE_HTTP_URL=https://localhost:4114
ENV VITE_GATE_HTTP_URL=${VITE_GATE_HTTP_URL}
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build-only

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

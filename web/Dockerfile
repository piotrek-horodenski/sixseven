FROM node:20-alpine AS build
ARG VITE_GATE_URL=wss://localhost:4114
ENV VITE_GATE_URL=${VITE_GATE_URL}
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build-only

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

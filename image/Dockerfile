FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/ .
COPY tsconfig.json .
COPY ./src/ ./src/
RUN npm run build

FROM node:20-alpine AS prod
WORKDIR /app
COPY --from=build /app .
COPY tsconfig.prod.json ./tsconfig.json
RUN sed -i "s|\"@\": \"./src\"|\"@\": \"./dist\" |g" ./package.json
EXPOSE 5179
CMD [ "npm", "start"]

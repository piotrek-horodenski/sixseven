FROM node:20-alpine AS dependencies
WORKDIR /app
COPY package.json .
COPY yarn.lock .
RUN yarn install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/ .
COPY tsconfig.json .
COPY ./src/ ./src/
RUN yarn build

FROM node:20-alpine AS prod
WORKDIR /app
COPY --from=build /app .
COPY tsconfig.prod.json ./tsconfig.json
RUN sed -i "s|\"@\": \"./src\"|\"@\": \"./dist\" |g" ./package.json
EXPOSE 5179
CMD [ "yarn", "start"]

FROM node:20-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:20-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:20-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:20-alpine
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
# Copy migration files for runtime
COPY ./app/db/migrations /app/app/db/migrations
COPY ./node-pg-migrate.json /app/
COPY ./scripts /app/scripts
WORKDIR /app
# Run migrations then start server
CMD ["sh", "-c", "npx node-pg-migrate up -m app/db/migrations && npm run start"]
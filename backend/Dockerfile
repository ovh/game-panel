ARG NODE_IMAGE=node:20.20.1-alpine3.22

FROM ${NODE_IMAGE} AS deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci

FROM ${NODE_IMAGE} AS build
WORKDIR /app/backend
COPY --from=deps /app/backend/node_modules node_modules
COPY backend ./
RUN npm run build
RUN npm prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production
COPY --from=build /app/backend/dist dist
COPY --from=build /app/backend/package*.json ./
COPY --from=build /app/backend/node_modules node_modules
EXPOSE 3001
CMD ["node", "dist/index.js"]

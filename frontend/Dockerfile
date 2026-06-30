FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY frontend frontend
ARG VITE_DB_API_BASE_URL
ENV VITE_DB_API_BASE_URL=${VITE_DB_API_BASE_URL}
RUN cd frontend && npm run build

FROM nginxinc/nginx-unprivileged:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080

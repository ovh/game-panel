FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY frontend frontend
ARG VITE_API_BASE_URL
ARG VITE_DB_API_BASE_URL
ARG VITE_WS_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_DB_API_BASE_URL=${VITE_DB_API_BASE_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
RUN cd frontend && npm run build

FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80

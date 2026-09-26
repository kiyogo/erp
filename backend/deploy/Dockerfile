# Multi-stage build for Kiyo Platform (Rust Backend + React Frontend)
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY ../frontend/package*.json ./
RUN npm install
COPY ../frontend ./
RUN npm run build

FROM rust:1.85-alpine AS backend-builder
RUN apk add --no-cache musl-dev
WORKDIR /app/backend
COPY ../backend/Cargo*.toml ./
COPY ../backend/src ./src
RUN cargo build --release

FROM alpine:3.20 AS runner
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=backend-builder /app/backend/target/release/kiyo-server /app/kiyo-server
COPY --from=frontend-builder /app/frontend/dist /app/dist
RUN mkdir -p /app/data/files

ENV KIYO_API_HOST=0.0.0.0
ENV KIYO_API_PORT=3001
ENV KIYO_API_DB_PATH=/app/data/kiyo.sqlite
ENV KIYO_API_STORAGE_PATH=/app/data/files
ENV KIYO_STATIC_DIR=/app/dist

EXPOSE 3001
VOLUME ["/app/data"]
CMD ["/app/kiyo-server"]

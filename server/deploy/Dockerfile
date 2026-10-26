# Multi-stage build for the shared Rust UI (WebAssembly) and Rust API.
FROM rust:1.89-bookworm AS web-builder
RUN rustup target add wasm32-unknown-unknown \
    && cargo install trunk --locked
WORKDIR /source
COPY . .
RUN cd web && trunk build --release

FROM rust:1.89-bookworm AS backend-builder
WORKDIR /source
COPY . .
RUN cargo build -p kiyo-server --release

FROM debian:bookworm-slim AS runner
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 10001 kiyo
WORKDIR /app
COPY --from=backend-builder /source/target/release/kiyo-server /app/kiyo-server
COPY --from=web-builder /source/web/dist /app/dist
RUN mkdir -p /app/data/files && chown -R kiyo:kiyo /app
USER kiyo

ENV KIYO_API_HOST=0.0.0.0
ENV KIYO_API_PORT=3001
ENV KIYO_API_DB_PATH=/app/data/kiyo.sqlite
ENV KIYO_API_STORAGE_PATH=/app/data/files
ENV KIYO_STATIC_DIR=/app/dist

EXPOSE 3001
VOLUME ["/app/data"]
CMD ["/app/kiyo-server"]

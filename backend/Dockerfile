FROM rust:1.97-bookworm AS build
WORKDIR /source
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && printf 'fn main() {}\n' > src/main.rs && cargo build --release
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN useradd --create-home --uid 10001 kiyo
WORKDIR /app
COPY --from=build /source/target/release/kiyo-cloud-api /usr/local/bin/kiyo-cloud-api
USER kiyo
ENV KIYO_API_HOST=0.0.0.0 KIYO_API_PORT=3001 KIYO_API_DB_PATH=/var/lib/kiyo/kiyo-cloud.sqlite
VOLUME ["/var/lib/kiyo"]
EXPOSE 3001
ENTRYPOINT ["kiyo-cloud-api"]

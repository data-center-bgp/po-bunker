# syntax=docker/dockerfile:1
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/admin ./cmd/admin
# The upload folder must belong to the non-root user, or a fresh named volume mounted
# there is root-owned and every upload fails. Docker copies this ownership into a new volume.
RUN mkdir -p /out/data/files

# distroless/static has CA certificates (the SMS vessel API is https) and no shell.
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/api /out/admin /app/
COPY --from=build --chown=65532:65532 /out/data /data
ENV APP_ENV=production PORT=8080 FILES_DIR=/data/files
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["/app/api", "healthcheck"]
ENTRYPOINT ["/app/api"]

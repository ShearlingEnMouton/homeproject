# syntax=docker/dockerfile:1
FROM golang:1.27-alpine AS build

RUN apk add --no-cache git openssh-client ca-certificates
RUN git config --global url."git@github.com:".insteadOf "https://github.com/" \
    && mkdir -p -m 0700 /root/.ssh \
    && ssh-keyscan github.com >> /root/.ssh/known_hosts

ENV CGO_ENABLED=0 GOPRIVATE=github.com/ShearlingEnMouton/*
WORKDIR /src

COPY go.mod go.sum ./
RUN --mount=type=ssh --mount=type=cache,target=/go/pkg/mod go mod download

COPY . .
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go build -trimpath -ldflags="-s -w" -o /out/homeproject .

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /out/homeproject /homeproject
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/homeproject"]

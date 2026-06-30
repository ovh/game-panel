FROM alpine:3.22

ARG IMAGE_CREATED="unknown"
ARG IMAGE_REVISION="unknown"
ARG IMAGE_VERSION="dev"
ARG IMAGE_SOURCE="https://github.com/ovh/game-panel"

LABEL org.opencontainers.image.title="Game Panel Updater Image" \
    org.opencontainers.image.description="One-shot updater image for Game Panel installations." \
    org.opencontainers.image.created="${IMAGE_CREATED}" \
    org.opencontainers.image.revision="${IMAGE_REVISION}" \
    org.opencontainers.image.version="${IMAGE_VERSION}" \
    org.opencontainers.image.source="${IMAGE_SOURCE}" \
    org.opencontainers.image.vendor="OVHcloud" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.base.name="alpine:3.22"

RUN apk add --no-cache \
    bash \
    ca-certificates \
    curl \
    docker-cli \
    docker-cli-compose \
    git \
    sqlite \
    tar

COPY docker-images/gamepanel/updater/update-runner.sh /usr/local/bin/gamepanel-update-runner
RUN mkdir -p /usr/local/lib/gamepanel
COPY deploy/lib/update-common.sh /usr/local/lib/gamepanel/update-common.sh

RUN chmod 0555 /usr/local/bin/gamepanel-update-runner \
    && chmod 0444 /usr/local/lib/gamepanel/update-common.sh

ENTRYPOINT ["/usr/local/bin/gamepanel-update-runner"]

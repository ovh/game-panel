ARG JAVA_VERSION=25

FROM eclipse-temurin:${JAVA_VERSION}-jre

ARG JAVA_VERSION
ARG IMAGE_CREATED="unknown"
ARG IMAGE_REVISION="unknown"
ARG IMAGE_VERSION="dev"
ARG IMAGE_SOURCE="https://github.com/ovh/game-panel"

LABEL org.opencontainers.image.title="Minecraft Fabric Server Image" \
      org.opencontainers.image.description="Game Panel image for Minecraft Fabric servers." \
      org.opencontainers.image.created="${IMAGE_CREATED}" \
      org.opencontainers.image.revision="${IMAGE_REVISION}" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.source="${IMAGE_SOURCE}" \
      org.opencontainers.image.vendor="OVHcloud" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.base.name="eclipse-temurin:${JAVA_VERSION}-jre"

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      jq \
      netcat-openbsd \
      ca-certificates \
      tar \
      && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY fabric/docker-entrypoint.sh /app/docker-entrypoint.sh
COPY shared/scripts/common.sh /app/common.sh
COPY shared/scripts/launcher.sh /app/launcher.sh
COPY shared/scripts/send-command.sh /app/send-command.sh
COPY shared/scripts/backup.sh /app/backup.sh
COPY shared/scripts/restore.sh /app/restore.sh
COPY shared/scripts/healthcheck.sh /app/healthcheck.sh

RUN chmod 0555 /app/*.sh \
      && groupadd --gid 10001 gameserver \
      && useradd --uid 10001 --gid gameserver --create-home --home-dir /home/gameserver --shell /usr/sbin/nologin gameserver \
      && mkdir -p /run/minecraft /data /backups \
      && chown -R gameserver:gameserver /run/minecraft /data /backups /home/gameserver

ENV HOME=/home/gameserver
ENV GAMESERVER_SERVER_TYPE=fabric

EXPOSE 25565

USER gameserver:gameserver

HEALTHCHECK --interval=10s --timeout=3s --start-period=180s --retries=3 CMD ["/app/healthcheck.sh"]

ENTRYPOINT ["/app/docker-entrypoint.sh"]

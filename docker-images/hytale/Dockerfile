FROM gradle:9-jdk25 AS credential-store-build

ARG IMAGE_VERSION="dev"

WORKDIR /workspace

COPY credential-store/settings.gradle.kts credential-store/build.gradle.kts ./
COPY credential-store/src ./src

RUN gradle --no-daemon build -PpluginVersion="${IMAGE_VERSION}"

FROM eclipse-temurin:25-jre

ARG IMAGE_CREATED="unknown"
ARG IMAGE_REVISION="unknown"
ARG IMAGE_VERSION="dev"
ARG IMAGE_SOURCE="https://github.com/ovh/game-panel"

LABEL org.opencontainers.image.title="Hytale Server Image" \
      org.opencontainers.image.description="Game Panel runtime image for Hytale dedicated servers." \
      org.opencontainers.image.created="${IMAGE_CREATED}" \
      org.opencontainers.image.revision="${IMAGE_REVISION}" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.source="${IMAGE_SOURCE}" \
      org.opencontainers.image.vendor="OVHcloud" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.base.name="eclipse-temurin:25-jre"

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      iproute2 \
      jq \
      zip \
      unzip \
      && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
COPY common.sh /app/common.sh
COPY launcher.sh /app/launcher.sh
COPY send-command.sh /app/send-command.sh
COPY restore.sh /app/restore.sh
COPY healthcheck.sh /app/healthcheck.sh
COPY --from=credential-store-build /workspace/build/libs/gamepanel-hytale-credential-store.jar /app/gamepanel-hytale-credential-store.jar

RUN chmod 0555 /app/*.sh \
      && groupadd --gid 10001 gameserver \
      && useradd --uid 10001 --gid gameserver --create-home --home-dir /home/gameserver --shell /usr/sbin/nologin gameserver \
      && mkdir -p /run/hytale /data \
      && chown -R gameserver:gameserver /run/hytale /data /home/gameserver

ENV HOME=/home/gameserver
ENV DATA_DIR=/data
ENV HYTALE_GAME_DIR=/data/game
ENV HYTALE_SERVER_DIR=/data/game/Server
ENV HYTALE_GAMEPANEL_PLUGIN_JAR=/app/gamepanel-hytale-credential-store.jar
ENV RUNTIME_DIR=/run/hytale
ENV GAMESERVER_SERVER_TYPE=hytale

EXPOSE 5520/udp

USER gameserver:gameserver

HEALTHCHECK --interval=10s --timeout=3s --start-period=180s --retries=3 CMD ["/app/healthcheck.sh"]

ENTRYPOINT ["/app/docker-entrypoint.sh"]

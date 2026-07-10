FROM ubuntu:24.04

ARG IMAGE_CREATED="unknown"
ARG IMAGE_REVISION="unknown"
ARG IMAGE_VERSION="dev"
ARG IMAGE_SOURCE="https://github.com/ovh/game-panel"

LABEL org.opencontainers.image.title="Palworld Server Image" \
   org.opencontainers.image.description="Game Panel image for Palworld dedicated servers." \
   org.opencontainers.image.created="${IMAGE_CREATED}" \
   org.opencontainers.image.revision="${IMAGE_REVISION}" \
   org.opencontainers.image.version="${IMAGE_VERSION}" \
   org.opencontainers.image.source="${IMAGE_SOURCE}" \
   org.opencontainers.image.vendor="OVHcloud" \
   org.opencontainers.image.licenses="Apache-2.0" \
   org.opencontainers.image.base.name="ubuntu:24.04"

ENV DEBIAN_FRONTEND=noninteractive

RUN dpkg --add-architecture i386 \
   && apt-get update \
   && apt-get install -y --no-install-recommends \
   ca-certificates \
   curl \
   iproute2 \
   jq \
   lib32gcc-s1 \
   lib32stdc++6 \
   libicu74 \
   netcat-openbsd \
   tar \
   unzip \
   && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 10001 gameserver \
   && useradd --uid 10001 --gid gameserver --create-home --home-dir /home/gameserver --shell /usr/sbin/nologin gameserver \
   && mkdir -p /opt/steamcmd /run/palworld /data \
   && curl -fsSL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" \
   | tar -xz -C /opt/steamcmd \
   && ( /opt/steamcmd/steamcmd.sh +login anonymous +quit || true ) \
   && test -f /opt/steamcmd/linux64/steamclient.so \
   && chown -R gameserver:gameserver /opt/steamcmd /run/palworld /data /home/gameserver

WORKDIR /app

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
COPY common.sh /app/common.sh
COPY launcher.sh /app/launcher.sh
COPY healthcheck.sh /app/healthcheck.sh
COPY restore.sh /app/restore.sh
COPY send-command.sh /app/send-command.sh
COPY backup.sh /app/backup.sh

RUN chmod 0555 /app/*.sh

ENV HOME=/home/gameserver
ENV DATA_DIR=/data
ENV PALWORLD_INSTALL_DIR=/data/server
ENV RUNTIME_DIR=/run/palworld
ENV STEAMCMD_DIR=/opt/steamcmd
ENV GAMESERVER_SERVER_TYPE=palworld

EXPOSE 8211/udp
EXPOSE 27015/udp
EXPOSE 8212/tcp

USER gameserver:gameserver

HEALTHCHECK --interval=10s --timeout=3s --start-period=20m --retries=3 CMD ["/app/healthcheck.sh"]

ENTRYPOINT ["/app/docker-entrypoint.sh"]

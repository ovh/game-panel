FROM ubuntu:24.04

ARG IMAGE_CREATED="unknown"
ARG IMAGE_REVISION="unknown"
ARG IMAGE_VERSION="dev"
ARG IMAGE_SOURCE="https://github.com/ovh/game-panel"

LABEL org.opencontainers.image.title="Garry's Mod Server Image" \
   org.opencontainers.image.description="Game Panel image for Garry's Mod dedicated servers." \
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
   && apt-get upgrade -y \
   && apt-get install -y --no-install-recommends \
   ca-certificates \
   curl \
   lib32gcc-s1 \
   lib32stdc++6 \
   libcurl4t64 \
   libcurl4t64:i386 \
   libtinfo6 \
   libtinfo6:i386 \
   netcat-openbsd \
   tar \
   && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 10001 gameserver \
   && useradd --uid 10001 --gid gameserver --create-home --home-dir /home/gameserver --shell /usr/sbin/nologin gameserver \
   && mkdir -p /opt/steamcmd /run/garrys-mod /data \
   && curl -fsSL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" \
   | tar -xz -C /opt/steamcmd \
   && ( /opt/steamcmd/steamcmd.sh +login anonymous +quit || true ) \
   && test -f /opt/steamcmd/linux64/steamclient.so \
   && chown -R gameserver:gameserver /opt/steamcmd /run/garrys-mod /data /home/gameserver

WORKDIR /app

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
COPY common.sh /app/common.sh
COPY launcher.sh /app/launcher.sh
COPY send-command.sh /app/send-command.sh
COPY healthcheck.sh /app/healthcheck.sh

RUN chmod 0555 /app/*.sh

ENV HOME=/home/gameserver
ENV DATA_DIR=/data
ENV GMOD_INSTALL_DIR=/data/server
ENV RUNTIME_DIR=/run/garrys-mod
ENV STEAMCMD_DIR=/opt/steamcmd
ENV GAMESERVER_SERVER_TYPE=garrys-mod

EXPOSE 27015/tcp
EXPOSE 27015/udp

USER gameserver:gameserver

HEALTHCHECK --interval=15s --timeout=5s --start-period=30m --retries=3 CMD ["/app/healthcheck.sh"]

ENTRYPOINT ["/app/docker-entrypoint.sh"]

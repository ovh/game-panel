FROM ubuntu:24.04

ARG IMAGE_CREATED="unknown"
ARG IMAGE_REVISION="unknown"
ARG IMAGE_VERSION="dev"
ARG IMAGE_SOURCE="https://github.com/ovh/game-panel"
ARG WEBSOCAT_VERSION=v1.14.1

LABEL org.opencontainers.image.title="Rust Server Image" \
   org.opencontainers.image.description="Game Panel image for Rust dedicated servers." \
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
   iproute2 \
   jq \
   lib32gcc-s1 \
   lib32stdc++6 \
   tar \
   unzip \
   && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 10001 gameserver \
   && useradd --uid 10001 --gid gameserver --create-home --home-dir /home/gameserver --shell /usr/sbin/nologin gameserver \
   && mkdir -p /opt/steamcmd /run/rust /data /backups \
   && curl -fsSL "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz" \
   | tar -xz -C /opt/steamcmd \
   && ( /opt/steamcmd/steamcmd.sh +login anonymous +quit || true ) \
   && test -f /opt/steamcmd/linux64/steamclient.so \
   && chown -R gameserver:gameserver /opt/steamcmd /run/rust /data /backups /home/gameserver

RUN curl -fsSL "https://github.com/vi/websocat/releases/download/${WEBSOCAT_VERSION}/websocat.x86_64-unknown-linux-musl" \
   -o /usr/local/bin/websocat \
   && chmod 0555 /usr/local/bin/websocat

WORKDIR /app

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
COPY common.sh /app/common.sh
COPY launcher.sh /app/launcher.sh
COPY healthcheck.sh /app/healthcheck.sh
COPY send-command.sh /app/send-command.sh
COPY backup.sh /app/backup.sh
COPY restore.sh /app/restore.sh
COPY install-oxide.sh /app/install-oxide.sh

RUN chmod 0555 /app/*.sh

ENV HOME=/home/gameserver
ENV DATA_DIR=/data
ENV RUST_INSTALL_DIR=/data/server
ENV BACKUP_DIR=/backups
ENV RUNTIME_DIR=/run/rust
ENV STEAMCMD_DIR=/opt/steamcmd
ENV GAMESERVER_SERVER_TYPE=rust

EXPOSE 28015/udp
EXPOSE 28017/udp
EXPOSE 28016/tcp
EXPOSE 28082/tcp

USER gameserver:gameserver

HEALTHCHECK --interval=15s --timeout=5s --start-period=20m --retries=3 CMD ["/app/healthcheck.sh"]

ENTRYPOINT ["/app/docker-entrypoint.sh"]

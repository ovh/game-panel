#!/usr/bin/env bash
# OVHcloud Game Panel: FastDL for Call of Duty 4 (mods and custom maps download over HTTP).
#  - Every CoD4 server has its own FastDL, by server number: /var/www/html/cod4/<server>/(mods|usermaps)/...,
#    served at http://<panel domain>:8080/cod4/<server> (server 5: http://ovh.cod4x.org:8080/cod4/5).
#    The same files over HTTPS for browsers: https://<panel domain>/fastdl/<server>/... (the game uses the HTTP link).
#  - Sync: the service gamepanel-fastdl watches every CoD4 server and keeps its folder up to date by itself: new or
#    changed .ff / .iwd files appear within seconds, deleted ones disappear; a new server gets its folder on its own.
#    Only .ff and .iwd files are published (never configs). Big files are hard links (no extra disk space).
#    Opening the address or a folder in a browser gives 403: only the game files themselves can be downloaded.
# Usage (as root):
#   bash gp-fastdl.sh                 install / update (safe to run again)
#   FASTDL_PORT=8090 bash gp-fastdl.sh   another port
#   FASTDL_HOST=fastdl.example.org bash gp-fastdl.sh   another host name in the URL (default: the panel's domain)
#   bash gp-fastdl.sh --remove        remove the service and the web server (the folder stays)
set -euo pipefail
cd /
APP_ROOT="${GP_APP_ROOT:-/opt/gamepanel}"
WEB_ROOT="${FASTDL_ROOT:-/var/www/html}"
DIR="$WEB_ROOT/cod4"
PORT="${FASTDL_PORT:-8080}"
LIB=/usr/local/lib/gamepanel-fastdl
# state in the panel's data folder, so the panel can show it (Command line card > FastDL)
STATE="$APP_ROOT/data/fastdl"
ETC=/etc/gamepanel-fastdl
NAME=gamepanel-fastdl
IMAGE=nginx:1.27-alpine
[[ $EUID -eq 0 ]] || { echo "Pokreni kao root: sudo bash $0"; exit 1; }
SYSTEMCTL="${GP_SYSTEMCTL:-systemctl}"

if [[ ${1:-} == --remove ]]; then
  $SYSTEMCTL disable --now $NAME >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/$NAME.service; $SYSTEMCTL daemon-reload || true
  docker rm -f $NAME >/dev/null 2>&1 || true
  echo "FastDL uklonjen. Datoteke su ostale u $DIR (obriši ih ručno ako ih ne trebaš)."
  exit 0
fi

[[ $PORT =~ ^[0-9]+$ && $PORT -ge 1 && $PORT -le 65535 ]] || { echo "Neispravan port: $PORT"; exit 1; }
command -v python3 >/dev/null || { apt-get update -qq && apt-get install -y -qq python3; }
command -v docker >/dev/null || { echo "Docker nije instaliran"; exit 1; }
# the port must be free (or already ours)
if ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q . && [[ -z "$(docker ps -q -f name=^$NAME$)" ]]; then
  echo "Port $PORT je zauzet. Odaberi drugi: FASTDL_PORT=8090 bash $0"; exit 1
fi
mkdir -p "$DIR" "$LIB" "$STATE" "$ETC/certs"

# the panel's domain and Traefik: HTTPS for browsers (https://<domain>/fastdl and https on the FastDL port itself,
# with the panel's Let's Encrypt certificate, which the service keeps up to date)
DOMAIN="$(grep -E '^DOMAIN=' "$APP_ROOT/deploy/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d "\"' ")"
traefik="$(docker ps -q --filter label=com.docker.compose.project=gamepanel --filter label=com.docker.compose.service=traefik | head -1)"
EDGE=""; ACME=""
if [[ -n $traefik ]]; then
  EDGE="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$traefik" | awk '{print $1}')"
  le="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/letsencrypt"}}{{.Source}}{{end}}{{end}}' "$traefik")"
  [[ -n $le ]] && ACME="$le/acme.json"
fi

# ---- 1) the sync service ----------------------------------------------------------------------------------------
cat > "$LIB/gp-fastdl-sync.py" <<'PY'
#!/usr/bin/env python3
"""Keeps the FastDL folders in step with the CoD4 servers, one folder per server (by server number):
<target>/<server>/mods/<mod>/*.ff|*.iwd and <target>/<server>/usermaps/<map>/*.ff|*.iwd.
Sources: every server folder with CoD4X (servers/<server>/data/serverfiles).
Files are hard links where possible (same disk), copies otherwise. Only files this service created are ever deleted."""
import json, os, shutil, sys, time

APP_ROOT = os.environ.get('GP_APP_ROOT', '/opt/gamepanel')
TARGET = os.environ.get('FASTDL_DIR', '/var/www/html/cod4')
STATE = os.environ.get('FASTDL_STATE', '/opt/gamepanel/data/fastdl')
INTERVAL = float(os.environ.get('FASTDL_INTERVAL', '10'))
EXTENSIONS = ('.ff', '.iwd')
SECTIONS = ('mods', 'usermaps')
MANIFEST = os.path.join(STATE, 'manifest.json')
# the panel's "Sync now" button leaves this file; the service syncs at once and writes the result to status.json
REQUEST = os.path.join(STATE, 'sync-request')
STATUS = os.path.join(STATE, 'status.json')

def sources():
    """server number -> its serverfiles folder"""
    servers = os.path.join(APP_ROOT, 'servers')
    found = {}
    for key in sorted(os.listdir(servers)) if os.path.isdir(servers) else []:
        root = os.path.join(servers, key, 'data', 'serverfiles')
        if key.replace('-', '').replace('_', '').isalnum() and os.path.isfile(os.path.join(root, 'cod4x18_dedrun')):
            found[key] = root
    return found

def wanted():
    """rel path (<server>/mods/... or <server>/usermaps/...) -> source file"""
    result = {}
    for key, root in sources().items():
        for section in SECTIONS:
            base = os.path.join(root, section)
            if not os.path.isdir(base):
                continue
            for name in os.listdir(base):
                folder = os.path.join(base, name)
                if not os.path.isdir(folder) or name.startswith('.'):
                    continue
                for d, dirs, files in os.walk(folder):
                    dirs[:] = [x for x in dirs if not x.startswith('.')]
                    for f in files:
                        if not f.lower().endswith(EXTENSIONS):
                            continue
                        src = os.path.join(d, f)
                        if os.path.islink(src) or not os.path.isfile(src):
                            continue
                        result[os.path.join(key, os.path.relpath(src, root))] = src
    return result

def same(src, dst):
    try:
        a, b = os.stat(src), os.stat(dst)
    except FileNotFoundError:
        return False
    return (a.st_dev, a.st_ino) == (b.st_dev, b.st_ino) or (a.st_size == b.st_size and int(a.st_mtime) == int(b.st_mtime))

def publish(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + '.gp-tmp'
    if os.path.lexists(tmp):
        os.remove(tmp)
    try:
        os.link(src, tmp)  # same file as the server's: no extra disk space, changes show up by themselves
    except OSError:
        shutil.copy2(src, tmp)  # another disk: a copy, readable by the web server
        os.chmod(tmp, 0o644)
    os.replace(tmp, dst)

def load_manifest():
    try:
        return set(json.load(open(MANIFEST)))
    except Exception:
        return set()

def save_manifest(paths):
    tmp = MANIFEST + '.tmp'
    json.dump(sorted(paths), open(tmp, 'w'))
    os.replace(tmp, MANIFEST)

def prune(path):
    d = os.path.dirname(path)
    while d.startswith(TARGET + os.sep) and d != TARGET:
        try:
            os.rmdir(d)
        except OSError:
            return
        d = os.path.dirname(d)

def sync_once():
    want = wanted()
    owned = load_manifest()
    added = removed = 0
    for rel, src in want.items():
        dst = os.path.join(TARGET, rel)
        if not same(src, dst):
            try:
                publish(src, dst)
                added += 1
            except OSError as e:
                print('cannot publish %s: %s' % (rel, e), flush=True)
                continue
        owned.add(rel)
    for rel in sorted(owned - set(want)):
        dst = os.path.join(TARGET, rel)
        try:
            os.remove(dst)
        except FileNotFoundError:
            pass
        prune(dst)
        owned.discard(rel)
        removed += 1
    save_manifest(owned)
    return added, removed, len(want)

# HTTPS on the FastDL port: the panel's certificate from Traefik's acme.json, refreshed when Traefik renews it
ACME = os.environ.get('FASTDL_ACME', '')
DOMAIN = os.environ.get('FASTDL_DOMAIN', '')
CERTS = os.environ.get('FASTDL_CERTS', '/etc/gamepanel-fastdl/certs')
CONTAINER = os.environ.get('FASTDL_CONTAINER', 'gamepanel-fastdl')
CERT_EVERY = 600
_cert_checked = 0.0

def refresh_cert(force=False):
    global _cert_checked
    if not ACME or not DOMAIN or (not force and time.time() - _cert_checked < CERT_EVERY):
        return False
    _cert_checked = time.time()
    import base64, subprocess
    try:
        data = json.load(open(ACME))
    except Exception:
        return False
    for resolver in data.values():
        for item in (resolver or {}).get('Certificates') or []:
            names = [item.get('domain', {}).get('main', '')] + list(item.get('domain', {}).get('sans') or [])
            if DOMAIN not in names:
                continue
            cert, key = base64.b64decode(item['certificate']), base64.b64decode(item['key'])
            crt_path, key_path = os.path.join(CERTS, 'fastdl.crt'), os.path.join(CERTS, 'fastdl.key')
            try:
                if open(crt_path, 'rb').read() == cert:
                    return False
            except FileNotFoundError:
                pass
            os.makedirs(CERTS, exist_ok=True)
            for path, content, mode in ((key_path, key, 0o600), (crt_path, cert, 0o644)):
                tmp = path + '.tmp'
                with open(tmp, 'wb') as f:
                    f.write(content)
                os.chmod(tmp, mode)
                os.replace(tmp, path)
            subprocess.run(['docker', 'exec', CONTAINER, 'nginx', '-s', 'reload'], capture_output=True)
            print('fastdl: HTTPS certificate for %s updated' % DOMAIN, flush=True)
            return True
    return False

def write_status(**values):
    tmp = STATUS + '.tmp'
    json.dump(dict(values, time=time.time()), open(tmp, 'w'))
    os.replace(tmp, STATUS)

def main():
    os.makedirs(TARGET, exist_ok=True)
    os.makedirs(STATE, exist_ok=True)
    once = '--once' in sys.argv
    while True:
        requested = os.path.exists(REQUEST)
        if requested:
            try:
                os.remove(REQUEST)
            except FileNotFoundError:
                pass
        try:
            refresh_cert(force=once)
        except Exception as e:
            print('fastdl: certificate update failed: %s' % e, flush=True)
        try:
            added, removed, total = sync_once()
            write_status(ok=True, total=total, added=added, removed=removed)
            if added or removed or once or requested:
                print('fastdl: %d files (%d new or changed, %d removed)%s' % (total, added, removed, ' [sync now]' if requested else ''), flush=True)
        except Exception as e:
            write_status(ok=False, error=str(e))
            print('fastdl sync failed: %s' % e, flush=True)
            if once:
                sys.exit(1)
        if once:
            return
        # wait for the next round, or less when the panel asks for a sync
        waited = 0.0
        while waited < INTERVAL and not os.path.exists(REQUEST):
            time.sleep(0.5)
            waited += 0.5

if __name__ == '__main__':
    main()
PY
chmod 755 "$LIB/gp-fastdl-sync.py"
cat > /etc/systemd/system/$NAME.service <<UNIT
[Unit]
Description=Game Panel FastDL sync (CoD4 mods and maps to $DIR)
After=network.target

[Service]
Environment=GP_APP_ROOT=$APP_ROOT FASTDL_DIR=$DIR FASTDL_STATE=$STATE FASTDL_ACME=$ACME FASTDL_DOMAIN=$DOMAIN FASTDL_CERTS=$ETC/certs FASTDL_CONTAINER=$NAME
ExecStart=/usr/bin/python3 $LIB/gp-fastdl-sync.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
echo "== Prva sinkronizacija"
GP_APP_ROOT=$APP_ROOT FASTDL_DIR=$DIR FASTDL_STATE=$STATE FASTDL_ACME=$ACME FASTDL_DOMAIN=$DOMAIN FASTDL_CERTS=$ETC/certs \
  python3 "$LIB/gp-fastdl-sync.py" --once
# no certificate from Traefik (yet): a self-signed one, so the HTTPS side can start; the service swaps in the real one
if [[ ! -s $ETC/certs/fastdl.crt ]]; then
  command -v openssl >/dev/null || { apt-get update -qq && apt-get install -y -qq openssl; }
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -subj "/CN=${DOMAIN:-fastdl}" \
    -keyout "$ETC/certs/fastdl.key" -out "$ETC/certs/fastdl.crt" >/dev/null 2>&1
  echo "== HTTPS certifikat iz Traefika nije pronađen, privremeno vlastiti (servis ga zamijeni kad se pojavi)"
fi
$SYSTEMCTL daemon-reload
$SYSTEMCTL enable $NAME >/dev/null 2>&1
$SYSTEMCTL restart $NAME

# ---- 2) the web server ------------------------------------------------------------------------------------------
# One port for both: the game speaks plain HTTP, browsers (which insist on HTTPS for the panel's domain, HSTS) speak TLS.
# The stream part looks at the first bytes and passes TLS to the HTTPS server, the rest to the HTTP server.
# 8082 is the plain HTTP server for the panel's Traefik (https://<domain>/fastdl/...).
cat > "$ETC/nginx.conf" <<'NGINX'
worker_processes auto;
events { worker_connections 1024; }

stream {
    map $ssl_preread_protocol $fastdl_backend {
        ""      127.0.0.1:8081;
        default 127.0.0.1:8443;
    }
    server {
        listen 80;
        ssl_preread on;
        proxy_pass $fastdl_backend;
    }
}

http {
    sendfile on;
    server_tokens off;
    access_log off;

    server {
        listen 127.0.0.1:8081;
        listen 8082;
        include /etc/nginx/fastdl-locations.conf;
    }
    server {
        listen 127.0.0.1:8443 ssl;
        ssl_certificate /etc/nginx/certs/fastdl.crt;
        ssl_certificate_key /etc/nginx/certs/fastdl.key;
        include /etc/nginx/fastdl-locations.conf;
    }
}
NGINX
cat > "$ETC/fastdl-locations.conf" <<'NGINX'
root /usr/share/nginx/html;
autoindex off;
# only the game files themselves can be downloaded; folders, listings and anything else: 403
location / {
    return 403;
}
location ~* ^/cod4/[A-Za-z0-9_-]+/(mods|usermaps)/[^/]+/.+\.(ff|iwd)$ {
    limit_except GET HEAD { deny all; }
    types { }
    default_type application/octet-stream;
    try_files $uri =404;
}
NGINX
docker image inspect $IMAGE >/dev/null 2>&1 || docker pull -q $IMAGE >/dev/null
docker rm -f $NAME >/dev/null 2>&1 || true
# HTTPS for browsers too: the panel's Traefik (with its certificate) passes https://<panel domain>/fastdl/... on to the
# same web server (as /cod4/...). The game keeps using plain HTTP on $PORT.
labels=()
if [[ -n $DOMAIN && -n $EDGE ]]; then
  labels=(--label traefik.enable=true
    --label "traefik.http.routers.gamepanel_fastdl.rule=Host(\`$DOMAIN\`) && PathPrefix(\`/fastdl/\`)"
    --label traefik.http.routers.gamepanel_fastdl.entrypoints=websecure
    --label traefik.http.routers.gamepanel_fastdl.tls=true
    --label traefik.http.routers.gamepanel_fastdl.tls.certresolver=le
    --label traefik.http.routers.gamepanel_fastdl.middlewares=gamepanel_fastdl_path
    --label 'traefik.http.middlewares.gamepanel_fastdl_path.replacepathregex.regex=^/fastdl/(.*)'
    --label 'traefik.http.middlewares.gamepanel_fastdl_path.replacepathregex.replacement=/cod4/$1'
    --label traefik.http.services.gamepanel_fastdl.loadbalancer.server.port=8082)
fi
docker run -d --name $NAME --restart unless-stopped -p "$PORT:80" "${labels[@]}" \
  -v "$WEB_ROOT:/usr/share/nginx/html:ro" -v "$ETC/nginx.conf:/etc/nginx/nginx.conf:ro" \
  -v "$ETC/fastdl-locations.conf:/etc/nginx/fastdl-locations.conf:ro" -v "$ETC/certs:/etc/nginx/certs:ro" $IMAGE >/dev/null
if [[ ${#labels[@]} -gt 0 ]]; then
  docker network connect "$EDGE" $NAME
  browser_url="https://$DOMAIN/fastdl"
else
  browser_url=""
  echo "== HTTPS preskočen (panelov Traefik ili DOMAIN nije pronađen); igra radi preko HTTP-a"
fi
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "$PORT/tcp" >/dev/null && echo "== Firewall (ufw): port $PORT otvoren"
fi

# ---- 3) how to use it -------------------------------------------------------------------------------------------
# the panel's domain (DOMAIN in deploy/.env, e.g. ovh.cod4x.org); FASTDL_HOST=... for another name
host="${FASTDL_HOST:-$(grep -E '^DOMAIN=' "$APP_ROOT/deploy/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d "\"' ")}"
[[ -n $host ]] || host="$(curl -4fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
url="http://$host:$PORT/cod4"
echo "{\"url\": \"$url\", \"browserUrl\": \"$browser_url\"}" > "$STATE/fastdl.json"
sleep 1
test_file="$(cd "$DIR" && find . -type f \( -name '*.ff' -o -name '*.iwd' \) | head -1)"
if [[ -n $test_file ]]; then
  code="$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/cod4/${test_file#./}" || true)"
  [[ $code == 200 ]] && echo "== Web server radi (test: ${test_file#./})" || echo "== Web server ne odgovara (kod $code): docker logs $NAME"
fi
echo
echo "Gotovo. FastDL: $url"
echo "Svaki CoD4 server ima svoj FastDL po broju servera:"
for d in "$DIR"/*/; do
  [[ -d $d ]] || continue
  k="$(basename "$d")"; [[ $k == mods || $k == usermaps ]] && continue
  echo "  server $k: $url/$k   (mods: $(ls "$d/mods" 2>/dev/null | wc -l), usermaps: $(ls "$d/usermaps" 2>/dev/null | wc -l))"
done
echo "Sinkronizacija svakih 10 s (servis $NAME), log: journalctl -u $NAME -f"
echo "Isti link radi i u pregledniku (preglednik ga otvori kao https, port $PORT to prihvaća s certifikatom panela)."
[[ -n $browser_url ]] && echo "Ili bez porta: $browser_url/<broj servera>/mods/<mod>/mod.ff"
echo
echo "Uključi ga po serveru u panelu: Settings > Game config > Command line > FastDL > Save, pa restart."
echo "(Novi CoD4 serveri ga dobiju uključenog već pri instalaciji.)"

#!/usr/bin/env python3
"""Builds install/gp-cod4-linux.sh: CoD4 servers installed from the cod4-linux folder and a local image, no download.
All files are embedded. A panel file is replaced only when it is in a known state (Game Panel 1.6.0 or one of the
versions in this repository's history); index.ts and api.ts get small insertions (other installers change them too)."""
import base64, hashlib, os, subprocess

ROOT = os.environ.get('ROOT', os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
OUT = os.environ.get('OUT', os.path.join(ROOT, 'cod4', 'install', 'gp-cod4-linux.sh'))
PRISTINE = os.environ.get('PRISTINE', 'ef90e58')   # Game Panel 1.6.0
FILES = {
    'backend': ['src/providers/linuxgsm/adapters/cod4/index.ts', 'src/providers/linuxgsm/adapters/registry.ts',
                'src/providers/linuxgsm/adapters/types.ts', 'src/providers/linuxgsm/installSpec.ts',
                'src/services/servers.ts', 'src/routes/cod4.ts', 'src/providers/installTypes.ts',
                'src/routes/users.ts', 'src/database/repositories/userRepository.ts', 'src/routes/news.ts',
                # theme and panel name (formerly gp-neon-theme.sh), Admin page
                'src/routes/branding.ts', 'src/routes/admin.ts',
                'src/services/cod4/tools.ts', 'src/services/cod4/b3db.ts', 'src/services/cod4/settings.ts', 'src/services/cod4/backups.ts',
                'src/services/cod4/b3install.ts', 'src/services/cod4/cert.ts', 'src/middleware/activityLog.ts',
                'src/services/players/probe.ts'],
    'frontend': ['components/InstallGameServer.tsx', 'components/serverSettings/Cod4ModSection.tsx',
                 'components/UserAdministration.tsx', 'components/userAdministration/UsersPanel.tsx',
                 'components/NewsPanel.tsx', 'components/admin/AdminPage.tsx', 'components/admin/shared.tsx',
                 'components/admin/AdminLive.tsx', 'components/admin/AdminMaps.tsx', 'components/admin/AdminContent.tsx',
                 'components/admin/AdminB3.tsx', 'components/admin/AdminActivity.tsx', 'components/admin/AdminServerCfg.tsx',
                 'components/admin/AdminBackups.tsx', 'components/admin/AdminCod4Files.tsx', 'utils/adminApi.ts',
                 # theme and panel name (formerly gp-neon-theme.sh)
                 'main.tsx', 'App.tsx', 'components/Sidebar.tsx', 'components/Login.tsx', 'components/app/AppShell.tsx',
                 'contexts/ThemeContext.tsx', 'contexts/BrandingContext.tsx', 'src/ui/theme/neon.css'],
}

def git(*args):
    return subprocess.run(['git', '-C', ROOT, *args], capture_output=True, check=True).stdout

def git_show(rev, path):
    p = subprocess.run(['git', '-C', ROOT, 'show', '%s:%s' % (rev, path)], capture_output=True)
    return p.stdout if p.returncode == 0 else None

def b64(data):
    return base64.b64encode(data).decode()

def read(rel):
    return open(os.path.join(ROOT, rel), 'rb').read()

sha = lambda b: hashlib.sha256(b).hexdigest()
revs = [PRISTINE] + git('rev-list', '--reverse', '%s..HEAD' % PRISTINE).decode().split()
entries = []
for part, files in FILES.items():
    for f in files:
        rel = '%s/%s' % (part, f)
        final = read(rel)
        priors = sorted({sha(b) for b in (git_show(r, rel) for r in revs) if b is not None and b != final})
        entries.append((part, rel, b64(final), priors, git_show(PRISTINE, rel) is None))

py = ['import base64, hashlib, os, sys', 'root, backup = sys.argv[1], sys.argv[2]', 'files = [']
for e in entries:
    py.append('  (%r, %r, %r, %r, %r),' % e)
py += [
    ']',
    'sha = lambda b: hashlib.sha256(b).hexdigest()',
    'changed = set(); plan = []',
    'for part, rel, data, priors, new in files:',
    '    final = base64.b64decode(data); path = os.path.join(root, rel)',
    '    cur = open(path, "rb").read() if os.path.exists(path) else None',
    '    if cur == final: continue',
    '    if (cur is None and new) or (cur is not None and sha(cur) in priors):',
    '        plan.append((part, rel, path, final, cur))',
    '    else:',
    '        sys.exit("%s is different from the versions this script knows (Game Panel 1.6.0). Nothing was changed." % rel)',
    'for part, rel, path, final, cur in plan:',
    '    os.makedirs(os.path.join(backup, os.path.dirname(rel)), exist_ok=True)',
    '    open(os.path.join(backup, rel + (".orig" if cur is not None else ".new")), "wb").write(cur or b"")',
    '    os.makedirs(os.path.dirname(path), exist_ok=True)',
    '    open(path, "wb").write(final); changed.add(part)',
    'print(" ".join(sorted(changed)))',
]
replace_py = b64('\n'.join(py).encode() + b'\n')
patch_py = b64(read('cod4/tools/patches/patch_cod4_linux.py'))
dockerfile = b64(read('cod4/linuxgsm/Dockerfile'))
gamedig = b64(read('cod4/linuxgsm/check_gamedig.sh'))
sponsor = b64(read('cod4/linuxgsm/command_sponsor.sh'))

# same rule as the panel (adapters/cod4/index.ts): big files are hard links, small files and executables copies
# --relink: a server's files that are identical to the folder's become hard links (frees the disk space)
relink_py = b64('''import filecmp, os, sys
folder, server = sys.argv[1], sys.argv[2]
def is_program(path):
    with open(path, 'rb') as f:
        return f.read(4) == b'\\x7fELF'
count = saved = 0
for d, dirs, files in os.walk(server):
    for name in files:
        b = os.path.join(d, name)
        a = os.path.join(folder, os.path.relpath(b, server))
        if os.path.islink(b) or not os.path.isfile(a) or os.path.islink(a):
            continue
        sa, sb = os.stat(a), os.stat(b)
        if sa.st_ino == sb.st_ino or sa.st_size != sb.st_size or sb.st_size < 1048576 or is_program(b):
            continue
        if not filecmp.cmp(a, b, shallow=False):
            continue
        tmp = b + '.relink-tmp'
        os.link(a, tmp)
        os.replace(tmp, b)
        count += 1; saved += sb.st_size
print('%d datoteka povezano, oslobođeno %.1f GB' % (count, saved / 1024 ** 3))
'''.encode())

# --from: turns the given links into download URLs ("github <api url>" or "url <url>"), GitHub release pages included
resolve_py = b64(b'''import json, os, re, sys, urllib.request
token = os.environ.get('GH_TOKEN', '')
base = os.environ.get('GP_GITHUB_API', 'https://api.github.com')
def api(url):
    req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json'})
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    try:
        return json.load(urllib.request.urlopen(req, timeout=30))
    except Exception as e:
        sys.exit('GitHub: %s (%s). For a private repository: export GH_TOKEN=<token>' % (url, e))
for link in sys.argv[1:]:
    m = re.match(r'https://github\\.com/([^/]+)/([^/]+)/releases/(tag|download)/([^/]+)(?:/(.+))?$', link)
    if not m:
        print('url ' + link); continue
    owner, repo, kind, tag, name = m.groups()
    assets = api('%s/repos/%s/%s/releases/tags/%s' % (base, owner, repo, tag)).get('assets', [])
    if kind == 'download':
        assets = [a for a in assets if a['name'] == name]
    else:
        assets = sorted((a for a in assets if a['name'].startswith('cod4-linux.tar.part-')), key=lambda a: a['name'])
    for a in assets:
        print('github ' + a['url'])
''')

link_py = b64(b'''import os, shutil, sys
src, dst = sys.argv[1], sys.argv[2]
linked = copied = 0
def is_program(path):
    # Linux programs and libraries (ELF); game files often have the executable bit set too
    with open(path, 'rb') as f:
        return f.read(4) == b'\\x7fELF'
for d, dirs, files in os.walk(src):
    rel = os.path.relpath(d, src)
    dirs[:] = [x for x in dirs if not (rel == '.' and x == 'Logs')]
    os.makedirs(os.path.join(dst, rel), exist_ok=True)
    for x in [x for x in dirs if os.path.islink(os.path.join(d, x))]:
        os.symlink(os.readlink(os.path.join(d, x)), os.path.join(dst, rel, x)); dirs.remove(x)
    for name in files:
        a, b = os.path.join(d, name), os.path.join(dst, rel, name)
        if name.lower().endswith('.log') or '.log.' in name.lower():
            continue
        if os.path.islink(a):
            os.symlink(os.readlink(a), b); continue
        st = os.stat(a)
        if st.st_size >= 1048576 and not is_program(a):
            try:
                os.link(a, b); linked += 1; continue
            except OSError:
                pass
        shutil.copy2(a, b); copied += 1
print('%d linked, %d copied' % (linked, copied))
''')

script = r'''#!/usr/bin/env bash
# OVHcloud Game Panel: Call of Duty 4 servers are installed from your own files, nothing is downloaded (like TCAdmin).
#  - Game files: the folder /opt/gamepanel/cod4-linux (CoD4X: cod4x18_dedrun, main, zone, mods, usermaps ...).
#    A new server gets hard links to the big files (no extra disk space, ready in a second) and copies of the small
#    ones (configs). The install form checks the folder first and refuses to start the install if files are missing.
#  - LinuxGSM: a local image (gamepanel-local/cod4) with everything LinuxGSM would fetch from GitHub already inside.
# Usage (as root):
#   bash gp-cod4-linux.sh        set up / update the panel, the image and the folder, then show what is in it
#   bash gp-cod4-linux.sh 5      fill /opt/gamepanel/cod4-linux with the files of server 5 (replaces what is there)
#   bash gp-cod4-linux.sh --relink 8           server 8's files that are the same as the folder's become hard links
#   bash gp-cod4-linux.sh --pack [folder]       pack /opt/gamepanel/cod4-linux into parts of max 1.9 GB (default /root),
#                                               to keep them somewhere (a PRIVATE GitHub repo's release, your web server)
#   bash gp-cod4-linux.sh --from <link> [...]   fill the folder from those parts (replaces what is there):
#        a GitHub release page (https://github.com/<you>/<repo>/releases/tag/<tag>: all cod4-linux.tar.part-* files),
#        or the links of the parts in order. For a private GitHub repo first: export GH_TOKEN=<token with read access>
#   The CoD4 game files (main/*.iwd, zone/*.ff) are Activision's: never put them in a public repository.
# Safe to run again (also after a panel update, which removes the panel part).
set -euo pipefail
APP_ROOT="${GP_APP_ROOT:-/opt/gamepanel}"
# the current folder may have been deleted (docker compose then fails), so work from /
cd /
SRC="$APP_ROOT/app"
DEPLOY="$APP_ROOT/deploy"
FILES="$APP_ROOT/data/cod4-linux"
LINK="$APP_ROOT/cod4-linux"
KIT="$APP_ROOT/data/cod4-lgsm"
OLD_TPL="$APP_ROOT/data/templates/cod4"
BASE_IMAGE="${GP_COD4_BASE_IMAGE:-gameservermanagers/gameserver:cod4}"
IMAGE=gamepanel-local/cod4:latest
LGSM_RAW=https://raw.githubusercontent.com/GameServerManagers/LinuxGSM
[[ $EUID -eq 0 ]] || { echo "Pokreni kao root: sudo bash $0"; exit 1; }
[[ -d $SRC/frontend && -d $SRC/backend && -f $DEPLOY/compose.yml ]] || { echo "Game Panel nije pronađen u $APP_ROOT"; exit 1; }
command -v python3 >/dev/null || { apt-get update -qq && apt-get install -y -qq python3; }
dc(){ docker compose --project-name gamepanel --env-file "$DEPLOY/.env" -f "$DEPLOY/compose.yml" "$@"; }
nonempty(){ [[ -d $1 && -n "$(ls -A "$1" 2>/dev/null)" ]]; }

# ---- 1) the folder ----------------------------------------------------------------------------------------------
# real location in the panel's data folder (the panel sees it there), /opt/gamepanel/cod4-linux points to it
mkdir -p "$APP_ROOT/data"
if [[ -d $LINK && ! -L $LINK ]]; then
  if nonempty "$FILES"; then
    echo "I $LINK i $FILES imaju datoteke. Ostavi samo jedan od njih pa pokreni ponovno."; exit 1
  fi
  rm -rf "$FILES"; mv "$LINK" "$FILES"
  echo "== Folder $LINK premješten u $FILES"
fi
mkdir -p "$FILES"
if ! nonempty "$FILES" && nonempty "$OLD_TPL/serverfiles"; then
  find "$OLD_TPL/serverfiles" -mindepth 1 -maxdepth 1 -exec mv -t "$FILES" {} +
  echo "== Stari predložak ($OLD_TPL) premješten u $FILES"
fi
rm -rf "$OLD_TPL"; rmdir "$APP_ROOT/data/templates" 2>/dev/null || true
[[ -L $LINK ]] || ln -s "$FILES" "$LINK"

if [[ ${1:-} == --pack ]]; then
  out="${2:-/root}"; mkdir -p "$out"
  nonempty "$FILES" || { echo "$LINK je prazan, nema što pakirati"; exit 1; }
  rm -f "$out"/cod4-linux.tar.part-*
  echo "== Pakiram $LINK ($(du -sh "$FILES/" | cut -f1)) u $out ..."
  # no compression: .iwd and .ff files are compressed already
  tar -C "$APP_ROOT/data" --exclude='*.log' -cf - cod4-linux | split -b 1900M -d -a 2 - "$out/cod4-linux.tar.part-"
  ls -lh "$out"/cod4-linux.tar.part-* | awk '{print "   " $5 "  " $9}'
  echo
  echo "Spremi te datoteke negdje sigurno, npr. u release PRIVATNOG GitHub repozitorija (github.com/new -> Private,"
  echo "pa Releases -> Draft a new release -> povuci datoteke -> Publish). Ne u javni repo: datoteke igre su Activisionove."
  echo "Nakon reinstalacije:  export GH_TOKEN=<token>;  bash $0 --from https://github.com/<ti>/<repo>/releases/tag/<tag>"
  exit 0
fi

if [[ ${1:-} == --relink ]]; then
  k="${2:-}"
  [[ $k =~ ^[A-Za-z0-9_-]+$ ]] || { echo "Upotreba: bash $0 --relink <broj servera>"; exit 1; }
  src="$APP_ROOT/servers/$k/data/serverfiles"
  [[ -f $src/cod4x18_dedrun ]] || { echo "Server $k nema CoD4X datoteke ($src)"; exit 1; }
  nonempty "$FILES" || { echo "$LINK je prazan"; exit 1; }
  echo "== Server $k: iste datoteke kao u $LINK postaju hardlinkovi ..."
  echo '__RELINK_PY__' | base64 -d | python3 - "$FILES" "$src"
  exit 0
fi

if [[ ${1:-} == --from ]]; then
  shift
  (($#)) || { echo "Upotreba: bash $0 --from <link> [link ...]"; exit 1; }
  list="$(echo '__RESOLVE_PY__' | base64 -d | python3 - "$@")"
  [[ -n $list ]] || { echo "Na tom linku nema cod4-linux.tar.part-* datoteka"; exit 1; }
  echo "== Preuzimam $(wc -l <<<"$list") dio(va) i raspakiravam u $LINK ..."
  rm -rf "$FILES.new" "$FILES.old"; mkdir -p "$FILES.new"
  while read -r kind url; do
    if [[ $kind == github ]]; then
      curl -fsSL --retry 3 -H 'Accept: application/octet-stream' ${GH_TOKEN:+-H "Authorization: Bearer $GH_TOKEN"} "$url"
    else
      curl -fsSL --retry 3 "$url"
    fi
  done <<<"$list" | tar -x -C "$FILES.new"
  [[ -f $FILES.new/cod4-linux/cod4x18_dedrun ]] || { rm -rf "$FILES.new"; echo "Preuzeta arhiva nema cod4-linux/cod4x18_dedrun"; exit 1; }
  chmod -R a+rX "$FILES.new"
  mv "$FILES" "$FILES.old"; mv "$FILES.new/cod4-linux" "$FILES"; rm -rf "$FILES.new" "$FILES.old"
elif [[ -n ${1:-} ]]; then
  k="$1"
  [[ $k =~ ^[A-Za-z0-9_-]+$ ]] || { echo "Neispravan broj servera: $k"; exit 1; }
  src="$APP_ROOT/servers/$k/data/serverfiles"
  [[ -f $src/cod4x18_dedrun ]] || { echo "Server $k nema CoD4X datoteke ($src/cod4x18_dedrun)"; exit 1; }
  echo "== Punim $LINK datotekama servera $k ($(du -sh "$src" | cut -f1)) ..."
  rm -rf "$FILES.new" "$FILES.old"
  echo '__LINK_PY__' | base64 -d | python3 - "$src" "$FILES.new"
  chmod -R a+rX "$FILES.new"
  mv "$FILES" "$FILES.old"; mv "$FILES.new" "$FILES"
  # servers installed earlier keep their files (hard links), only the folder's own entries go
  rm -rf "$FILES.old"
fi

# ---- 2) the local image -----------------------------------------------------------------------------------------
docker image inspect "$BASE_IMAGE" >/dev/null 2>&1 || { echo "== Preuzimam $BASE_IMAGE (Docker Hub, samo jednom)"; docker pull -q "$BASE_IMAGE" >/dev/null; }
info="$(docker run --rm --entrypoint bash "$BASE_IMAGE" -c '. /etc/os-release; echo "$ID-$VERSION_ID"; sed -n "s/^version=\"\(.*\)\"/\1/p" /app/linuxgsm.sh | head -1')"
distro="$(sed -n 1p <<<"$info")"; lgsmver="$(sed -n 2p <<<"$info")"
mkdir -p "$KIT/data"
fetch(){ curl -fsSL --retry 2 "$LGSM_RAW/$lgsmver/$1" -o "$2" 2>/dev/null || curl -fsSL --retry 2 "$LGSM_RAW/master/$1" -o "$2"; }
first(){ for f in "$@"; do [[ -s $f ]] && { echo "$f"; return; }; done; true; }
# LinuxGSM's default CoD4 config and its dependency list: from one of your servers, else once from GitHub
if [[ ! -s $KIT/_default.cfg || "$(cat "$KIT/version" 2>/dev/null)" != "$lgsmver" ]]; then
  have="$(first "$APP_ROOT"/servers/*/data/config-lgsm/cod4server/_default.cfg)"
  if [[ ! -s $KIT/_default.cfg && -n $have ]]; then cp "$have" "$KIT/_default.cfg"
  else fetch lgsm/config-default/config-lgsm/cod4server/_default.cfg "$KIT/_default.cfg.new" && mv "$KIT/_default.cfg.new" "$KIT/_default.cfg"
  fi
  echo "$lgsmver" > "$KIT/version"
fi
if [[ ! -s $KIT/data/$distro.csv ]]; then
  have="$(first "$APP_ROOT"/servers/*/data/data/"$distro".csv)"
  if [[ -n $have ]]; then cp "$have" "$KIT/data/$distro.csv"; else fetch "lgsm/data/$distro.csv" "$KIT/data/$distro.csv"; fi
fi
ctx="$(mktemp -d)"
echo '__DOCKERFILE__' | base64 -d > "$ctx/Dockerfile"
echo '__GAMEDIG__' | base64 -d > "$ctx/check_gamedig.sh"
echo '__SPONSOR__' | base64 -d > "$ctx/command_sponsor.sh"
cp "$KIT/_default.cfg" "$ctx/_default.cfg"
build="$( { docker image inspect -f '{{.Id}}' "$BASE_IMAGE"; cat "$ctx"/*; } | sha256sum | cut -c1-16)"
if [[ "$(docker image inspect -f '{{index .Config.Labels "org.gamepanel.cod4.build"}}' "$IMAGE" 2>/dev/null || true)" != "$build" ]]; then
  echo "== Gradim lokalni image $IMAGE (LinuxGSM $lgsmver, $distro)"
  docker build -q --build-arg BASE="$BASE_IMAGE" --label org.gamepanel.cod4.build="$build" -t "$IMAGE" "$ctx" >/dev/null
else
  echo "== Lokalni image $IMAGE je aktualan"
fi
rm -rf "$ctx"

# ---- 3) the panel -----------------------------------------------------------------------------------------------
backup="$APP_ROOT/cod4-linux-backup-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$backup"
cp -p "$SRC/backend/src/index.ts" "$backup/index.ts.orig"; cp -p "$SRC/frontend/utils/api.ts" "$backup/api.ts.orig"
restore(){
  ( cd "$backup" && find . -type f ) | while read -r f; do
    f="${f#./}"
    case "$f" in
      index.ts.orig) cp -p "$backup/$f" "$SRC/backend/src/index.ts" ;;
      api.ts.orig) cp -p "$backup/$f" "$SRC/frontend/utils/api.ts" ;;
      *.orig) cp -p "$backup/$f" "$SRC/${f%.orig}" ;;
      *.new) rm -f "$SRC/${f%.new}" ;;
    esac
  done
  echo "Greška: izmjena panela vraćena (kopija u $backup)." >&2
}
trap 'rc=$?; ((rc)) && restore' EXIT
changed="$(echo '__REPLACE_PY__' | base64 -d | python3 - "$SRC" "$backup")"
changed="$changed $(echo '__PATCH_PY__' | base64 -d | python3 - "$SRC")"
if [[ -z ${changed// /} ]]; then
  echo "== Panel već ima sve CoD4 izmjene"
  rm -rf "$backup"
else
  if [[ $changed == *backend* ]]; then echo "== Gradim backend panela..."; dc build backend; dc up -d backend; fi
  if [[ $changed == *frontend* ]]; then echo "== Gradim sučelje panela (par minuta)..."; dc build frontend; dc up -d frontend; fi
fi
trap - EXIT

# ---- 4) what is in the folder -----------------------------------------------------------------------------------
echo
echo "Folder: $LINK  ($(du -sh "$FILES/" | cut -f1))"
ok=1
[[ -f $FILES/cod4x18_dedrun ]] && echo "  [OK]  cod4x18_dedrun" || { echo "  [--]  cod4x18_dedrun nedostaje"; ok=0; }
n="$( (find "$FILES/main" -maxdepth 1 -iname '*.iwd' 2>/dev/null || true) | wc -l)"
((n > 0)) && echo "  [OK]  main: $n .iwd datoteka" || { echo "  [--]  main s .iwd datotekama nedostaje"; ok=0; }
nonempty "$FILES/zone" && echo "  [OK]  zone" || { echo "  [--]  zone nedostaje"; ok=0; }
for d in mods usermaps; do nonempty "$FILES/$d" && echo "  [OK]  $d: $(ls "$FILES/$d" | wc -l)"; done
echo
if ((ok)); then
  echo "Gotovo. Novi CoD4 serveri se instaliraju iz ovog foldera, bez skidanja (ni LinuxGSM s GitHuba)."
else
  echo "Folder još nije spreman, panel neće dopustiti instalaciju CoD4 servera. Ubaci CoD4X datoteke u $LINK"
  echo "(npr. FTP-om ili: cp -a /putanja/do/cod4/. $LINK/) ili ga napuni s postojećeg servera: sudo bash $0 <broj servera>"
fi
echo "Postojeći serveri rade kao i prije. Nakon nadogradnje Game Panela ponovno pokreni: sudo bash $0"
'''
for key, value in {'__LINK_PY__': link_py, '__RELINK_PY__': relink_py, '__RESOLVE_PY__': resolve_py, '__DOCKERFILE__': dockerfile, '__GAMEDIG__': gamedig, '__SPONSOR__': sponsor,
                   '__REPLACE_PY__': replace_py, '__PATCH_PY__': patch_py}.items():
    script = script.replace(key, value)
open(OUT, 'w').write(script)
os.chmod(OUT, 0o755)
subprocess.run(['bash', '-n', OUT], check=True)
print('%s: %d bytes' % (OUT, len(script)))
for part, rel, _, priors, new in entries:
    print('  %-55s %s' % (rel, 'new' if new else '%d known prior state(s)' % len(priors)))

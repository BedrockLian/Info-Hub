#!/usr/bin/env bash
# Only Info-Hub containers/paths and the news vhost are managed here.
set -euo pipefail
mode=${1:-preflight}
release=${2:-}
root=/opt/infohub
nginx=/www/server/nginx/sbin/nginx
vhost=/www/server/panel/vhost/nginx/news.blian117.dpdns.org.conf
cert=/www/server/panel/vhost/cert/news.blian117.dpdns.org
[[ $(id -u) == 0 ]] || { echo 'Deployment requires the supplied root account'; exit 1; }
[[ $(hostname) == VM-0-4-opencloudos ]] || { echo 'Unexpected server; nothing changed'; exit 1; }
command -v docker >/dev/null
command -v curl >/dev/null
docker compose version >/dev/null
[[ -x $nginx && -f $vhost && -s $cert/fullchain.pem && -s $cert/privkey.pem ]]
$nginx -t
if [[ $mode == preflight ]]; then
  echo 'Preflight OK: Docker and the news vhost/certificate exist. Other applications are outside deployment scope.'
  exit 0
fi
[[ $mode == deploy && $release =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid deployment mode or release'; exit 1; }
archive=/root/infohub-incoming-$release.tar
[[ -f $archive ]]
# Never replace an unknown service on the intended loopback port.
if [[ -n $(ss -ltnH 'sport = :18082') ]]; then
  [[ -L $root/current ]] || { echo 'Port 18082 belongs to an unknown service; nothing changed'; exit 1; }
fi
mkdir -p "$root/releases/$release" "$root/shared/backups"
chmod 700 "$root/shared"
tar -xf "$archive" -C "$root/releases/$release"
cd "$root/releases/$release"
if [[ ! -f $root/shared/.env ]]; then
  docker run --rm -v "$PWD:/app" -w /app node:24-trixie-slim node scripts/init-env.ts --quiet
  mv .env "$root/shared/.env"
fi
chmod 600 "$root/shared/.env"
ln -sfn "$root/shared/.env" .env
export INFOHUB_RELEASE=$release
previous=$(readlink -f "$root/current" || true)
app_changed=false
vhost_backup=""
rollback_on_error() {
  rc=$?
  [[ $rc == 0 ]] && return
  set +e
  if [[ -n $vhost_backup && -f $vhost_backup ]]; then
    cp -p "$vhost_backup" "$vhost"
    $nginx -t && $nginx -s reload
  fi
  if $app_changed; then
    if [[ -n $previous && -f $previous/docker-compose.yml ]]; then
      echo 'Restoring previous Info-Hub application release'
      INFOHUB_RELEASE=$(basename "$previous") docker compose -p infohub -f "$previous/docker-compose.yml" up -d --no-build
    else
      docker compose -p infohub stop web api worker
    fi
  fi
  echo 'Deployment failed; review /opt/infohub/shared/backups and the command output.' >&2
}
trap rollback_on_error EXIT
if [[ -n $previous && -f $previous/docker-compose.yml ]]; then
  docker compose -p infohub -f "$previous/docker-compose.yml" exec -T db pg_dump -U infohub -d infohub > "$root/shared/backups/database-$(date -u +%Y%m%dT%H%M%SZ).sql"
fi
# Own service lifecycle only. No shared databases, PHP, other vhosts or Nginx main config.
docker compose -p infohub build
app_changed=true
docker compose -p infohub up -d
ready=false
for _ in {1..60}; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18082/ || true)
  if [[ $code == 302 ]]; then ready=true; break; fi
  sleep 1
done
$ready || { echo 'Info-Hub did not become ready; vhost was not changed'; exit 1; }
[[ $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18082/) == 302 ]]
[[ $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18082/feed.xml) == 401 ]]
docker compose -p infohub run --rm --no-deps -e API_BASE_URL=http://api:3001 setup node scripts/private-smoke.ts --base http://web:3000
vhost_backup="$root/shared/backups/news-vhost-$(date -u +%Y%m%dT%H%M%SZ).conf"
cp -p "$vhost" "$vhost_backup"
cat > "$vhost" <<'NGINX'
server {
    listen 80;
    server_name news.blian117.dpdns.org;
    return 301 https://news.blian117.dpdns.org$request_uri;
}
server {
    listen 443 ssl;
    server_name news.blian117.dpdns.org;
    ssl_certificate /www/server/panel/vhost/cert/news.blian117.dpdns.org/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/news.blian117.dpdns.org/privkey.pem;
    add_header X-Robots-Tag "noindex, nofollow" always;
    location / {
        proxy_pass http://127.0.0.1:18082;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_cache off;
        proxy_no_cache 1;
        proxy_cache_bypass 1;
        proxy_buffering off;
        proxy_read_timeout 120s;
    }
}
NGINX
if ! $nginx -t; then exit 1; fi
if ! $nginx -s reload; then exit 1; fi
if [[ $(curl -s -o /dev/null -w '%{http_code}' --resolve news.blian117.dpdns.org:443:127.0.0.1 https://news.blian117.dpdns.org/) != 302 ]]; then exit 1; fi
ln -sfn "$root/releases/$release" "$root/current"
echo "Deployed release $release. Runtime secrets remain in /opt/infohub/shared/.env; models and collection stay off until configured."

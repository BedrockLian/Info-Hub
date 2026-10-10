#!/usr/bin/env bash
# OpenCloudOS 9 only. Install the distro engine and checksum-pinned official CLI plugins.
set -euo pipefail
fail() { echo "Docker preparation failed: $*" >&2; exit 1; }
[[ $(id -u) == 0 ]] || fail 'Root is required'
[[ $(hostname) == VM-0-4-opencloudos ]] || fail 'Unexpected server'
source /etc/os-release
[[ ${ID:-} == opencloudos && ${VERSION_ID:-} == 9.* ]] || fail 'This script supports only OpenCloudOS 9'
[[ $(uname -m) == x86_64 ]] || fail 'This script supports only x86_64'
command -v dnf >/dev/null || fail 'dnf is missing'
echo "Preparing Docker on OpenCloudOS $VERSION_ID (x86_64)"
if ! command -v docker >/dev/null; then
  systemctl is-active --quiet containerd && fail 'Existing containerd is active; inspect its owner before installing Docker'
  for package in docker-ce docker-ce-cli podman-docker; do
    if rpm -q "$package" >/dev/null 2>&1; then fail "Existing $package needs inspection; no packages were changed"; fi
  done
  # Use the configured OS repositories and normal RPM signature checks. No package removals.
  dnf -y --setopt=install_weak_deps=False install moby curl
fi
command -v docker >/dev/null || fail 'Docker is still missing after package installation'
command -v curl >/dev/null || fail 'curl is missing'
plugins=/usr/local/lib/docker/cli-plugins
compose_sha=40343e21ca777173e69cff5dbafeb37c6f81f3b0d57d9e597f036e95eb63e76a
buildx_sha=4fe4cc38adf48169132749b6ca22a990928db0118e3407584ee553723115d287
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
install_plugin() {
  name=$1; url=$2; digest=$3
  [[ ! -e $plugins/$name ]] || fail "Existing $plugins/$name is not working; inspect it before replacing"
  echo "Downloading verified plugin: $name"
  curl --fail --location --proto '=https' --proto-redir '=https' --connect-timeout 20 --max-time 300 --retry 2 --output "$stage/$name" "$url"
  printf '%s  %s\n' "$digest" "$stage/$name" | sha256sum -c - || fail "$name checksum mismatch; nothing was installed from this download"
  install -d -m 755 "$plugins"
  install -m 755 "$stage/$name" "$plugins/$name"
}
if ! docker compose version >/dev/null 2>&1; then
  install_plugin docker-compose https://github.com/docker/compose/releases/download/v5.6.0/docker-compose-linux-x86_64 "$compose_sha"
fi
if ! docker buildx version >/dev/null 2>&1; then
  install_plugin docker-buildx https://github.com/docker/buildx/releases/download/v0.38.0/buildx-v0.38.0.linux-amd64 "$buildx_sha"
fi
docker compose version
docker buildx version
# Only start the Docker service; do not rewrite daemon config or restart existing applications.
systemctl enable --now docker
docker info >/dev/null || fail 'Docker daemon did not become available'
echo 'Docker preparation OK. Existing Nginx, PHP, MySQL and PostgreSQL services were not changed.'

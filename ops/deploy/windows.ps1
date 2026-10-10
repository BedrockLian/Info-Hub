# Requires Git for Windows and Windows OpenSSH. Run in your trusted Windows environment.
param(
  [Parameter(Mandatory=$true)][string]$RepositoryPath,
  [string]$SshDirectory = "$env:USERPROFILE\.ssh"
)
$ErrorActionPreference = 'Stop'
$RepositoryPath = (Resolve-Path $RepositoryPath).Path
$key = Join-Path $SshDirectory 'id_ed25519'
$known = Join-Path $SshDirectory 'known_hosts'
if (!(Test-Path $key) -or !(Test-Path $known)) { throw 'SSH key and the supplied known_hosts are required.' }
# Do not execute settings from the uploaded SSH config. The host and ports are fixed.
$sshOptions = @('-F','NUL','-i',$key,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o',"UserKnownHostsFile=$known",'-o','ConnectTimeout=15')
$target = 'root@43.128.10.41'
$release = (& git -C $RepositoryPath rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $release -notmatch '^[a-f0-9]{40}$') { throw 'Cannot determine committed release.' }
$dirty = & git -C $RepositoryPath status --porcelain
if ($dirty) { throw 'Commit or stash local changes before deployment.' }
$tar = Join-Path ([System.IO.Path]::GetTempPath()) "infohub-$release.tar"
try {
  & git -C $RepositoryPath archive --format=tar "--output=$tar" HEAD -- . ':!ops/credentials' ':!.github' ':!.claude'
  if ($LASTEXITCODE -ne 0) { throw 'Creating release failed.' }
  $serverScript = Join-Path $RepositoryPath 'ops\deploy\server.sh'
  # Read-only inspection first, before uploading or changing server files.
  Get-Content -Raw $serverScript | & ssh @sshOptions -p 22 $target 'bash -s -- preflight'
  if ($LASTEXITCODE -ne 0) { throw 'Preflight failed; server applications were not changed.' }
  & scp @sshOptions -P 22 $tar "${target}:/root/infohub-incoming-$release.tar"
  if ($LASTEXITCODE -ne 0) { throw 'Uploading release failed.' }
  Get-Content -Raw $serverScript | & ssh @sshOptions -p 22 $target "bash -s -- deploy $release"
  if ($LASTEXITCODE -ne 0) { throw 'Deployment failed. Keep the output for diagnosis.' }
  # Download the runtime credentials outside Git, so the owner can read the generated login password.
  $runtimeFile = Join-Path $SshDirectory 'InfoHub-runtime.env'
  & scp @sshOptions -P 22 "${target}:/opt/infohub/shared/.env" $runtimeFile
  if ($LASTEXITCODE -ne 0) { throw 'Deployed, but downloading private runtime credentials failed.' }
  Write-Host "Deployed: https://news.blian117.dpdns.org . Login password is in $runtimeFile (ADMIN_PASSWORD)."
} finally { if (Test-Path $tar) { Remove-Item $tar } }

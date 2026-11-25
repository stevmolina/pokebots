#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?}" "${GITHUB_SHA:?}"
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted ||
      "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ||
      "$(sw_vers -productVersion)" != 15.* || "$(id -u)" == 0 ]]; then
  echo 'Use a GitHub-hosted macOS 15 ARM64 runner with a non-root login.' >&2
  exit 1
fi
if [[ "$(git rev-parse HEAD)" != "$GITHUB_SHA" ]]; then
  echo 'The checkout does not match the dispatch SHA.' >&2
  exit 1
fi
for name in 'OpenBot' 'OpenBot Custom' 'Pokebots'; do
  if [[ -e "/Applications/$name.app" || -e "$HOME/Applications/$name.app" ]]; then
    echo 'Use a fresh runner with no installed OpenBot or Pokebots app.' >&2
    exit 1
  fi
done

baseline=bc41a1d1da9deeb25b3573a2b6bc1f17dc60c520
signing_name='OpenBot Custom Local Signing'
if ! git merge-base --is-ancestor "$baseline" "$GITHUB_SHA"; then
  echo 'The baseline is not in the selected revision history.' >&2
  exit 1
fi
security list-keychains -d user > /dev/null
original_keychains=()
while IFS= read -r line; do
  path="${line#*\"}"
  original_keychains+=("${path%\"}")
done < <(security list-keychains -d user)
[[ ${#original_keychains[@]} -gt 0 ]]

umask 077
work="$(mktemp -d "$RUNNER_TEMP/pokebots-fixture.XXXXXXXX")"
keychain="$work/fixture.keychain-db"
cleanup() {
  local status=$?
  trap - EXIT
  security list-keychains -d user -s "${original_keychains[@]}" || status=1
  if [[ -e "$keychain" ]]; then
    security delete-keychain "$keychain" || status=1
  fi
  local label
  for label in baseline candidate; do
    if [[ -e "$work/$label/.git" ]]; then
      git worktree remove --force "$work/$label" || status=1
    fi
  done
  rm -rf "$work" || status=1
  exit "$status"
}
trap cleanup EXIT

keychain_password="$(openssl rand -hex 24)"
security create-keychain -p "$keychain_password" "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security list-keychains -d user -s "$keychain"

cat > "$work/openssl.cnf" <<CONFIG
[req]
distinguished_name=dn
prompt=no
x509_extensions=ext
[dn]
CN=$signing_name
[ext]
basicConstraints=critical,CA:false
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning
CONFIG
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$work/key.pem" -out "$work/cert.pem" \
  -days 2 -config "$work/openssl.cnf" 2>/dev/null
p12_password="$(openssl rand -hex 24)"
# Use a format that the macOS Security importer supports.
openssl pkcs12 -export -inkey "$work/key.pem" -in "$work/cert.pem" -out "$work/id.p12" \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 -passout "pass:$p12_password"
security import "$work/id.p12" -k "$keychain" -P "$p12_password" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain" >/dev/null
security find-certificate -c "$signing_name" > /dev/null
identity="$(security find-identity -p codesigning)"
[[ "$identity" == *"\"$signing_name\""* ]]
openssl x509 -in "$work/cert.pem" -outform DER -out "$work/fixture.der"
rm "$work/key.pem" "$work/id.p12"
unset keychain_password p12_password
export CSC_IDENTITY_AUTO_DISCOVERY=false

build_and_verify() {
  local label="$1" commit="$2" bundle info executable version cdhash
  git worktree add --detach "$work/$label" "$commit"
  (
    cd "$work/$label"
    [[ "$(git rev-parse HEAD)" == "$commit" ]]
    bash scripts/custom-build-install.sh --no-install
  )
  bundle="$work/$label/dist-custom/mac-arm64/Pokebots.app"
  info="$bundle/Contents/Info.plist"
  [[ -d "$bundle" && ! -e "$bundle/Contents/Resources/app-update.yml" &&
     ! -L "$bundle/Contents/Resources/app-update.yml" ]]
  [[ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$info")" == app.openbot.custom ]]
  version="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$info")"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
  executable="$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$info")"
  [[ "$executable" =~ ^[[:alnum:]_\ -]+$ ]]
  [[ "$(lipo -archs "$bundle/Contents/MacOS/$executable")" == arm64 ]]
  codesign --verify --strict "$bundle"
  mkdir "$work/$label-cert"
  (
    cd "$work/$label-cert"
    codesign -d --extract-certificates "$bundle" > /dev/null 2>&1
  )
  cmp -s "$work/fixture.der" "$work/$label-cert/codesign0"
  codesign -dv --verbose=4 "$bundle" 2> "$work/$label-signature"
  cdhash="$(sed -n 's/^CDHash=//p' "$work/$label-signature")"
  [[ "$cdhash" =~ ^[a-f0-9]{40}$ ]]
  printf '%s\n' "$cdhash" > "$work/$label-cdhash"
  codesign -d -r - "$bundle" 2>&1 | sed -n 's/^designated => //p' > "$work/$label-requirement"
  [[ -s "$work/$label-requirement" ]]
  printf '%s_commit=%s\n%s_version=%s\n%s_cdhash=%s\n' \
    "$label" "$commit" "$label" "$version" "$label" "$cdhash" >> "$work/report.txt"
  git worktree remove --force "$work/$label"
}

build_and_verify baseline "$baseline"
build_and_verify candidate "$GITHUB_SHA"
[[ "$(cat "$work/baseline-cdhash")" != "$(cat "$work/candidate-cdhash")" ]]
cmp -s "$work/baseline-requirement" "$work/candidate-requirement"

certificate_sha256="$(shasum -a 256 "$work/fixture.der" | cut -d ' ' -f 1)"
[[ "$certificate_sha256" =~ ^[a-f0-9]{64}$ ]]
evidence="$RUNNER_TEMP/pokebots-mac-fixture-proof"
mkdir "$evidence"
{
  cat "$work/report.txt"
  printf 'runner=macos-15-arm64\ncertificate_sha256=%s\n' "$certificate_sha256"
  printf 'bundle_verification=passed\nupdate_feed=absent\n'
  printf 'launch=blocked\nlaunch_blocker=No verified fresh GUI login with loopback-only networking on this runner.\n'
} > "$evidence/report.txt"
(
  cd "$evidence"
  shasum -a 256 report.txt > SHA256SUMS.txt
  shasum -a 256 -c SHA256SUMS.txt
)
echo '::notice::Fixture build and signing checks passed. Upgrade launch is blocked by the lack of a verified loopback-only GUI login.'

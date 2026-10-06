#!/usr/bin/env bash
set -euo pipefail

public_dir="$1"
private_dir="$2"
archive_name="$3"
archive="$HOME/$archive_name"
stage="$(mktemp -d)"
trap 'rm -rf "$stage" "$archive"' EXIT

[[ -d "$public_dir" && -d "$private_dir" && -f "$private_dir/config.php" ]] || {
  echo 'Deployment folders or private/config.php are missing'
  exit 1
}
tar -xzf "$archive" -C "$stage"
[[ -f "$stage/public_html/index.html" && -f "$stage/public_html/api/index.php" && -f "$stage/private/app.php" && -f "$stage/private/validation.php" ]] || {
  echo 'Incomplete deployment archive'
  exit 1
}

# Upload assets and API before switching the page. Account settings and sessions stay in place.
cp -a "$stage/public_html/assets/." "$public_dir/assets/"
cp -a "$stage/public_html/api/." "$public_dir/api/"
find "$stage/public_html" -maxdepth 1 -type f ! -name index.html -exec cp -a {} "$public_dir/" \;
cp -a "$stage/private/app.php" "$stage/private/validation.php" "$private_dir/"
cp -a "$stage/public_html/index.html" "$public_dir/index.html"
echo 'Site deployed'

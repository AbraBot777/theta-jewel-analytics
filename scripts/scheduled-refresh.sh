#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
npm run build

if git diff --quiet -- public/data/dashboard.json dist; then
  echo "No dashboard changes to publish."
  exit 0
fi

git add public/data/dashboard.json dist
git commit -m "Refresh dashboard data"
git push origin main
git subtree push --prefix dist origin gh-pages

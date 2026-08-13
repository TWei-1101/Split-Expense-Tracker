#!/bin/bash
# scripts/deploy-prod.sh
#
# Build main and deploy it to the Cloudflare Pages PROD project
# (split-expense-tracker), which serves https://expense.771101.xyz/.
#
# Normally Cloudflare Pages auto-deploys when main is pushed, but
# the GitHub webhook on this account is not triggering reliably,
# so this script is the manual fallback.
#
# Usage (from repo root):
#   scripts/deploy-prod.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo "❌ 目前在 $CURRENT_BRANCH，請先切到 main："
    echo "   git checkout main"
    exit 1
fi

# 確認工作目錄乾淨
if [[ -n "$(git status --porcelain)" ]]; then
    echo "❌ 工作目錄有未 commit 的改動："
    git status --short
    exit 1
fi

# 跟 remote 同步
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse '@{u}' 2>/dev/null || echo "")
if [[ -n "$REMOTE" && "$LOCAL" != "$REMOTE" ]]; then
    echo "❌ 本地 main 跟 origin/main 不一致："
    echo "   local:  $LOCAL"
    echo "   remote: $REMOTE"
    echo "   請先 git pull 或 git push"
    exit 1
fi

echo "📦 Building..."
npm run build

SECRETS="${CLOUDFLARE_PAGES_SECRETS:-/root/.openclaw/workspace/.secrets/cloudflare-pages.env}"
if [[ ! -f "$SECRETS" && -f "/Users/twei/.openclaw/workspace/.secrets/cloudflare-pages.env" ]]; then
    SECRETS="/Users/twei/.openclaw/workspace/.secrets/cloudflare-pages.env"
fi
if [[ ! -f "$SECRETS" ]]; then
    echo "❌ 找不到 $SECRETS"
    exit 1
fi
set -a
source "$SECRETS"
set +a

PROD_PROJECT="split-expense-tracker"
echo "🚀 Deploying to Pages project: $PROD_PROJECT (branch=main)"
npx wrangler pages deploy dist \
    --project-name "$PROD_PROJECT" \
    --branch main \
    --commit-dirty=true

echo ""
echo "✅ Done! 等約 30-60 秒後到下面這個網址確認："
echo "   👉 https://expense.771101.xyz/"

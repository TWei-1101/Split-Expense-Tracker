#!/bin/bash
# scripts/deploy-test.sh
#
# Build the dev branch and deploy it to the Cloudflare Pages TEST project
# (split-expense-tracker-test), which serves https://expense-test.771101.xyz/.
#
# Cloudflare Pages 用 `--branch` 跟 `production_branch` 對比決定 deployment
# 是 production 還是 preview 環境。custom domain 只指向 production 環境。
# 所以這個 script：
#   1. 用 dev branch 的程式碼 build
#   2. 部署時用 --branch main (跟 test 專案的 production_branch 一致) 讓 Pages
#      把這個 deployment 認成 production → custom domain 會更新
#   3. 用 --commit-message 標清楚實際 build 來自 dev
#
# Usage (from repo root):
#   scripts/deploy-test.sh
#
# After this script finishes, the custom domain expense-test.771101.xyz
# will show the build from the current feature branch.
#
# Required env (auto-sourced from workspace secrets):
#   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 1. 抓當前 branch 名稱
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$BRANCH" == "HEAD" ]]; then
    echo "❌ 當前是 detached HEAD，請先 checkout 一個 branch"
    exit 1
fi

if [[ "$BRANCH" == "main" ]]; then
    echo "❌ 當前在 main；deploy-test 設計上是從 dev branch 部署。"
    echo "   請先 git checkout dev，或改用 deploy-prod.sh"
    exit 1
fi

# 2. 載入 Cloudflare credentials
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

# 3. 確認 test 專案 production_branch = main（如果不是就警告，但繼續）
TEST_PROJECT="split-expense-tracker-test"
CUR_PROD_BRANCH=$(curl -sS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$TEST_PROJECT" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['result'].get('production_branch','?'))")
if [[ "$CUR_PROD_BRANCH" != "main" ]]; then
    echo "⚠️  test 專案 production_branch 是 '$CUR_PROD_BRANCH'，不是 'main'。"
    echo "   把它改回 main，這樣 custom domain 才會指向新部署。"
    RESP=$(curl -sS -X PATCH \
        "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$TEST_PROJECT" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"production_branch":"main"}')
    echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('   → ok' if d.get('success') else '   → FAIL: '+str(d.get('errors')))"
fi

# 4. Build
echo "🪶 Source branch: $BRANCH"
echo "📦 Building..."
npm run build

# 5. 部署：用 --branch main 讓 Pages 認成 production
#    --commit-message 標清楚實際 build 來源
echo "🚀 Deploying to $TEST_PROJECT (Pages branch=main, source=$BRANCH)"
npx wrangler pages deploy dist \
    --project-name "$TEST_PROJECT" \
    --branch main \
    --commit-message "test build from branch: $BRANCH" \
    --commit-dirty=true

echo ""
echo "✅ Done! 等約 30-60 秒後到下面這個網址確認："
echo "   👉 https://expense-test.771101.xyz/"
echo ""
echo "確認 OK 後，切到 main merge dev 部署到正式版："
echo "   git checkout main"
echo "   git merge --no-ff dev -m \"merge dev to main\""
echo "   git push origin main"
echo "   scripts/deploy-prod.sh"
echo ""
echo "   👉 https://expense.771101.xyz/"

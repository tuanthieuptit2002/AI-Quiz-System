#!/usr/bin/env bash
# Deploy origin/main on the VPS: pull, reinstall dependencies when a lockfile changed, then rebuild
# and restart only the apps whose files changed since the last successful deploy.
#
# Usage: bash scripts/deploy.sh [--all]
#   --all  rebuild and restart backend and frontend even if unchanged
set -euo pipefail

APP_DIR=/home/quizspace-tuandev
BRANCH=main
STATE_DIR=/root/.quiz-deploy
STATE_FILE=$STATE_DIR/last-deployed
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

log() { printf '[deploy %s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

changed() {
  [[ $FORCE == 1 || -z $FROM ]] && return 0
  ! git diff --quiet "$FROM" HEAD -- "$@"
}

wait_healthy() {
  local name=$1 url=$2
  for _ in $(seq 1 30); do
    if curl -fs -o /dev/null --max-time 3 "$url"; then
      log "$name OK ($url)"
      return 0
    fi
    sleep 2
  done
  log "$name không phản hồi tại $url"
  pm2 logs "$name" --lines 40 --nostream || true
  return 1
}

deploy_app() {
  local dir=$1 name=$2 url=$3
  if ! changed "$dir"; then
    log "$dir: không đổi, bỏ qua"
    return 0
  fi
  if changed "$dir/package-lock.json" || [[ ! -d $dir/node_modules ]]; then
    log "$dir: npm ci"
    quiz-run "$dir" npm ci --include=dev --no-audit --no-fund
  fi
  log "$dir: build"
  quiz-run "$dir" npm run build
  log "$dir: restart $name"
  pm2 restart "$name"
  wait_healthy "$name" "$url"
}

main() {
  FORCE=0
  [[ ${1:-} == --all ]] && FORCE=1

  mkdir -p "$STATE_DIR"
  exec 9>"$STATE_DIR/deploy.lock"
  flock -w 900 9 || { log "Đang có một lần deploy khác chạy"; exit 1; }

  cd "$APP_DIR"
  git fetch --quiet origin "$BRANCH"
  git checkout --quiet "$BRANCH"
  git merge --ff-only --quiet "origin/$BRANCH"

  FROM=$(cat "$STATE_FILE" 2>/dev/null || true)
  if [[ -n $FROM ]] && ! git cat-file -e "$FROM^{commit}" 2>/dev/null; then
    FROM=
  fi
  log "Deploy ${FROM:0:7} -> $(git rev-parse --short HEAD) $(git log -1 --format=%s)"

  deploy_app backend quiz-api http://127.0.0.1:5100/health
  deploy_app frontend quiz-web http://127.0.0.1:5101/

  git rev-parse HEAD >"$STATE_FILE"
  log "Hoàn tất"
}

# Keep the whole script parsed before running, since `git merge` may rewrite this file mid-run.
main "$@"
exit

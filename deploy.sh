#!/usr/bin/env bash
# deploy.sh — единая штатная точка deploy-подготовки и установки @goodandready/dsh-ollama-cloud-provider.
#
# Режимы:
#   bash deploy.sh check
#       Проверка ветки: тесты, состав пакета (лимит 256 KiB на файл DSH Store),
#       сборка релиз-кандидата .tgz в dist/. Ничего не меняет в runtime.
#
#   DSH_OLLAMA_APPROVED=yes bash deploy.sh install <exact-version>
#       Установка ТОЧНОЙ опубликованной registry-версии в production web-профиль
#       и post-install проверки. Требует явного «ок» владельца.
#
#   bash deploy.sh verify [exact-version]
#       Только post-install проверки уже установленного профиля: фактическая
#       версия, доступ к web UI и эндпоинт здоровья.

set -euo pipefail

MODE="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PACKAGE_NAME="@goodandready/dsh-ollama-cloud-provider"
SIZE_HARD_LIMIT=262144   # 256 KiB — отклоняет DSH Store
SIZE_WARN_LIMIT=256000   # практический порог предупреждения
WEB_BASE="${DSH_WEB_BASE:-http://127.0.0.1:3080}"
WEB_UNIT="${DSH_WEB_UNIT:-dsh-web.service}"

fail() { echo "ERROR: $*" >&2; exit 1; }

require_node() {
  command -v node >/dev/null 2>&1 || fail "node not found in PATH"
  command -v npm >/dev/null 2>&1 || fail "npm not found in PATH"
}

print_context() {
  echo "package: $PACKAGE_NAME"
  echo "version: $(node -p "require('./package.json').version")"
  echo "branch:  $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo "commit:  $(git rev-parse HEAD 2>/dev/null || echo unknown)"
}

run_checks() {
  npm run check
}

build_candidate() {
  mkdir -p dist
  rm -f dist/*.tgz
  npm pack --pack-destination dist --loglevel=error
  echo "candidate ready in dist/"
}

post_install_checks() {
  local expected_version="$1"
  echo "--- post-install checks ---"
  local listed
  listed="$(dsh plugin --profile web list 2>/dev/null | grep -F "$PACKAGE_NAME@$expected_version" || true)"
  [ -n "$listed" ] || fail "installed profile does not report $PACKAGE_NAME@$expected_version"
  echo "profile: $listed"

  local health_code
  health_code="$(curl -s -o /dev/null -w '%{http_code}' "$WEB_BASE/dsh-ollama/health" || echo "000")"
  if [ "$health_code" = "200" ]; then
    echo "health check: HTTP 200 OK"
  else
    echo "WARN: health check returned HTTP $health_code"
  fi
  echo "post-install checks passed"
}

case "$MODE" in
  check)
    require_node
    print_context
    run_checks
    build_candidate
    echo "check: OK — candidate ready for deployment"
    ;;
  install)
    require_node
    command -v dsh >/dev/null 2>&1 || fail "dsh CLI not found in PATH"
    [ "${DSH_OLLAMA_APPROVED:-}" = "yes" ] || fail "production install requires explicit approval: run with DSH_OLLAMA_APPROVED=yes"
    local_version="$(node -p "require('./package.json').version")"
    TARGET_VERSION="${2:-}"
    [ -n "$TARGET_VERSION" ] || fail "usage: DSH_OLLAMA_APPROVED=yes bash deploy.sh install <exact-version>"
    [ "$TARGET_VERSION" = "$local_version" ] || fail "target version $TARGET_VERSION does not match package.json $local_version"
    echo "installing $PACKAGE_NAME@$TARGET_VERSION into the DSH web profile"
    dsh plugin --profile web add "$PACKAGE_NAME@$TARGET_VERSION"
    post_install_checks "$TARGET_VERSION"
    ;;
  verify)
    command -v node >/dev/null 2>&1 || fail "node not found in PATH"
    post_install_checks "${2:-$(node -p "require('./package.json').version")}"
    ;;
  *)
    fail "usage: bash deploy.sh check | DSH_OLLAMA_APPROVED=yes bash deploy.sh install <exact-version> | bash deploy.sh verify [exact-version]"
    ;;
esac

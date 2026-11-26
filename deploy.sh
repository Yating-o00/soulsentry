#!/usr/bin/env bash
set -Eeuo pipefail
# Build locally/CI with scripts/build-release.mjs. Never build on the production host.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/scripts/deployment/deploy.mjs" "$@"

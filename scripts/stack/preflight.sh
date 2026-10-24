#!/bin/sh
# Fails with exit 2 when BACKEND_STACK is neither python nor node. The environment wins over the
# env file, like in Compose. Usage: scripts/stack/preflight.sh [env-file]   (default: .env)
file="${1:-.env}"
value="${BACKEND_STACK:-}"
if [ -z "$value" ] && [ -r "$file" ]; then
  value="$(grep '^BACKEND_STACK=' "$file" | tail -n 1 | cut -d= -f2- | tr -d '"'"'"' \r')"
fi
case "${value:-python}" in
  python|node) ;;
  *)
    echo "BACKEND_STACK must be python or node (got: $value)" >&2
    exit 2
    ;;
esac

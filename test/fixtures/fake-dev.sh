#!/bin/sh
# Integration-test stand-in for a dev server: records where and with which env it ran, then idles.
#   fake-dev.sh <name> [--exit]
name="$1"
{
  echo "pwd=$(pwd -P)"
  env | grep '^PKT_' | sort
} > "$PK_MARK_DIR/$name"
[ "$2" = "--exit" ] && exit 0
exec sleep 600

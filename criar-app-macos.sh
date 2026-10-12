#!/bin/bash

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_PATH="$HOME/Desktop/EasyDesk.app"
BUILD_DIR="$(mktemp -d)"
ICONSET="$BUILD_DIR/EasyDesk.iconset"
ICON_PNG="$BUILD_DIR/EasyDesk-icon.svg.png"
APPLESCRIPT="$BUILD_DIR/EasyDesk.applescript"

if [[ -e "$APP_PATH" ]]; then
  printf 'Ja existe uma app neste caminho: %s\n' "$APP_PATH"
  printf 'Remove ou muda o nome da app existente antes de criar outra.\n'
  exit 1
fi

mkdir -p "$ICONSET"
qlmanage -t -s 1024 -o "$BUILD_DIR" "$PROJECT_DIR/EasyDesk-icon.svg" >/dev/null

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$ICON_PNG" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double_size=$((size * 2))
  sips -z "$double_size" "$double_size" "$ICON_PNG" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET" -o "$BUILD_DIR/applet.icns"

cat > "$APPLESCRIPT" <<APPLESCRIPT
property serverPID : ""

on run
  set launcherPath to "$PROJECT_DIR/iniciar-easydesk-silencioso.sh"
  set launchResult to do shell script "/bin/bash " & quoted form of launcherPath
  if launchResult starts with "started:" then
    set serverPID to text 9 thru (length of launchResult) of launchResult
  end if
end run

on quit
  if serverPID is not "" then
    try
      do shell script "/bin/kill " & serverPID
    end try
  end if
  continue quit
end run
APPLESCRIPT

osacompile -s -o "$APP_PATH" "$APPLESCRIPT"
cp "$BUILD_DIR/applet.icns" "$APP_PATH/Contents/Resources/applet.icns"
rm -rf "$BUILD_DIR"

printf 'App criada: %s\n' "$APP_PATH"
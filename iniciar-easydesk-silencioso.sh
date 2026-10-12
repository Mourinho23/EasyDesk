#!/bin/bash

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)" || exit 1
LOG_FILE="$HOME/Library/Logs/EasyDesk.log"
PORT="${PORT:-3000}"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  . "$HOME/.nvm/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  osascript -e 'display dialog "Instala Node.js 18 ou superior para iniciar o EasyDesk." buttons {"OK"} default button 1'
  exit 1
fi

mkdir -p "$HOME/Library/Logs"

if [[ ! -d "$PROJECT_DIR/node_modules/express" ]]; then
  if ! (cd "$PROJECT_DIR" && npm ci) >>"$LOG_FILE" 2>&1; then
    osascript -e 'display dialog "Nao foi possivel instalar as dependencias. Consulta ~/Library/Logs/EasyDesk.log." buttons {"OK"} default button 1'
    exit 1
  fi
fi

HOST_IP="$(node -e '
const os = require("os");
const addresses = Object.values(os.networkInterfaces()).flat();
const local = addresses.find(address => {
  if (!address || address.family !== "IPv4" || address.internal) return false;
  const octets = address.address.split(".").map(Number);
  return octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
});
console.log(local ? local.address : "127.0.0.1");
')"
URL="http://${HOST_IP}:${PORT}"

if curl -fsS "$URL/" >/dev/null 2>&1; then
  open "$URL"
  printf 'existing\n'
  exit 0
fi

cd "$PROJECT_DIR" || exit 1
PORT="$PORT" nohup node server.js >>"$LOG_FILE" 2>&1 </dev/null &

for attempt in {1..30}; do
  if curl -fsS "$URL/" >/dev/null 2>&1; then
    open "$URL"
    printf 'started:%s\n' "$SERVER_PID"
    exit 0
  fi
  sleep 1
done

kill "$SERVER_PID" 2>/dev/null || true
osascript -e 'display dialog "O EasyDesk nao iniciou. Verifica ~/Library/Logs/EasyDesk.log e confirma que a porta 3000 esta livre." buttons {"OK"} default button 1'
exit 1
# Open WebUI terminal helper. Source this from ~/.zshrc:
#   source "$HOME/Other/02-DevOps-Lab/custom-devops-stack/open-webui/webui.zsh"
# Then run `webui help` from any directory.

# Stack directory = the folder this file lives in (override by exporting WEBUI_DIR).
: "${WEBUI_DIR:=${${(%):-%x}:A:h}}"

webui() {
  local cmd="${1:-help}"
  [[ $# -gt 0 ]] && shift
  local url="http://localhost:3000"
  local tar_file="$WEBUI_DIR/backup/open-webui-image.tar"

  if [[ ! -f "$WEBUI_DIR/docker-compose.yml" ]]; then
    echo "webui: docker-compose.yml not found in $WEBUI_DIR" >&2
    return 1
  fi

  case "$cmd" in
    start|up)
      # Docker Desktop does not start at login, so start it on demand.
      if ! docker info >/dev/null 2>&1; then
        echo "Docker is not running; starting Docker Desktop..."
        open -a Docker || return 1
        local i
        for i in {1..60}; do
          docker info >/dev/null 2>&1 && break
          sleep 2
        done
        docker info >/dev/null 2>&1 || { echo "webui: Docker did not come up" >&2; return 1; }
      fi
      if ! curl -s -o /dev/null -m 3 http://localhost:11434; then
        echo "warning: Ollama is not reachable on :11434 (the UI will show no models)"
      fi
      "$WEBUI_DIR/webui.sh" && echo "Open WebUI: $url"
      ;;
    stop|down)
      (cd "$WEBUI_DIR" && docker compose stop)
      ;;
    restart)
      (cd "$WEBUI_DIR" && docker compose restart)
      ;;
    status|ps)
      (cd "$WEBUI_DIR" && docker compose ps)
      curl -s -o /dev/null -m 3 -w "UI   $url -> HTTP %{http_code}\n" "$url" || echo "UI   $url -> not responding"
      curl -s -o /dev/null -m 3 http://localhost:11434 && echo "Ollama :11434 -> up" || echo "Ollama :11434 -> down"
      ;;
    logs)
      # Last 100 lines by default; `webui logs -f` follows. Extra args go to docker compose logs.
      if [[ $# -eq 0 ]]; then set -- --tail 100; fi
      (cd "$WEBUI_DIR" && docker compose logs "$@")
      ;;
    open)
      open "$url"
      ;;
    update)
      echo "This deletes $tar_file, pulls the image and recreates the container."
      echo "Chats in $WEBUI_DIR/data are kept."
      read -q "reply?Continue? [y/N] " || { echo; echo "Cancelled."; return 1; }
      echo
      rm -f "$tar_file"
      (cd "$WEBUI_DIR" && docker compose pull) && "$WEBUI_DIR/webui.sh"
      ;;
    cd)
      cd "$WEBUI_DIR"
      ;;
    help|-h|--help|*)
      cat <<EOF
Usage: webui <command>

  start      Start Open WebUI (starts Docker Desktop if needed)
  stop       Stop the container (data is kept)
  restart    Restart the container
  status     Container state, UI and Ollama reachability
  logs       Last 100 log lines (webui logs -f to follow)
  open       Open $url in the browser
  update     Re-pull the image and refresh the backup tar (asks first)
  cd         Go to the stack folder
  help       Show this help

Stack folder: $WEBUI_DIR
EOF
      [[ "$cmd" == help || "$cmd" == -h || "$cmd" == --help ]] || return 1
      ;;
  esac
}

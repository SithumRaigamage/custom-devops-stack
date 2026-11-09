# Open WebUI (local, prune-safe)

Open WebUI in Docker, connected to Ollama running on the host
(`http://host.docker.internal:11434`). Served on `http://localhost:3000`
(localhost only).

## Prerequisites

- Docker Desktop running
- Ollama running on the host (`curl http://localhost:11434` should answer)

## Why it survives Docker cleaning tools

- Chats and settings live in a **bind mount** (`./data`), not a named volume,
  so `docker volume prune` / `docker system prune --volumes` cannot touch them.
- The image is saved to `./backup/open-webui-image.tar`, so if a prune removes
  the image it is reloaded from disk instead of re-downloaded.
- `pull_policy: missing` means Compose only downloads the image if absent.

## Terminal command (`webui`, works from any directory)

Add this one line to `~/.zshrc`, then open a new terminal:

```bash
source "$HOME/Other/02-DevOps-Lab/custom-devops-stack/open-webui/webui.zsh"
```

| Command | What it does |
|---|---|
| `webui start` | Starts Docker Desktop if needed, warns if Ollama is down, runs `webui.sh` |
| `webui stop` | Stops the container (chats are kept) |
| `webui restart` | Restarts the container |
| `webui status` | Container state, UI (HTTP code) and Ollama reachability |
| `webui logs` | Last 100 log lines; `webui logs -f` follows, other `docker compose logs` flags work too |
| `webui open` | Opens http://localhost:3000 in the browser |
| `webui update` | Asks first, then deletes the tar, pulls the image, reruns `webui.sh` |
| `webui cd` | Goes to this folder |
| `webui help` | Shows the command list |

If you move the stack folder, update the path in `~/.zshrc`. Set `WEBUI_DIR`
before sourcing to point the helper at a different location.

## Start

```bash
./webui.sh
```

(`webui start` does the same from anywhere.)

The script loads the image from the backup tar (or pulls it), creates the tar
if none exists, then runs `docker compose up -d`. After the first run you can
also start/stop the container with the play button in Docker Desktop
(`restart: unless-stopped`; Docker does not start at login).

## Update

Either run `webui update`, or by hand:

```bash
rm backup/open-webui-image.tar
docker compose pull
./webui.sh
```

The script re-saves a fresh tar of the new image.

## Notes

- **Exclude `backup/` (and `data/`) from your cleaner app**, otherwise the tar
  and your chats can be deleted.
- `data/` and `backup/` are git-ignored.
- `:main` moves constantly. Later, pin a specific version tag in
  `docker-compose.yml` and `webui.sh` (e.g. `ghcr.io/open-webui/open-webui:vX.Y.Z`)
  for reproducible updates.

# Bero deployment notes

This repo can run on `bero` with a small adaptation layer:

- host already occupies `80/443` with OpenResty
- TechSpar frontend should stay behind OpenResty
- backend runs in Docker
- embeddings are served by a host-level systemd service on `127.0.0.1:18095`

## Port layout

`docker-compose.yml` now supports bind IP overrides:

- `FRONTEND_BIND_IP` for `13080`
- `BACKEND_BIND_IP` for `18000`

Recommended on `bero`:

- frontend: `100.84.168.72:13080 -> container:80`
- backend: `127.0.0.1:18000 -> container:8000`

This keeps the API local-only, while allowing another tailnet node (for example `geelinx-gb`) to reverse proxy the frontend over Tailscale.

The frontend container already proxies both `/api/` and `/ws/` to backend inside the compose network.
So the upstream reverse proxy only needs to forward the website itself to frontend.

## Embedding wiring

The backend container cannot use host `127.0.0.1` directly.

The practical fix on `bero` is to expose the embedding service on the host Tailscale IP and let the backend call that address directly.

Recommended `.env` values:

```env
EMBEDDING_BACKEND=api
EMBEDDING_API_BASE=http://100.84.168.72:18095/v1
EMBEDDING_API_MODEL=BAAI/bge-m3
```

This matches the same host-shape used by the outer reverse proxy path (`geelinx-gb -> bero over Tailscale`).

## Notes

- reranker is not wired into the current upstream retrieval path yet
- microphone / recording features should sit behind HTTPS on a real domain
- `/ws/` websocket proxying is added in frontend nginx for Copilot realtime features
- `.env.bero.example` is provided as a deployment template for this host shape

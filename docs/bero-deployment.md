# Bero deployment notes

This repo can run on `bero` with a small adaptation layer:

- host already occupies `80/443` with OpenResty
- TechSpar frontend should stay behind OpenResty
- backend runs in Docker
- embeddings are served by a host-level systemd service on `127.0.0.1:18095`

## Port layout

`docker-compose.yml` is adjusted to bind only on localhost:

- frontend: `127.0.0.1:13080 -> container:80`
- backend: `127.0.0.1:18000 -> container:8000`

OpenResty can then reverse proxy:

- `/` -> `http://127.0.0.1:13080`
- optional direct API proxy is not required because frontend nginx already proxies `/api/` to backend inside the compose network.

## Embedding wiring

The backend container cannot use host `127.0.0.1` directly.

So compose adds:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Then `.env` should point embeddings to:

```env
EMBEDDING_BACKEND=api
EMBEDDING_API_BASE=http://host.docker.internal:18095/v1
EMBEDDING_API_MODEL=BAAI/bge-m3
```

## Notes

- reranker is not wired into the current upstream retrieval path yet
- microphone / recording features should eventually sit behind HTTPS on a real domain
- `.env.bero.example` is provided as a deployment template for this host shape

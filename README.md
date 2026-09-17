# dottie-local

Local **llama.cpp** inference + optional **[dotbot](https://github.com/stevederico/dotbot)** harness.

Same shape as [dottie-talk](https://github.com/stevederico/dottie-talk): HTTP + MCP + CLI. Talk is voice; this is tokens.

Private for now. Written as if it will be public (MIT, no secrets, clear docs).

## What it is

| Layer | Role |
|---|---|
| **llama-server** | Engine (GGUF → tokens). HTTP only. |
| **dottie-local** | Façade: start/health, OpenAI proxy, MCP, CLI |
| **dotbot** | Optional agent loop + `dot_*` tools on top |

Two processes. Never vendors Metal into the harness.

## Requirements

- Node.js ≥ 22
- [`llama-server`](https://github.com/ggml-org/llama.cpp) on `PATH`
- A GGUF (or let `-hf` download). Default model: `ggml-org/gemma-4-12B-it-GGUF` (prefers cached Q8_0)

## Install

```bash
git clone https://github.com/stevederico/dottie-local.git
cd dottie-local
npm install
```

## Quick start

```bash
# Attach to an already-running llama-server on :8080, or spawn one
dottie-local ask "hello"
dottie-local /ask "hello"    # same
echo "$(cat article.txt)" | dottie-local ask "summarize this"
LLM_REASON=1 dottie-local ask "prove it"   # gemma thinking on

# Agent turn (dotbot tools: memory, web, files, …)
dottie-local agent "What tools do you have?"
dottie-local /agent "…"      # same

# HTTP façade
dottie-local start          # http://127.0.0.1:1321
dottie-local health
```

`ask` matches [local-ai-cli](https://github.com/stevederico/local-ai-cli): warm server, SSE stream to stdout, stdin append, `LLM_REASON`.

MCP:

```bash
npm run mcp
```

## Ports

| Port / env | Service |
|---|---|
| **8080** (`LLM_PORT` / `DOTTIE_LOCAL_ENGINE_PORT`) | `llama-server`. Reuses healthy server. |
| **1321** (`DOTTIE_LOCAL_HTTP_PORT`) | dottie-local HTTP façade |
| `LLM_REASON=1` | enable thinking on `ask` (default off) |

## HTTP

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | Engine + façade |
| `POST` | `/v1/local/complete` | Buffered `{ message }` → `{ text }` |
| `POST` | `/v1/agent/chat` | Dotbot harness → `{ text, events }` |
| `*` | `/v1/chat/completions` | Proxied to engine (SSE ok) |
| `GET` | `/v1/models` | Proxied |

## MCP tools

| Tool | Does |
|---|---|
| `complete` | One-shot chat, no tools |
| `agent` | Dotbot loop with `dot_*` tools |

## CLI

```
dottie-local ask|/ask <text>
dottie-local agent|/agent <text>
dottie-local start | health | stop | help
```

`stop` only kills an engine **this package spawned**. A shared `llm-server` on :8080 is left alone.

## Related

- [dottie-talk](https://github.com/stevederico/dottie-talk) — local STT/TTS
- [dotbot](https://github.com/stevederico/dotbot) — agent harness
- [llama.cpp](https://github.com/ggml-org/llama.cpp) — inference engine
- [dottie-desktop](https://github.com/stevederico/dottie-desktop) — desktop app

## License

MIT

# Plan: dottie-desktop parity (replace Ollama)

Goal: dottie-desktop can use **dottie-local** as the on-device chat provider instead of (or alongside) Ollama, with the same Settings UX quality.

Status: **not drop-in yet**. Chat OpenAI path is close; model list, ports, and desktop wiring are the gaps.

Related: [dottie-desktop](https://github.com/stevederico/dottie-desktop) gateway `complete_ollama` + Swift `fetchOllamaModels`.

---

## What desktop needs today (Ollama contract)

| Capability | Desktop call site | Ollama today |
|---|---|---|
| Chat completion | Rust gateway → `POST :11434/v1/chat/completions` | OpenAI-compat |
| Model picker | Swift `ClientManager.fetchOllamaModels` | `GET :11434/api/tags` → `{ models: [{ name }] }` |
| Test Connection | Gateway `GET /api/tags` | Reachable + 2xx |
| No API key | Provider `.ollama` | Localhost only |
| Default port | Hardcoded `11434` | Ollama daemon |

Desktop does **not** yet need: Ollama pull UI, Ollama tool calling, vision (Rust agent has no local tool loop either).

---

## Gap list (ordered)

### P0 — unblock desktop wiring

1. **Move HTTP façade off `:1321`**
   - Conflict: dottie-desktop **mac-use** owns `:1321`.
   - Pick a free port (proposal: **`:1318`** — between talk `:1320` and unused; or `:8081` next to engine).
   - Update `ports.js`, README, any LaunchAgent / docs.
   - Keep `DOTTIE_LOCAL_HTTP_PORT` override.

2. **Model-list shape desktop understands**
   - Option A (preferred in this package): add `GET /api/tags` shim that maps llama `/v1/models` → Ollama-like `{ models: [{ name: id }] }`.
   - Option B: change desktop to call `GET /v1/models` (OpenAI `{ data: [{ id }] }`).
   - Do **A** here so any Ollama-shaped client works; still keep `/v1/models`.

3. **Health probe for Test Connection**
   - Desktop today probes `/api/tags`. After (2), that works.
   - Also keep `GET /health` with `{ ok, engine, … }` for non-desktop clients.

4. **Document the desktop target URL**
   - Single base: `http://127.0.0.1:<HTTP_PORT>` (façade), not raw `:8080`, so ensure-engine-on-first-request stays owned here.

### P1 — desktop repo changes (tracked here so nothing is forgotten)

5. **Provider `dottielocal` (or rename Settings “Local”)**
   - In dottie-desktop: new `ChatProvider` case (or replace `ollama` path).
   - Gateway: `complete_local` → `POST http://127.0.0.1:1318/v1/chat/completions` (configurable host/port via env/`config.json`).
   - Swift model fetch → `/api/tags` or `/v1/models` matching (2).
   - Test Connection → same host health/`/api/tags`.
   - Copy: “Dottie Local (llama.cpp)” vs “Ollama”.

6. **Config knobs**
   - `DOTTIE_LOCAL_URL` or `config.json` `{ "localBaseUrl": "http://127.0.0.1:1318" }`.
   - Model id = GGUF / HF id string already used by llama-server.

7. **First-run UX notes (desktop Settings)**
   - Need `llama-server` on PATH + `dottie-local start` (or LaunchAgent).
   - Empty model list → hint: start dottie-local / pull GGUF (not `ollama pull`).

### P2 — nice-to-have (not required to replace)

8. **Streaming** — façade already proxies SSE; desktop WS still dumps full reply today. Optional later.
9. **Multi-model listing** — if engine exposes one loaded model only, picker shows one; document HF cache scan if we want Ollama-like multi-pull UX.
10. **Supervise from desktop gateway** — optional child process like talk/mac-use; YAGNI until Settings “start local” is a product ask.
11. **Tool calling via local** — blocked on Rust agent tool loop, not this package.

---

## Proposed ports (desktop stack)

| Port | Owner |
|------|--------|
| 1317 | dottie-gateway |
| **1318** | **dottie-local HTTP** (proposed) |
| 1319 | dottie-mac-use-ax |
| 1320 | dottie-talk |
| 1321 | dottie-mac-use |
| 8080 | llama-server (engine, package-owned) |
| 11434 | Ollama (optional; can remain as alternate provider) |

---

## Acceptance (done when)

- [ ] Façade default port ≠ 1321 (no clash with mac-use).
- [ ] `GET /api/tags` returns at least one model when engine is up (or honest empty list).
- [ ] `POST /v1/chat/completions` with `{ model, messages, stream:false }` returns OpenAI-shaped choices (already true — regression-test it).
- [ ] Desktop can select provider → Test Connection green → one chat turn without Ollama installed.
- [ ] README documents “Use with dottie-desktop” in ≤10 lines.

---

## Non-goals (this plan)

- Replacing dottie-talk (STT/TTS stays there).
- Bundling Metal/`llama-server` binary into this repo (PATH + supervise only).
- Killing Ollama support in desktop on day one (can keep both providers).
- Omarchy / Linux packaging (separate consumer).

---

## Suggested sequence

1. Port move + `/api/tags` shim + tests in **dottie-local** (this repo).
2. README “desktop” section + acceptance curls.
3. PR on **dottie-desktop**: provider + gateway route + Settings copy.
4. Manual smoke: cold engine start → picker → chat.
5. Optional: deprecate Ollama as default local; keep as optional.

---

## Smoke curls (after P0)

```bash
dottie-local start
curl -s http://127.0.0.1:1318/health
curl -s http://127.0.0.1:1318/api/tags
curl -s http://127.0.0.1:1318/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"gemma","messages":[{"role":"user","content":"hi"}],"stream":false}'
```

(Adjust port if proposal changes.)

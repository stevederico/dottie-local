# Dottie-local To-Do

Open inference-façade work from the harness / local-ai-cli replacement thread.

- [ ] Docs/install so `ask` / `llm-server` win PATH over old local-ai-cli bins
- [ ] Document desktop/consumer wiring (point apps at this HTTP, not Ollama-only)
- [ ] Keep agent surface thin — harness features stay in dotbot

## Done

- [x] Scaffold HTTP + MCP + CLI
- [x] Attach/spawn llama-server
- [x] `ask` / `llm-server` drop-ins (local-ai-cli LLM parity)
- [x] Stream SSE, stdin append, `LLM_REASON`, `LLM_PORT`
- [x] Optional agent via `@stevederico/dotbot`
- [x] Public GitHub repo

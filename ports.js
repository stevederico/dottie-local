/**
 * Local LLM ports — package-owned (standalone).
 * Engine defaults to 8080 so an already-running `llm-server` / llama-server is reused.
 * HTTP façade sits next to dottie-talk (:1320).
 */
export const PORTS = Object.freeze({
  ENGINE_PORT: Number(process.env.DOTTIE_LOCAL_ENGINE_PORT || 8080),
  HTTP_PORT: Number(process.env.DOTTIE_LOCAL_HTTP_PORT || 1321),
});

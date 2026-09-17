/**
 * Local LLM ports — package-owned (standalone).
 * Engine defaults to 8080 (LLM_PORT / llm-server).
 * HTTP :1318 (desktop stack; mac-use owns :1321).
 */
export const PORTS = Object.freeze({
  ENGINE_PORT: Number(
    process.env.DOTTIE_LOCAL_ENGINE_PORT || process.env.LLM_PORT || 8080,
  ),
  HTTP_PORT: Number(process.env.DOTTIE_LOCAL_HTTP_PORT || 1318),
});

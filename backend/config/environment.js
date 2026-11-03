function validateEnvironment(env) {
  for (const key of ["MONGO_URI", "JWT_SECRET", "GEMINI_API_KEY"]) {
    if (!env[key]?.trim()) throw new Error(`Missing required environment variable: ${key}`);
  }
  const secret = env.JWT_SECRET;
  if (/^(?:replace.*|your[_ -].*|change.*|secret|supersecret|jwt[_ -]?secret|test[_ -]?secret|password)$/i.test(secret.trim())) {
    throw new Error("JWT_SECRET must not be a placeholder");
  }
  const production = env.NODE_ENV === "production";
  if (production && (Buffer.byteLength(secret) < 32 || new Set(secret).size < 12)) {
    throw new Error("Production JWT_SECRET must be a strong random secret of at least 32 bytes");
  }
  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  if (production && !env.FRONTEND_ORIGIN?.trim()) throw new Error("Production FRONTEND_ORIGIN is required");
  const origins = (env.FRONTEND_ORIGIN || "http://localhost:5173").split(",").map(value => value.trim());
  for (const origin of origins) {
    let url;
    try { url = new URL(origin); } catch { throw new Error("Invalid FRONTEND_ORIGIN"); }
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin || url.username || url.password ||
        (production && (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
      throw new Error("FRONTEND_ORIGIN must contain exact HTTP origins; production requires HTTPS public origins");
    }
  }
  return { port, origins };
}
module.exports = { validateEnvironment };

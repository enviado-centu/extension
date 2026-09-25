// Funciones puras sobre direcciones. Siempre con new URL(): nunca partir la URL a mano
// (en https://bna.com.ar@sitio-malo.com el sitio real es sitio-malo.com).

const ESQUEMAS = new Set(["http:", "https:"]);
// Páginas locales: el propio backend, el frontend de desarrollo (localhost:5173), etc.
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);
// Mismo tope que el backend: más larga, POST /public/analizar responde 422
export const LARGO_MAXIMO_URL = 2048;

/** URL parseada o null si no es válida. */
export function parsear(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Nombre del sitio en minúsculas y sin punto final ("" si la URL no es válida). */
export function hostDe(url) {
  const u = parsear(url);
  return u ? u.hostname.replace(/\.$/, "") : "";
}

/** true si la página se manda a analizar: http/https, con sitio, hasta 2048 caracteres,
 * que no sea local ni la API. */
export function debeAnalizar(url, apiUrl) {
  if (typeof url !== "string" || url.length > LARGO_MAXIMO_URL) return false;
  const u = parsear(url);
  if (!u || !ESQUEMAS.has(u.protocol)) return false;
  const host = hostDe(url);
  if (!host || HOSTS_LOCALES.has(host)) return false;
  return host !== hostDe(apiUrl);
}

/** Clave de caché: la URL sin fragmento (#...), con la query. null si no es válida. */
export function claveCache(url) {
  const u = parsear(url);
  if (!u) return null;
  u.hash = "";
  return u.href;
}

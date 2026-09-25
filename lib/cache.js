// Caché de resultados del backend, sobre un objeto plano {clave: {resultado, guardadoEn}}
// para poder guardarlo tal cual en chrome.storage.session. Las funciones no lo modifican.

export const VIGENCIA_MS = 10 * 60 * 1000;
export const MAX_ENTRADAS = 500;

/** Resultado guardado para la clave, o null si no está o ya venció. */
export function leerCache(cache, clave, ahora) {
  const entrada = cache?.[clave];
  if (!entrada || ahora - entrada.guardadoEn >= VIGENCIA_MS) return null;
  return entrada.resultado;
}

/** Copia de la caché con la entrada nueva, sin vencidas y con a lo sumo MAX_ENTRADAS. */
export function guardarCache(cache, clave, resultado, ahora) {
  const vigentes = Object.entries(cache ?? {}).filter(
    ([k, e]) => k !== clave && ahora - e.guardadoEn < VIGENCIA_MS
  );
  vigentes.push([clave, { resultado, guardadoEn: ahora }]);
  // Si sobran, salen las más viejas
  vigentes.sort((a, b) => a[1].guardadoEn - b[1].guardadoEn);
  return Object.fromEntries(vigentes.slice(-MAX_ENTRADAS));
}

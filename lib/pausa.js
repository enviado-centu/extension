// Pausa tras un 429 del backend: no se vuelve a consultar hasta que pase el Retry-After.

export const PAUSA_POR_DEFECTO_S = 60;

/** Momento (ms) hasta el que no se consulta. retryAfter es el header tal cual llega
 * (string o null); si falta, no es un número de segundos o es negativo, se usan 60 s. */
export function pausaHasta(retryAfter, ahora) {
  const texto = retryAfter == null ? "" : String(retryAfter).trim();
  const segundos = texto === "" ? NaN : Number(texto);
  const valido = Number.isFinite(segundos) && segundos >= 0;
  return ahora + Math.ceil(valido ? segundos : PAUSA_POR_DEFECTO_S) * 1000;
}

/** true mientras dure la pausa. Sin pausa guardada (null/undefined): false. */
export function enPausa(hasta, ahora) {
  return typeof hasta === "number" && ahora < hasta;
}

// Lista blanca local (GET /public/lista-blanca): {version, marcas: [{id, nombre, dominios}]}.
// Todos sus dominios son registrables, así que "host igual o subdominio de d" equivale
// al es_oficial del backend.

import { hostDe } from "./url.js";

export const VIGENCIA_LISTA_MS = 60 * 60 * 1000; // igual al Cache-Control del backend

// Mismo consejo que da el backend para el nivel bajo (app/services/risk_service.py, TIPS["low"])
export const TIP_BAJO =
  "No encontramos señales de riesgo. Igual, nunca compartas claves ni códigos que te pidan por mensaje.";

/** Marca oficial de la URL ({id, nombre, dominio}) o null. */
export function marcaOficial(url, lista) {
  const host = hostDe(url);
  if (!host || !lista?.marcas) return null;

  let elegida = null;
  for (const marca of lista.marcas) {
    for (const dominio of marca.dominios) {
      if (host !== dominio && !host.endsWith("." + dominio)) continue;
      // Si un dominio es de varias marcas, gana la que lo tiene como principal (como el backend)
      const principal = marca.dominios[0] === dominio;
      if (!elegida || (principal && !elegida.principal)) {
        elegida = { id: marca.id, nombre: marca.nombre, dominio, principal };
      }
    }
  }
  if (!elegida) return null;
  const { principal, ...marca } = elegida;
  return marca;
}

/** Marca por su nombre legible (el "brand" del backend): {id, nombre, dominio principal} o null. */
export function marcaPorNombre(nombre, lista) {
  const marca = lista?.marcas?.find((m) => m.nombre === nombre);
  return marca ? { id: marca.id, nombre: marca.nombre, dominio: marca.dominios[0] } : null;
}

/** Resultado con la misma forma que POST /public/analizar, armado sin consultar al backend. */
export function resultadoOficialLocal(url, marca) {
  return {
    url,
    dominio: marca.dominio,
    summary: {
      score_100: 0,
      level: "low",
      source: "sitio_oficial_local",
      reasons: [`Es el sitio oficial de ${marca.nombre}`],
      tip: TIP_BAJO,
      brand: null,
      official_brand: marca.nombre,
    },
  };
}

/** true si no hay lista o si se bajó hace más de una hora. */
export function listaVencida(lista, ahora) {
  return !lista?.marcas || !lista.bajadaEn || ahora - lista.bajadaEn >= VIGENCIA_LISTA_MS;
}

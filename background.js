// Service worker: analiza la página principal de cada pestaña y pinta el ícono.
// Chrome lo puede apagar en cualquier momento: todo el estado que importa vive en
// chrome.storage (session para pestañas, caché y pausa; local para la lista blanca).
// En memoria solo quedan cosas que se pueden perder sin problema (pedidos en curso,
// temporizadores del debounce e íconos ya dibujados).

import { API_URL } from "./config.js";
import { guardarCache, leerCache } from "./lib/cache.js";
import { nivelVisual } from "./lib/estado.js";
import { listaVencida, marcaOficial, marcaPorNombre, resultadoOficialLocal } from "./lib/lista-blanca.js";
import { enPausa, pausaHasta } from "./lib/pausa.js";
import { claveCache, debeAnalizar } from "./lib/url.js";

const TIMEOUT_MS = 5000;
const DEBOUNCE_SPA_MS = 1000;
const TAMANIOS_ICONO = [16, 32];
const COLOR_TEXTO_BADGE = "#ffffff";

const sesion = chrome.storage.session;
const local = chrome.storage.local;
const claveTab = (tabId) => `tab:${tabId}`;

const pedidosEnCurso = new Map(); // clave de caché -> Promise del resultado
const debounces = new Map(); // tabId -> temporizador de onHistoryStateUpdated
const iconos = new Map(); // color -> imageData

// ---------------------------------------------------------------- almacenamiento

async function leer(area, clave) {
  return (await area.get(clave))[clave];
}

// Las lecturas-modificaciones-escrituras de storage van en fila, para que dos
// navegaciones simultáneas no se pisen. Lo que corre en la fila no vuelve a encolar.
let fila = Promise.resolve();
function enFila(tarea) {
  const resultado = fila.then(tarea);
  fila = resultado.catch(() => {});
  return resultado;
}

// ---------------------------------------------------------------- backend

async function pedir(ruta, opciones = {}) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    const respuesta = await fetch(`${API_URL}${ruta}`, { ...opciones, signal: controlador.signal });
    if (respuesta.status === 429) {
      await sesion.set({ pausaHasta: pausaHasta(respuesta.headers.get("Retry-After"), Date.now()) });
    }
    return respuesta;
  } finally {
    clearTimeout(temporizador);
  }
}

async function enPausaAhora() {
  return enPausa(await leer(sesion, "pausaHasta"), Date.now());
}

// ---------------------------------------------------------------- lista blanca

let bajandoLista = null;

/** Baja GET /public/lista-blanca y la guarda con su version. null si no se pudo. */
function bajarListaBlanca() {
  bajandoLista ??= (async () => {
    try {
      if (await enPausaAhora()) return null;
      const respuesta = await pedir("/public/lista-blanca");
      // 503, 429 u otro error: se reintenta en una próxima navegación
      if (!respuesta.ok) return null;
      const { version, marcas } = await respuesta.json();
      if (!version || !Array.isArray(marcas)) return null;
      const lista = { version, marcas, bajadaEn: Date.now() };
      await local.set({ listaBlanca: lista });
      return lista;
    } catch {
      return null;
    } finally {
      bajandoLista = null;
    }
  })();
  return bajandoLista;
}

/** Lista guardada. Si no hay, espera a bajarla; si está vieja, la renueva sin esperar. */
async function obtenerLista() {
  const lista = await leer(local, "listaBlanca");
  if (!lista) return bajarListaBlanca();
  if (listaVencida(lista, Date.now())) bajarListaBlanca();
  return lista;
}

// ---------------------------------------------------------------- análisis

/** POST /public/analizar con caché y sin pedidos duplicados. Lanza si no hay resultado. */
function consultarBackend(clave, saltearCache) {
  if (pedidosEnCurso.has(clave)) return pedidosEnCurso.get(clave);

  const pedido = (async () => {
    if (!saltearCache) {
      const guardado = leerCache(await leer(sesion, "cache"), clave, Date.now());
      if (guardado) return guardado;
    }
    if (await enPausaAhora()) throw new Error("En pausa por demasiadas consultas");

    // Se manda la URL sin fragmento: el #... nunca sale del navegador
    const respuesta = await pedir("/public/analizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: clave }),
    });
    if (!respuesta.ok) throw new Error(`El backend respondió ${respuesta.status}`);
    const resultado = await respuesta.json();
    if (!resultado?.summary?.level) throw new Error("Respuesta sin summary");

    await enFila(async () => {
      const cache = guardarCache(await leer(sesion, "cache"), clave, resultado, Date.now());
      await sesion.set({ cache });
    });
    return resultado;
  })();

  pedidosEnCurso.set(clave, pedido);
  pedido.finally(() => pedidosEnCurso.delete(clave)).catch(() => {});
  return pedido;
}

async function analizarPestania(tabId, url, { saltearCache = false } = {}) {
  if (!debeAnalizar(url, API_URL)) {
    return fijarEstado(tabId, { url, estado: "no-analiza" });
  }
  // Esta es la navegación más nueva de la pestaña: lo que termine después solo se
  // guarda si la pestaña sigue en esta URL
  await fijarEstado(tabId, { url, estado: "analizando" });

  const marca = marcaOficial(url, await obtenerLista());
  if (marca) {
    return fijarEstado(tabId, { url, estado: "resultado", resultado: resultadoOficialLocal(url, marca) }, true);
  }

  try {
    const resultado = await consultarBackend(claveCache(url), saltearCache);
    return fijarEstado(tabId, { url, estado: "resultado", resultado }, true);
  } catch {
    // Error, timeout (5 s) o 429: se muestra gris con "?"
    return fijarEstado(tabId, { url, estado: "error" }, true);
  }
}

// ---------------------------------------------------------------- estado por pestaña

/** Guarda el estado de la pestaña y actualiza ícono y content script.
 * Con soloSiSigue, no pisa el estado si la pestaña ya navegó a otra URL. */
async function fijarEstado(tabId, estado, soloSiSigue = false) {
  const guardado = await enFila(async () => {
    if (soloSiSigue) {
      const actual = await leer(sesion, claveTab(tabId));
      if (actual?.url !== estado.url) return false;
    }
    await sesion.set({ [claveTab(tabId)]: estado });
    return true;
  });
  if (!guardado) return null;
  await mostrarEnIcono(tabId, estado);
  await avisarAlContenido(tabId, estado);
  return estado;
}

function dibujarIcono(color) {
  if (iconos.has(color)) return iconos.get(color);
  const imageData = {};
  for (const tam of TAMANIOS_ICONO) {
    const ctx = new OffscreenCanvas(tam, tam).getContext("2d");
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(tam / 2, tam / 2, tam * 0.48, 0, 2 * Math.PI);
    ctx.fill();
    // Mismo anillo blanco que el ícono por defecto
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = tam * 0.12;
    ctx.beginPath();
    ctx.arc(tam / 2, tam / 2, tam * 0.24, 0, 2 * Math.PI);
    ctx.stroke();
    imageData[tam] = ctx.getImageData(0, 0, tam, tam);
  }
  iconos.set(color, imageData);
  return imageData;
}

async function mostrarEnIcono(tabId, estado) {
  const { color, badge } = nivelVisual(estado);
  try {
    await chrome.action.setIcon({ tabId, imageData: dibujarIcono(color) });
    await chrome.action.setBadgeText({ tabId, text: badge });
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setBadgeTextColor?.({ tabId, color: COLOR_TEXTO_BADGE });
  } catch {
    // La pestaña se cerró mientras tanto
  }
}

async function avisarAlContenido(tabId, estado) {
  try {
    await chrome.tabs.sendMessage(tabId, { tipo: "resultado", estado }, { frameId: 0 });
  } catch {
    // Todavía no hay content script (o la página no lo admite): lo pide él al cargar
  }
}

// ---------------------------------------------------------------- eventos

chrome.runtime.onInstalled.addListener(() => bajarListaBlanca());
chrome.runtime.onStartup.addListener(() => bajarListaBlanca());

chrome.webNavigation.onCommitted.addListener(({ tabId, frameId, url }) => {
  if (frameId !== 0 || tabId < 0) return;
  clearTimeout(debounces.get(tabId));
  debounces.delete(tabId);
  analizarPestania(tabId, url);
});

// Sitios de una sola página: cambian la URL sin recargar. Se espera 1 s sin cambios
// para no gastar el límite de pedidos del backend.
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, frameId, url }) => {
  if (frameId !== 0 || tabId < 0) return;
  clearTimeout(debounces.get(tabId));
  debounces.set(
    tabId,
    setTimeout(() => {
      debounces.delete(tabId);
      analizarPestania(tabId, url);
    }, DEBOUNCE_SPA_MS)
  );
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTimeout(debounces.get(tabId));
  debounces.delete(tabId);
  enFila(() => sesion.remove(claveTab(tabId)));
});

// ---------------------------------------------------------------- mensajes

// Del content script (siempre trae sender.tab)
const MENSAJES_DE_PAGINA = {
  // El content script puede cargar antes o después de que llegue el resultado
  async "obtener-resultado"(_mensaje, sender) {
    const estado = await leer(sesion, claveTab(sender.tab.id));
    if (!estado || claveCache(estado.url) !== claveCache(sender.url)) return null;
    return { estado };
  },
};

// Del panel (no trae sender.tab)
const MENSAJES_DEL_PANEL = {
  async "obtener-estado"({ tabId }) {
    const estado = await leer(sesion, claveTab(tabId));
    const brand = estado?.resultado?.summary?.brand;
    const marcaImitada = brand ? marcaPorNombre(brand, await leer(local, "listaBlanca")) : null;
    return { estado: estado ?? null, marcaImitada };
  },

  async reanalizar({ tabId, saltearCache = true }) {
    const tab = await chrome.tabs.get(tabId);
    await analizarPestania(tabId, tab.url, { saltearCache });
    return MENSAJES_DEL_PANEL["obtener-estado"]({ tabId });
  },
};

chrome.runtime.onMessage.addListener((mensaje, sender, responder) => {
  if (sender.id !== chrome.runtime.id) return false;
  const manejadores = sender.tab ? MENSAJES_DE_PAGINA : MENSAJES_DEL_PANEL;
  const manejador = Object.hasOwn(manejadores, mensaje?.tipo) ? manejadores[mensaje.tipo] : null;
  if (!manejador) return false;
  manejador(mensaje, sender).then(responder, () => responder(null));
  return true; // la respuesta es asincrónica
});

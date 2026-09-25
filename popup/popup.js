// Panel: muestra el estado de la pestaña activa. Todo lo consulta al service worker;
// los textos del backend (motivos, consejo) se muestran siempre con textContent.

import { NIVELES, TEXTOS } from "../lib/estado.js";
import { claveCache, hostDe } from "../lib/url.js";

const $ = (id) => document.getElementById(id);
let tabId = null;

function mostrarMensaje(texto, { conBoton = false } = {}) {
  $("mensaje").textContent = texto;
  $("mensaje").hidden = false;
  $("resultado").hidden = true;
  $("reanalizar").hidden = !conBoton;
}

function mostrarResultado(resultado, marcaImitada, url) {
  const { summary } = resultado;
  const nivel = NIVELES[summary.level];

  $("resultado").style.setProperty("--nivel", nivel.color);
  $("nivel-texto").textContent = nivel.texto;
  $("puntaje").textContent = `Puntaje: ${summary.score_100} de 100`;
  $("dominio").textContent = `Sitio: ${resultado.dominio || hostDe(url)}`;

  const marca = $("marca");
  marca.hidden = false;
  if (summary.official_brand) {
    marca.textContent = `Sitio oficial de ${summary.official_brand}`;
  } else if (summary.brand && marcaImitada) {
    marca.textContent = `Menciona a ${summary.brand}, pero el sitio oficial es ${marcaImitada.dominio}`;
  } else if (summary.brand) {
    marca.textContent = `Menciona a ${summary.brand}, pero no es su sitio oficial`;
  } else {
    marca.hidden = true;
  }

  const motivos = $("motivos");
  motivos.replaceChildren(
    ...(summary.reasons ?? []).map((motivo) => {
      const li = document.createElement("li");
      li.textContent = motivo;
      return li;
    })
  );
  $("motivos-titulo").hidden = motivos.childElementCount === 0;
  $("consejo").textContent = summary.tip ?? "";

  $("mensaje").hidden = true;
  $("resultado").hidden = false;
  $("reanalizar").hidden = false;
}

function mostrar(respuesta, url) {
  const estado = respuesta?.estado;
  if (!estado || estado.estado === "analizando") return mostrarMensaje(TEXTOS.analizando);
  if (estado.estado === "no-analiza") return mostrarMensaje(TEXTOS.noAnaliza);
  if (estado.estado === "resultado" && NIVELES[estado.resultado?.summary?.level]) {
    return mostrarResultado(estado.resultado, respuesta.marcaImitada, estado.url);
  }
  return mostrarMensaje(TEXTOS.error, { conBoton: true });
}

async function pedir(mensaje) {
  try {
    return await chrome.runtime.sendMessage(mensaje);
  } catch {
    return null;
  }
}

async function actualizar(url) {
  mostrar(await pedir({ tipo: "obtener-estado", tabId }), url);
}

async function iniciar() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return mostrarMensaje(TEXTOS.noAnaliza);
  tabId = tab.id;

  // El service worker va avisando por storage: "Analizando…" pasa solo al resultado
  chrome.storage.onChanged.addListener((cambios, area) => {
    if (area === "session" && `tab:${tabId}` in cambios) actualizar(tab.url);
  });

  $("reanalizar").addEventListener("click", async () => {
    $("reanalizar").disabled = true;
    mostrarMensaje(TEXTOS.analizando);
    mostrar(await pedir({ tipo: "reanalizar", tabId, saltearCache: true }), tab.url);
    $("reanalizar").disabled = false;
  });

  const respuesta = await pedir({ tipo: "obtener-estado", tabId });
  // Pestaña abierta antes de instalar la extensión o estado de otra URL: se analiza ahora
  if (!respuesta?.estado || claveCache(respuesta.estado.url) !== claveCache(tab.url)) {
    mostrarMensaje(TEXTOS.analizando);
    return mostrar(await pedir({ tipo: "reanalizar", tabId, saltearCache: false }), tab.url);
  }
  mostrar(respuesta, tab.url);
}

iniciar();

// Arnés del service worker: simula chrome.* y el backend (fetch) y ejercita background.js
// en Node, sin navegador. Solo módulos de Node: no hace falta npm install.
// Uso: node tests/e2e/service-worker.mjs  (tarda unos 7 s por el caso del timeout)
import assert from "node:assert/strict";

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const clonar = (x) => (x === undefined ? undefined : structuredClone(x));

function area() {
  const datos = {};
  return {
    datos,
    async get(k) { return k in datos ? { [k]: clonar(datos[k]) } : {}; },
    async set(o) { for (const [k, v] of Object.entries(o)) datos[k] = clonar(v); },
    async remove(k) { delete datos[k]; },
  };
}
function evento() {
  const l = [];
  return { addListener: (f) => l.push(f), disparar: (...a) => l.map((f) => f(...a)) };
}

const acciones = {}; // tabId -> {badge, color}
const mensajesContenido = [];
const pestanias = {};
const ev = { installed: evento(), startup: evento(), committed: evento(), history: evento(), removed: evento(), message: evento() };

globalThis.OffscreenCanvas = class {
  constructor(w, h) { this.w = w; }
  getContext() {
    return { beginPath() {}, arc() {}, fill() {}, stroke() {}, getImageData: () => ({ ancho: this.w }) };
  }
};
globalThis.chrome = {
  runtime: { id: "ext", onInstalled: ev.installed, onStartup: ev.startup, onMessage: ev.message },
  storage: { session: area(), local: area() },
  webNavigation: { onCommitted: ev.committed, onHistoryStateUpdated: ev.history },
  tabs: {
    onRemoved: ev.removed,
    async get(id) { return pestanias[id]; },
    async sendMessage(tabId, m) { mensajesContenido.push({ tabId, m }); },
  },
  action: {
    async setIcon({ tabId, imageData }) { (acciones[tabId] ??= {}).icono = Object.keys(imageData).join(","); },
    async setBadgeText({ tabId, text }) { (acciones[tabId] ??= {}).badge = text; },
    async setBadgeBackgroundColor({ tabId, color }) { (acciones[tabId] ??= {}).color = color; },
    async setBadgeTextColor() {},
  },
};

// ---- backend simulado
const pedidos = [];
let modo = "ok";
const LISTA = { version: "v1", marcas: [{ id: "bna", nombre: "Banco Nación", dominios: ["bna.com.ar"] }] };
function summary(level, extra = {}) {
  return { score_100: { low: 0, medium: 50, high: 100 }[level], level, source: "analisis", reasons: ["r"], tip: "t", brand: null, official_brand: null, ...extra };
}
globalThis.fetch = async (url, op = {}) => {
  const ruta = new URL(url).pathname;
  const body = op.body ? JSON.parse(op.body) : null;
  pedidos.push({ ruta, body });
  const json = (status, datos, headers = {}) => ({ ok: status < 400, status, headers: new Headers(headers), json: async () => datos });
  if (ruta === "/public/lista-blanca") return json(200, LISTA);
  if (modo === "429") return json(429, { detail: "x" }, { "Retry-After": "30" });
  if (modo === "cuelga") {
    return new Promise((_, rechazar) => op.signal.addEventListener("abort", () => rechazar(new Error("abortado"))));
  }
  if (modo === "lento") await esperar(300);
  const nivel = body.url.includes("malo") ? "high" : body.url.includes("medio") ? "medium" : "low";
  const extra = body.url.includes("imita") ? { brand: "Banco Nación" } : {};
  return json(200, { url: body.url, dominio: "x", summary: summary(nivel, extra) });
};

const analizar = () => pedidos.filter((p) => p.ruta === "/public/analizar");
const estado = (tabId) => chrome.storage.session.datos[`tab:${tabId}`];
const navegar = async (tabId, url, ms = 30) => {
  pestanias[tabId] = { id: tabId, url };
  ev.committed.disparar({ tabId, frameId: 0, url });
  await esperar(ms);
};
const mensaje = (m, sender) => new Promise((r) => { const [asinc] = ev.message.disparar(m, { id: "ext", ...sender }, r); if (!asinc) r(undefined); });

await import(new URL("../../background.js", import.meta.url).href);
const ok = (n) => console.log("✔", n);

ev.installed.disparar();
await esperar(20);
assert.equal(chrome.storage.local.datos.listaBlanca.version, "v1");
ok("lista blanca bajada al instalar");

await navegar(1, "chrome://extensions");
assert.equal(estado(1).estado, "no-analiza");
assert.equal(acciones[1].badge, "");
ok("chrome:// -> no se analiza, gris sin badge");

await navegar(1, "https://www.bna.com.ar/personas");
assert.equal(estado(1).resultado.summary.source, "sitio_oficial_local");
assert.equal(analizar().length, 0);
assert.equal(acciones[1].badge, "OK");
ok("sitio oficial resuelto localmente, sin consultar al backend");

await navegar(2, "https://sitio-malo.com/login#frag");
assert.equal(estado(2).resultado.summary.level, "high");
assert.equal(acciones[2].badge, "!!");
assert.equal(analizar()[0].body.url, "https://sitio-malo.com/login");
assert.ok(mensajesContenido.some((x) => x.tabId === 2 && x.m.estado.estado === "resultado"));
ok("riesgo alto: badge !!, sin fragmento al backend, aviso al content script");

await navegar(3, "https://sitio-malo.com/login");
assert.equal(analizar().length, 1);
ok("caché: la misma URL no se vuelve a pedir");

modo = "lento";
pestanias[4] = { url: "https://medio.com/" };
pestanias[5] = { url: "https://medio.com/" };
ev.committed.disparar({ tabId: 4, frameId: 0, url: "https://medio.com/" });
ev.committed.disparar({ tabId: 5, frameId: 0, url: "https://medio.com/" });
await esperar(400);
assert.equal(analizar().filter((p) => p.body.url === "https://medio.com/").length, 1);
assert.equal(acciones[4].badge, "!");
assert.equal(acciones[5].badge, "!");
ok("dos pestañas con la misma URL hacen un solo pedido");

ev.committed.disparar({ tabId: 6, frameId: 0, url: "https://lento-a.com/" });
await esperar(10);
await navegar(6, "https://www.bna.com.ar/");
await esperar(400);
assert.equal(estado(6).url, "https://www.bna.com.ar/");
assert.equal(estado(6).resultado.summary.source, "sitio_oficial_local");
ok("una respuesta tardía no pisa la navegación nueva");
modo = "ok";

ev.committed.disparar({ tabId: 7, frameId: 1, url: "https://iframe.com/" });
await esperar(30);
assert.equal(estado(7), undefined);
ok("se ignoran los frames que no son el principal");

for (const u of ["https://spa.com/a", "https://spa.com/b", "https://spa.com/c"]) {
  ev.history.disparar({ tabId: 8, frameId: 0, url: u });
  await esperar(100);
}
assert.equal(estado(8), undefined);
await esperar(1100);
assert.deepEqual(analizar().filter((p) => p.body.url.startsWith("https://spa.com")).map((p) => p.body.url), ["https://spa.com/c"]);
ok("debounce de 1 s en onHistoryStateUpdated: 3 cambios, 1 pedido");

let r = await mensaje({ tipo: "obtener-resultado" }, { tab: { id: 2 }, url: "https://sitio-malo.com/login#otro" });
assert.equal(r.estado.resultado.summary.level, "high");
r = await mensaje({ tipo: "obtener-resultado" }, { tab: { id: 2 }, url: "https://otra.com/" });
assert.equal(r, null);
ok("obtener-resultado responde solo si la URL coincide");

await navegar(9, "https://imita-bna.com/");
r = await mensaje({ tipo: "obtener-estado", tabId: 9 }, {});
assert.deepEqual(r.marcaImitada, { id: "bna", nombre: "Banco Nación", dominio: "bna.com.ar" });
ok("obtener-estado trae la marca imitada con su dominio oficial");

const antes = analizar().length;
r = await mensaje({ tipo: "reanalizar", tabId: 9 }, {});
assert.equal(analizar().length, antes + 1);
assert.equal(r.estado.estado, "resultado");
ok("reanalizar saltea la caché");

r = await mensaje({ tipo: "reanalizar", tabId: 9 }, { tab: { id: 9 } });
assert.equal(r, undefined);
ok("una página no puede usar los mensajes del panel");

modo = "429";
await navegar(10, "https://nuevo-1.com/");
assert.equal(estado(10).estado, "error");
assert.equal(acciones[10].badge, "?");
assert.ok(chrome.storage.session.datos.pausaHasta > Date.now() + 29_000);
const tras429 = analizar().length;
modo = "ok";
await navegar(10, "https://nuevo-2.com/");
assert.equal(analizar().length, tras429);
assert.equal(estado(10).estado, "error");
ok("429: badge ?, pausa de Retry-After y no se consulta durante la pausa");
delete chrome.storage.session.datos.pausaHasta;

modo = "cuelga";
const t0 = Date.now();
await navegar(11, "https://cuelga.com/", 5300);
assert.equal(estado(11).estado, "error");
assert.ok(Date.now() - t0 >= 5000);
ok("timeout de 5 s: error con ?");
modo = "ok";

ev.removed.disparar(2);
await esperar(20);
assert.equal(estado(2), undefined);
ok("al cerrar la pestaña se borra su estado");

console.log("\nTodo OK");

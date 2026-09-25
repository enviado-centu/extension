// Prueba de punta a punta: navegador headless con la extensión cargada, el backend real
// (API_URL de config.js, rama feature/endpoint-publico) y páginas de prueba servidas acá
// mismo en :8772. Los dominios de prueba se redirigen a 127.0.0.1 con --host-resolver-rules.
// Se controla el navegador por CDP con el WebSocket de Node: no hace falta npm install.
//
// Uso: node tests/e2e/navegador.mjs
// Navegador: Edge por defecto; otro con NAVEGADOR=<ruta al ejecutable>. Chrome con marca
// (137 o más nuevo) ignora --load-extension: usá Edge, Chromium o Chrome for Testing.
// Capturas y perfil temporal: tests/e2e/salida/ (ignorada por git).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const EXT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const S = fileURLToPath(new URL("./salida", import.meta.url));
const CANDIDATOS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/microsoft-edge",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];
const EDGE = process.env.NAVEGADOR ?? CANDIDATOS.find((ruta) => existsSync(ruta));
if (!EDGE) throw new Error("No encontré Edge: indicá el navegador con NAVEGADOR=<ruta>");
const PUERTO_WEB = 8772;
const PUERTO_CDP = 9333;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (n) => console.log("✔", n);

// Página "hostil": CSS agresivo, autofocus y un listener de teclado que cuenta teclas
const PAGINA = `<!doctype html><html><head><meta charset="utf-8"><title>prueba</title>
<style>* { color: red !important; font-size: 40px !important; } div, ul, button { display: none !important; }
body { background: #ffe; }</style></head>
<body><h1>Página de prueba</h1><input autofocus placeholder="clave">
<script>window.__teclas = 0; document.addEventListener("keydown", () => window.__teclas++, true);</script>
</body></html>`;
// El backend tiene que estar corriendo antes de abrir el navegador
const { API_URL } = await import(new URL("../../config.js", import.meta.url).href);
try {
  const r = await fetch(`${API_URL}/public/lista-blanca`);
  if (!r.ok) throw new Error(`respondió ${r.status}`);
} catch (e) {
  throw new Error(`El backend no responde en ${API_URL} (${e.message}). Levantalo en la rama feature/endpoint-publico.`);
}

const web = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(PAGINA);
}).listen(PUERTO_WEB);

const PERFIL = `${S}/perfil`;
rmSync(PERFIL, { recursive: true, force: true });
mkdirSync(PERFIL, { recursive: true });
const edge = spawn(EDGE, [
  "--headless=new", `--remote-debugging-port=${PUERTO_CDP}`, `--user-data-dir=${PERFIL}`,
  `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`, "--no-first-run",
  "--window-size=1100,800",
  "--host-resolver-rules=MAP bna-homebanking-verificar.xyz 127.0.0.1, MAP www.bna.com.ar 127.0.0.1, " +
    "MAP mercadopago-reintegros.com 127.0.0.1, MAP bna-seguridad-verificar.top 127.0.0.1",
], { stdio: "ignore" });

// ------------------------------------------------------------ CDP mínimo
let ws;
for (let i = 0; i < 50 && !ws; i++) {
  try {
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/version`)).json();
    ws = new WebSocket(webSocketDebuggerUrl);
  } catch {
    await esperar(200);
  }
}
await new Promise((r) => ws.addEventListener("open", r));
let siguienteId = 0;
const pendientes = new Map();
ws.addEventListener("message", ({ data }) => {
  const m = JSON.parse(data);
  if (m.id && pendientes.has(m.id)) {
    const { resolver, rechazar } = pendientes.get(m.id);
    pendientes.delete(m.id);
    m.error ? rechazar(new Error(JSON.stringify(m.error))) : resolver(m.result);
  }
});
const cdp = (method, params = {}, sessionId) =>
  new Promise((resolver, rechazar) => {
    const id = ++siguienteId;
    pendientes.set(id, { resolver, rechazar });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

async function evaluar(sesion, expresion) {
  const r = await cdp("Runtime.evaluate", { expression: expresion, awaitPromise: true, returnByValue: true }, sesion);
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

// Service worker de la extensión
let sw = null;
for (let i = 0; i < 50 && !sw; i++) {
  const { targetInfos } = await cdp("Target.getTargets");
  sw = targetInfos.find((t) => t.type === "service_worker" && t.url.endsWith("/background.js"));
  if (!sw) await esperar(200);
}
assert.ok(sw, "no apareció el service worker de la extensión");
const sesionSW = (await cdp("Target.attachToTarget", { targetId: sw.targetId, flatten: true })).sessionId;
ok(`extensión cargada en ${EDGE}`);

async function nuevaPestania(url) {
  const { targetId } = await cdp("Target.createTarget", { url });
  const { sessionId } = await cdp("Target.attachToTarget", { targetId, flatten: true });
  await cdp("Page.enable", {}, sessionId);
  await cdp("DOM.enable", {}, sessionId);
  return { targetId, sesion: sessionId };
}
const navegar = (p, url) => cdp("Page.navigate", { url }, p.sesion);

async function estadoExtension() {
  return evaluar(sesionSW, `(async () => {
    const tabs = await chrome.tabs.query({});
    const sesion = await chrome.storage.session.get(null);
    return { tabs: await Promise.all(tabs.map(async (t) => ({ id: t.id, url: t.url, pendiente: t.pendingUrl ?? null,
      badge: await chrome.action.getBadgeText({ tabId: t.id }) }))),
      sesion, lista: (await chrome.storage.local.get("listaBlanca")).listaBlanca?.version };
  })()`);
}
const pestaniaCon = (est, parte) => est.tabs.find((t) => t.url.includes(parte));

async function cartel(p) {
  const { root } = await cdp("DOM.getDocument", { depth: -1, pierce: true }, p.sesion);
  const buscar = (n) => (n.nodeName === "DETECTOR-ENGANOS-CARTEL" ? n : (n.children ?? []).map(buscar).find(Boolean));
  const host = buscar(root);
  if (!host) return null;
  const { object } = await cdp("DOM.resolveNode", { backendNodeId: host.shadowRoots[0].backendNodeId }, p.sesion);
  const r = await cdp("Runtime.callFunctionOn", {
    objectId: object.objectId, returnByValue: true,
    functionDeclaration: `function () { return {
      activo: this.activeElement?.id ?? null,
      titulo: this.getElementById("titulo").textContent,
      salir: this.getElementById("salir").textContent,
      motivos: [...this.querySelectorAll("li")].map((l) => l.textContent),
      consejo: this.getElementById("consejo").textContent,
      rol: this.querySelector("[role]").getAttribute("role"),
      visible: getComputedStyle(this.host).display !== "none" && getComputedStyle(this.host).zIndex } }`,
  }, p.sesion);
  return r.result.value;
}

async function tecla(p, key, { shift = false } = {}) {
  const codigos = { Tab: 9, Escape: 27, Enter: 13 };
  const base = { key, code: key, windowsVirtualKeyCode: codigos[key], modifiers: shift ? 8 : 0 };
  await cdp("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base }, p.sesion);
  if (key === "Enter") await cdp("Input.dispatchKeyEvent", { type: "char", text: "\r", ...base }, p.sesion);
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", ...base }, p.sesion);
  await esperar(150);
}

async function captura(p, nombre) {
  const { data } = await cdp("Page.captureScreenshot", { format: "png" }, p.sesion);
  writeFileSync(`${S}/${nombre}.png`, Buffer.from(data, "base64"));
}

try {
  await esperar(1500);
  assert.ok((await estadoExtension()).lista, "no se bajó la lista blanca");
  ok("lista blanca bajada al instalar");

  // ---- riesgo alto (lista negra)
  const alto = await nuevaPestania("about:blank");
  await navegar(alto, `http://bna-homebanking-verificar.xyz:${PUERTO_WEB}/login#x`);
  await esperar(2500);
  let est = await estadoExtension();
  assert.equal(pestaniaCon(est, "bna-homebanking").badge, "!!");
  let c = await cartel(alto);
  assert.ok(c, "no apareció el cartel");
  assert.equal(c.titulo, "Cuidado: esta página tiene señales de engaño");
  assert.equal(c.rol, "alertdialog");
  assert.equal(c.activo, "salir", "el foco no quedó en el primer botón (autofocus de la página)");
  await captura(alto, "e2e-cartel");
  ok(`riesgo alto: badge !!, cartel con foco en "${c.salir}" pese al autofocus y al CSS hostil`);
  console.log("   motivos:", c.motivos, "\n   consejo:", c.consejo);

  await tecla(alto, "Tab");
  assert.equal((await cartel(alto)).activo, "continuar");
  await tecla(alto, "Tab");
  assert.equal((await cartel(alto)).activo, "salir");
  await tecla(alto, "Tab", { shift: true });
  assert.equal((await cartel(alto)).activo, "continuar");
  ok("Tab / Shift+Tab solo recorren los dos botones");

  await tecla(alto, "Escape");
  assert.ok(await cartel(alto), "Escape cerró el cartel");
  assert.equal(await evaluar(alto.sesion, "window.__teclas"), 0);
  ok("Escape no hace nada y las teclas no le llegan a la página");

  await evaluar(alto.sesion, `document.querySelector("detector-enganos-cartel").remove()`);
  await esperar(200);
  assert.ok(await cartel(alto), "la página pudo sacar el cartel");
  ok("si la página saca el cartel, vuelve");

  // "Entiendo el riesgo, continuar": se lleva el foco con Tab y se confirma con Enter
  let actual = (await cartel(alto)).activo;
  if (actual !== "continuar") await tecla(alto, "Tab");
  await tecla(alto, "Enter");
  await esperar(300);
  assert.equal(await cartel(alto), null);
  await cdp("Page.reload", {}, alto.sesion);
  await esperar(2000);
  assert.equal(await cartel(alto), null, "después de continuar, el cartel volvió a aparecer");
  est = await estadoExtension();
  assert.deepEqual(est.sesion.continuar, { "bna-homebanking-verificar.xyz": true });
  ok("continuar: se oculta y no vuelve en esa sesión para ese dominio (ícono sigue en !!)");

  // ---- sitio oficial resuelto localmente
  const oficial = await nuevaPestania("about:blank");
  await navegar(oficial, `http://www.bna.com.ar:${PUERTO_WEB}/`);
  await esperar(1500);
  est = await estadoExtension();
  const tabOficial = pestaniaCon(est, "www.bna.com.ar");
  assert.equal(tabOficial.badge, "OK");
  assert.equal(est.sesion[`tab:${tabOficial.id}`].resultado.summary.source, "sitio_oficial_local");
  assert.ok(!Object.keys(est.sesion.cache ?? {}).some((k) => k.includes("www.bna.com.ar")));
  assert.equal(await cartel(oficial), null);
  ok("sitio oficial: badge OK, resuelto localmente (no está en la caché del backend), sin cartel");

  // ---- salir con historial: vuelve atrás
  const conHistorial = await nuevaPestania(`http://www.bna.com.ar:${PUERTO_WEB}/antes`);
  await esperar(1000);
  await navegar(conHistorial, `http://mercadopago-reintegros.com:${PUERTO_WEB}/`);
  await esperar(2500);
  c = await cartel(conHistorial);
  assert.equal(c?.salir, "Salir de esta página");
  await tecla(conHistorial, "Enter");
  await esperar(1500);
  est = await estadoExtension();
  assert.ok(est.tabs.some((t) => t.url.endsWith("/antes")), "no volvió atrás");
  ok('salir sin marca imitada: "Salir de esta página" vuelve atrás');

  // ---- salir sin historial: pestaña nueva y se cierra la riesgosa
  const antes = (await estadoExtension()).tabs.length;
  const sinHistorial = await nuevaPestania(`http://mercadopago-reintegros.com:${PUERTO_WEB}/otra`);
  await esperar(2500);
  assert.ok(await cartel(sinHistorial));
  await tecla(sinHistorial, "Enter");
  await esperar(1500);
  est = await estadoExtension();
  assert.equal(est.tabs.length, antes + 1, "cantidad de pestañas inesperada"); // +1 riesgosa, +1 nueva, -1 cerrada
  assert.ok(!est.tabs.some((t) => t.url.endsWith("/otra")), "la pestaña riesgosa sigue abierta");
  ok("salir sin historial: abre una pestaña nueva y cierra la riesgosa");

  // ---- marca imitada (reglas del backend, no lista negra)
  const imita = await nuevaPestania("about:blank");
  await navegar(imita, `http://bna-seguridad-verificar.top:${PUERTO_WEB}/login`);
  await esperar(3000);
  est = await estadoExtension();
  const tabImita = pestaniaCon(est, "bna-seguridad-verificar");
  const sum = est.sesion[`tab:${tabImita.id}`]?.resultado?.summary;
  console.log(`   bna-seguridad-verificar.top: level=${sum?.level} score=${sum?.score_100} brand=${sum?.brand} badge=${tabImita.badge}`);
  c = await cartel(imita);
  if (sum?.level === "high") {
    assert.equal(c.salir, "Ir al sitio oficial de Banco Nación");
    await captura(imita, "e2e-cartel-marca");
    await tecla(imita, "Enter");
    await esperar(1500);
    est = await estadoExtension();
    // El sitio real puede tardar en cargar: vale la navegación en curso (pendingUrl)
    assert.ok(est.tabs.some((t) => /^https:\/\/(www\.)?bna\.com\.ar/.test(t.pendiente ?? t.url)), "no fue al sitio oficial");
    ok('marca imitada: "Ir al sitio oficial de Banco Nación" navega a https://bna.com.ar');
  } else {
    assert.equal(c, null, "hay cartel sin riesgo alto");
    ok(`marca imitada con nivel ${sum?.level}: sin cartel (solo en high)`);
  }

  // ---- páginas que no se analizan
  const interna = await nuevaPestania("edge://version");
  await esperar(800);
  est = await estadoExtension();
  assert.equal(pestaniaCon(est, "edge://version")?.badge ?? "", "");
  ok("edge://version: sin analizar, sin badge");

  console.log("\nE2E OK");
} finally {
  ws.close();
  edge.kill();
  web.close();
  await esperar(500);
}

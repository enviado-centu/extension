import assert from "node:assert/strict";
import { test } from "node:test";

import { claveCache, debeAnalizar, hostDe } from "../lib/url.js";

const API_URL = "http://localhost:8000";

test("ignora esquemas que no son http o https", () => {
  for (const url of ["chrome://extensions", "edge://settings", "about:blank", "file:///C:/a.html", "javascript:alert(1)"]) {
    assert.equal(debeAnalizar(url, API_URL), false, url);
  }
});

test("ignora páginas locales y el frontend de desarrollo", () => {
  for (const url of ["http://localhost/x", "http://localhost:5173/", "http://127.0.0.1:5173/", "http://[::1]:3000/"]) {
    assert.equal(debeAnalizar(url, API_URL), false, url);
  }
});

test("ignora el host de la API, aunque no sea local", () => {
  assert.equal(debeAnalizar("http://localhost:8000/docs", API_URL), false);
  assert.equal(debeAnalizar("https://api.detector.com.ar/public/analizar", "https://api.detector.com.ar"), false);
});

test("analiza sitios comunes", () => {
  assert.equal(debeAnalizar("https://www.bna.com.ar", API_URL), true);
  assert.equal(debeAnalizar("http://bna-homebanking-verificar.xyz/login", API_URL), true);
});

test("tope de 2048 caracteres, igual que el backend", () => {
  const base = "https://a.com/";
  assert.equal(debeAnalizar(base + "x".repeat(2048 - base.length), API_URL), true);
  assert.equal(debeAnalizar(base + "x".repeat(2049 - base.length), API_URL), false);
  assert.equal(debeAnalizar(base + "x".repeat(3000), API_URL), false);
});

test("URLs inválidas no se analizan", () => {
  assert.equal(debeAnalizar("", API_URL), false);
  assert.equal(debeAnalizar("no es una url", API_URL), false);
});

test("hostDe usa el sitio real, no lo que está antes de la @", () => {
  assert.equal(hostDe("https://bna.com.ar@sitio-malo.com/login"), "sitio-malo.com");
  assert.equal(hostDe("https://WWW.BNA.com.ar./"), "www.bna.com.ar");
});

test("claveCache saca el fragmento y conserva la query", () => {
  assert.equal(claveCache("https://a.com/p?q=1&r=2#seccion"), "https://a.com/p?q=1&r=2");
  assert.equal(claveCache("https://a.com/p?q=1"), claveCache("https://a.com/p?q=1#otra"));
  assert.notEqual(claveCache("https://a.com/p?q=1"), claveCache("https://a.com/p?q=2"));
  assert.equal(claveCache("no es una url"), null);
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_ENTRADAS, VIGENCIA_MS, guardarCache, leerCache } from "../lib/cache.js";

const T0 = 1_000_000;

test("devuelve el resultado mientras está vigente", () => {
  const cache = guardarCache({}, "https://a.com/", { nivel: "low" }, T0);
  assert.deepEqual(leerCache(cache, "https://a.com/", T0 + VIGENCIA_MS - 1), { nivel: "low" });
});

test("a los 10 minutos vence", () => {
  const cache = guardarCache({}, "https://a.com/", { nivel: "low" }, T0);
  assert.equal(VIGENCIA_MS, 10 * 60 * 1000);
  assert.equal(leerCache(cache, "https://a.com/", T0 + VIGENCIA_MS), null);
});

test("clave que no está: null", () => {
  assert.equal(leerCache({}, "https://a.com/", T0), null);
  assert.equal(leerCache(undefined, "https://a.com/", T0), null);
});

test("no modifica la caché original", () => {
  const original = {};
  guardarCache(original, "https://a.com/", 1, T0);
  assert.deepEqual(original, {});
});

test("tope de 500 entradas: al guardar la 501 sale la más vieja", () => {
  let cache = {};
  for (let i = 0; i < MAX_ENTRADAS; i++) {
    cache = guardarCache(cache, `https://s${i}.com/`, i, T0 + i);
  }
  assert.equal(Object.keys(cache).length, 500);

  cache = guardarCache(cache, "https://nueva.com/", "n", T0 + MAX_ENTRADAS);
  assert.equal(Object.keys(cache).length, 500);
  assert.equal(leerCache(cache, "https://s0.com/", T0 + MAX_ENTRADAS), null);
  assert.equal(leerCache(cache, "https://s1.com/", T0 + MAX_ENTRADAS), 1);
  assert.equal(leerCache(cache, "https://nueva.com/", T0 + MAX_ENTRADAS), "n");
});

test("al guardar se descartan las vencidas", () => {
  let cache = guardarCache({}, "https://vieja.com/", 1, T0);
  cache = guardarCache(cache, "https://nueva.com/", 2, T0 + VIGENCIA_MS);
  assert.deepEqual(Object.keys(cache), ["https://nueva.com/"]);
});

test("volver a guardar una clave la renueva", () => {
  let cache = guardarCache({}, "https://a.com/", 1, T0);
  cache = guardarCache(cache, "https://a.com/", 2, T0 + 1000);
  assert.equal(Object.keys(cache).length, 1);
  assert.equal(leerCache(cache, "https://a.com/", T0 + VIGENCIA_MS), 2);
});

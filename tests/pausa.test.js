import assert from "node:assert/strict";
import { test } from "node:test";

import { PAUSA_POR_DEFECTO_S, enPausa, pausaHasta } from "../lib/pausa.js";

const T0 = 1_000_000;

test("usa el Retry-After en segundos", () => {
  assert.equal(pausaHasta("30", T0), T0 + 30_000);
  assert.equal(pausaHasta(" 5 ", T0), T0 + 5_000);
  assert.equal(pausaHasta("1.2", T0), T0 + 2_000); // se redondea hacia arriba
});

test("sin header: 60 s", () => {
  assert.equal(PAUSA_POR_DEFECTO_S, 60);
  assert.equal(pausaHasta(null, T0), T0 + 60_000);
  assert.equal(pausaHasta(undefined, T0), T0 + 60_000);
  assert.equal(pausaHasta("", T0), T0 + 60_000);
});

test("no numérico o negativo: 60 s", () => {
  assert.equal(pausaHasta("abc", T0), T0 + 60_000);
  assert.equal(pausaHasta("Wed, 21 Oct 2026 07:28:00 GMT", T0), T0 + 60_000);
  assert.equal(pausaHasta("-5", T0), T0 + 60_000);
});

test("enPausa deja de dar true cuando vence", () => {
  const hasta = pausaHasta("30", T0);
  assert.equal(enPausa(hasta, T0), true);
  assert.equal(enPausa(hasta, hasta - 1), true);
  assert.equal(enPausa(hasta, hasta), false);
  assert.equal(enPausa(hasta, hasta + 1), false);
});

test("sin pausa guardada no hay pausa", () => {
  assert.equal(enPausa(undefined, T0), false);
  assert.equal(enPausa(null, T0), false);
});

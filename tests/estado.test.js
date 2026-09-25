import assert from "node:assert/strict";
import { test } from "node:test";

import { GRIS, NIVELES, nivelVisual } from "../lib/estado.js";

const conNivel = (level) => ({ estado: "resultado", resultado: { summary: { level } } });

test("cada nivel tiene su color y un badge para quien no distingue colores", () => {
  assert.deepEqual(nivelVisual(conNivel("low")), { color: NIVELES.low.color, badge: "OK" });
  assert.deepEqual(nivelVisual(conNivel("medium")), { color: NIVELES.medium.color, badge: "!" });
  assert.deepEqual(nivelVisual(conNivel("high")), { color: NIVELES.high.color, badge: "!!" });
});

test("error: gris con ?", () => {
  assert.deepEqual(nivelVisual({ estado: "error" }), { color: GRIS, badge: "?" });
});

test("sin analizar: gris sin badge", () => {
  for (const estado of [{ estado: "analizando" }, { estado: "no-analiza" }, null, conNivel("raro")]) {
    assert.deepEqual(nivelVisual(estado), { color: GRIS, badge: "" });
  }
});

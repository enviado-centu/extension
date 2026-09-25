import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TIP_BAJO,
  VIGENCIA_LISTA_MS,
  listaVencida,
  marcaOficial,
  marcaPorNombre,
  resultadoOficialLocal,
} from "../lib/lista-blanca.js";

// Extracto de GET /public/lista-blanca (mismo orden de dominios que motor/datos/lista_blanca.json)
const LISTA = {
  version: "abc123",
  bajadaEn: 1_000_000,
  marcas: [
    { id: "bna", nombre: "Banco Nación", dominios: ["bna.com.ar"] },
    { id: "mercadopago", nombre: "Mercado Pago", dominios: ["mercadopago.com.ar", "mercadopago.com", "mercadolibre.com.ar"] },
    { id: "mercadolibre", nombre: "Mercado Libre", dominios: ["mercadolibre.com.ar", "mercadolibre.com"] },
  ],
};

test("es oficial el dominio y sus subdominios", () => {
  assert.equal(marcaOficial("https://www.bna.com.ar", LISTA)?.id, "bna");
  assert.equal(marcaOficial("https://bna.com.ar/personas", LISTA)?.id, "bna");
  assert.equal(marcaOficial("https://hb.redlink.bna.com.ar/", LISTA)?.id, "bna");
});

test("no es oficial lo que solo contiene el dominio", () => {
  for (const url of [
    "https://bna.com.ar.sitio-malo.com/login",
    "https://bna.com.ar@sitio-malo.com/login",
    "https://bnahomebanking.com",
    "https://falsobna.com.ar",
  ]) {
    assert.equal(marcaOficial(url, LISTA), null, url);
  }
});

test("un dominio de dos marcas corresponde a la que lo tiene como principal", () => {
  assert.deepEqual(marcaOficial("https://www.mercadolibre.com.ar", LISTA), {
    id: "mercadolibre",
    nombre: "Mercado Libre",
    dominio: "mercadolibre.com.ar",
  });
  assert.equal(marcaOficial("https://mercadopago.com", LISTA)?.id, "mercadopago");
});

test("sin lista no hay sitios oficiales", () => {
  assert.equal(marcaOficial("https://www.bna.com.ar", null), null);
  assert.equal(marcaOficial("no es una url", LISTA), null);
});

test("marcaPorNombre devuelve el dominio principal", () => {
  assert.deepEqual(marcaPorNombre("Mercado Pago", LISTA), {
    id: "mercadopago",
    nombre: "Mercado Pago",
    dominio: "mercadopago.com.ar",
  });
  assert.equal(marcaPorNombre("Banco Inexistente", LISTA), null);
  assert.equal(marcaPorNombre(null, LISTA), null);
});

test("resultado local con la misma forma que /public/analizar", () => {
  const url = "https://www.bna.com.ar/";
  const resultado = resultadoOficialLocal(url, marcaOficial(url, LISTA));
  assert.deepEqual(resultado, {
    url,
    dominio: "bna.com.ar",
    summary: {
      score_100: 0,
      level: "low",
      source: "sitio_oficial_local",
      reasons: ["Es el sitio oficial de Banco Nación"],
      tip: TIP_BAJO,
      brand: null,
      official_brand: "Banco Nación",
    },
  });
});

test("la lista vence a la hora", () => {
  assert.equal(listaVencida(LISTA, LISTA.bajadaEn + VIGENCIA_LISTA_MS - 1), false);
  assert.equal(listaVencida(LISTA, LISTA.bajadaEn + VIGENCIA_LISTA_MS), true);
  assert.equal(listaVencida(null, 0), true);
});

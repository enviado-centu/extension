// Cómo se muestra cada estado de una pestaña: color del ícono, badge y textos.
// Estados: {estado: "analizando" | "resultado" | "no-analiza" | "error", resultado?}

export const GRIS = "#6e7781";

export const NIVELES = {
  low: { color: "#1a7f37", badge: "OK", texto: "Riesgo bajo" },
  medium: { color: "#bf8700", badge: "!", texto: "Riesgo medio" },
  high: { color: "#cf222e", badge: "!!", texto: "Riesgo alto" },
};

export const TEXTOS = {
  analizando: "Analizando…",
  noAnaliza: "Esta página no se analiza",
  error: "No se pudo analizar esta página ahora",
};

/** {color, badge} del ícono para un estado. Gris si no hay resultado. */
export function nivelVisual(estado) {
  if (estado?.estado === "resultado") {
    const nivel = NIVELES[estado.resultado?.summary?.level];
    if (nivel) return { color: nivel.color, badge: nivel.badge };
  }
  if (estado?.estado === "error") return { color: GRIS, badge: "?" };
  return { color: GRIS, badge: "" };
}

// Script de contenido: muestra un cartel a pantalla completa cuando la página tiene riesgo alto.
// Autocontenido (sin imports). No lee nada de la página: solo recibe el resultado del
// service worker. Corre en document_start, así que el cartel se cuelga de
// document.documentElement (el body todavía no existe).

(() => {
  const ETIQUETA = "detector-enganos-cartel";
  // Estilo del host en línea y con !important: el CSS de la página no lo puede pisar
  const ESTILO_HOST =
    "all: initial !important; display: block !important; position: fixed !important; " +
    "inset: 0 !important; z-index: 2147483647 !important;";

  const PLANTILLA = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .fondo {
        position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
        padding: 16px; overflow: auto; background: rgba(17, 20, 24, 0.92);
        font: 16px/1.5 system-ui, "Segoe UI", Roboto, sans-serif; color: #1f2328;
      }
      .cartel {
        width: 100%; max-width: 560px; margin: auto; padding: 28px 28px 24px;
        border-top: 8px solid #cf222e; border-radius: 10px; background: #ffffff;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
      }
      h1 { margin: 0 0 14px; font-size: 22px; line-height: 1.3; color: #a40e26; }
      ul { margin: 0 0 14px; padding-left: 22px; }
      li { margin: 4px 0; }
      .consejo { margin: 0 0 22px; padding: 10px 12px; border-radius: 6px; background: #fff1f0; }
      .botones { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
      button { font: inherit; cursor: pointer; border-radius: 6px; }
      button:focus-visible { outline: 3px solid #0969da; outline-offset: 3px; }
      .salir {
        padding: 12px 20px; border: 0; font-size: 17px; font-weight: 700;
        color: #ffffff; background: #1a7f37;
      }
      .continuar {
        padding: 6px 4px; border: 0; font-size: 14px; color: #59636e;
        background: transparent; text-decoration: underline;
      }
      button:disabled { opacity: 0.6; cursor: default; }
    </style>
    <div class="fondo">
      <div class="cartel" role="alertdialog" aria-modal="true"
           aria-labelledby="titulo" aria-describedby="motivos consejo">
        <h1 id="titulo">Cuidado: esta página tiene señales de engaño</h1>
        <ul id="motivos"></ul>
        <p class="consejo" id="consejo"></p>
        <div class="botones">
          <button type="button" class="salir" id="salir"></button>
          <button type="button" class="continuar" id="continuar">Entiendo el riesgo, continuar</button>
        </div>
      </div>
    </div>`;

  let host = null;
  let raiz = null;
  let botones = [];

  const sinFragmento = (url) => {
    try {
      const u = new URL(url);
      u.hash = "";
      return u.href;
    } catch {
      return null;
    }
  };

  function enviar(mensaje) {
    return chrome.runtime.sendMessage(mensaje).catch(() => null);
  }

  // ------------------------------------------------------------ cartel

  function crear() {
    host = document.createElement(ETIQUETA);
    host.setAttribute("style", ESTILO_HOST);
    // Cerrado: los scripts de la página no pueden leer ni tocar el cartel
    raiz = host.attachShadow({ mode: "closed" });
    raiz.innerHTML = PLANTILLA; // plantilla fija: los textos del backend van con textContent
    botones = [raiz.getElementById("salir"), raiz.getElementById("continuar")];

    botones[0].addEventListener("click", () => {
      botones.forEach((b) => (b.disabled = true));
      enviar({ tipo: "salir" }).then(() => botones.forEach((b) => (b.disabled = false)));
    });
    botones[1].addEventListener("click", () => {
      enviar({ tipo: "continuar" });
      ocultar();
    });
  }

  function mostrar(summary, marcaImitada) {
    if (!host) crear();
    raiz.getElementById("salir").textContent = marcaImitada
      ? `Ir al sitio oficial de ${marcaImitada.nombre}`
      : "Salir de esta página";
    raiz.getElementById("motivos").replaceChildren(
      ...(summary.reasons ?? []).map((motivo) => {
        const li = document.createElement("li");
        li.textContent = motivo;
        return li;
      })
    );
    raiz.getElementById("consejo").textContent = summary.tip ?? "";

    if (!host.isConnected) {
      document.documentElement.append(host);
      window.addEventListener("keydown", alTeclear, true);
      document.addEventListener("focusin", alEnfocar, true);
      vigilante.observe(document.documentElement, { childList: true });
    }
    enfocarPrimero();
  }

  function ocultar() {
    if (!host?.isConnected) return;
    vigilante.disconnect();
    window.removeEventListener("keydown", alTeclear, true);
    document.removeEventListener("focusin", alEnfocar, true);
    host.remove();
  }

  function enfocarPrimero() {
    botones[0].focus();
    // En document_start el cartel todavía no se pintó: se reintenta en el próximo cuadro
    requestAnimationFrame(() => {
      if (host?.isConnected && raiz.activeElement == null) botones[0].focus();
    });
  }

  // ------------------------------------------------------------ teclado y foco

  // Tab y Shift+Tab solo recorren los dos botones. Escape no hace nada: para seguir hay
  // que elegir "Entiendo el riesgo, continuar". Las teclas no le llegan a la página.
  function alTeclear(evento) {
    evento.stopImmediatePropagation();
    if (evento.key === "Escape") {
      evento.preventDefault();
    } else if (evento.key === "Tab") {
      evento.preventDefault();
      const actual = botones.indexOf(raiz.activeElement);
      const paso = evento.shiftKey ? -1 : 1;
      botones[(actual + paso + botones.length) % botones.length].focus();
    }
  }

  // Si la página intenta llevarse el foco (ej. autofocus), vuelve al cartel
  function alEnfocar(evento) {
    if (evento.target !== host) enfocarPrimero();
  }

  // Si la página saca el cartel del DOM, se vuelve a poner
  const vigilante = new MutationObserver(() => {
    if (host && !host.isConnected && document.documentElement) {
      document.documentElement.append(host);
      enfocarPrimero();
    }
  });

  // ------------------------------------------------------------ resultado

  function aplicar(datos) {
    const estado = datos?.estado;
    const summary = estado?.resultado?.summary;
    const esDeEstaPagina = estado && sinFragmento(estado.url) === sinFragmento(location.href);
    if (estado?.estado === "resultado" && summary?.level === "high" && esDeEstaPagina && !datos.continuarDominio) {
      mostrar(summary, datos.marcaImitada);
    } else {
      ocultar();
    }
  }

  chrome.runtime.onMessage.addListener((mensaje) => {
    if (mensaje?.tipo === "resultado") aplicar(mensaje);
  });

  // El resultado puede haber llegado antes de que cargara este script
  enviar({ tipo: "obtener-resultado" }).then(aplicar);
})();

/**
 * AuraGuard Chrome Extension - Popup Controller
 * Compatible with Manifest V3
 */

(function () {
  // DOM Elements - Views
  const stateIdle = document.getElementById("stateIdle");
  const stateScanning = document.getElementById("stateScanning");
  const stateReport = document.getElementById("stateReport");

  // DOM Elements - Actions
  const btnStartScan = document.getElementById("btnStartScan");
  const btnResetScan = document.getElementById("btnResetScan");
  const btnReportThreat = document.getElementById("btnReportThreat");
  const reportBtnText = document.getElementById("reportBtnText");
  const btnSettings = document.getElementById("btnSettings");

  // DOM Elements - Status Header
  const statusBadge = document.getElementById("statusBadge");
  const statusIndicatorDot = document.getElementById("statusIndicatorDot");
  const statusText = document.getElementById("statusText");

  // DOM Elements - Domain Bar
  const currentDomainEl = document.getElementById("currentDomain");
  const sslBadgeEl = document.getElementById("sslBadge");
  const sslIconEl = document.getElementById("sslIcon");

  let currentTabUrl = "https://gtidocs.virustotal.com";

  // 1. Detect active Chrome tab
  function initActiveTab() {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url) {
          try {
            const urlObj = new URL(tabs[0].url);
            currentTabUrl = tabs[0].url;

            // Only update if it's a web page
            if (urlObj.protocol === "http:" || urlObj.protocol === "https:") {
              currentDomainEl.textContent = urlObj.hostname;

              if (urlObj.protocol === "https:") {
                sslBadgeEl.textContent = "SSL Activo";
                sslBadgeEl.className = "badge-ssl";
                sslIconEl.textContent = "lock";
                sslIconEl.className = "material-symbols-outlined icon-lock";
              } else {
                sslBadgeEl.textContent = "Sin SSL";
                sslBadgeEl.className = "badge-ssl insecure";
                sslIconEl.textContent = "lock_open";
                sslIconEl.className =
                  "material-symbols-outlined icon-lock warning";
              }
            } else {
              currentDomainEl.textContent = "Página del Sistema";
              sslBadgeEl.textContent = "Interno";
            }
          } catch (e) {
            console.warn("Could not parse tab URL:", e);
          }
        }
      });
    }
  }

  // 2. Status Badge controller
  function setStatus(type) {
    if (type === "danger") {
      statusBadge.classList.add("danger");
      statusText.textContent = "Alerta";
    } else {
      statusBadge.classList.remove("danger");
      statusText.textContent = "En línea";
    }
  }

  // 3. State transitions
  function showIdleState() {
    stateIdle.classList.remove("hidden");
    stateScanning.classList.add("hidden");
    stateReport.classList.add("hidden");
    setStatus("normal");

    // Reset report button status
    reportBtnText.textContent = "Reportar a la Comunidad";
    btnReportThreat.classList.remove("reported");
    btnReportThreat.disabled = false;
  }

  function showScanningState() {
    stateIdle.classList.add("hidden");
    stateScanning.classList.remove("hidden");
    stateReport.classList.add("hidden");
    setStatus("normal");

    // Simulated scan or Backend API call
    // Hook point for teammate's Python AI backend:
    // scanPageWithBackend(currentTabUrl);
    setTimeout(() => {
      showReportState();
    }, 2000);
  }

  function showReportState() {
    stateIdle.classList.add("hidden");
    stateScanning.classList.add("hidden");
    stateReport.classList.remove("hidden");
    setStatus("danger");
  }

  // 4. Hook for future Python Backend
  async function scanPageWithBackend(targetUrl) {
    try {
      /*
      const response = await fetch("http://localhost:8000/api/analyze-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl })
      });
      const data = await response.json();
      if (data.is_threat) {
        showReportState();
      } else {
        // showSafeState();
      }
      */
    } catch (err) {
      console.error("Backend error, falling back to simulated scan:", err);
      showReportState();
    }
  }

  // 5. Event Listeners
  btnStartScan.addEventListener("click", () => {
    showScanningState();
  });

  btnResetScan.addEventListener("click", () => {
    showIdleState();
  });

  btnReportThreat.addEventListener("click", () => {
    reportBtnText.textContent = "¡Reporte Enviado!";
    btnReportThreat.classList.add("reported");
    btnReportThreat.disabled = true;
  });

  btnSettings.addEventListener("click", (e) => {
    e.preventDefault();
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.openOptionsPage
    ) {
      chrome.runtime.openOptionsPage();
    } else {
      alert("Ajustes de AuraGuard: Próximamente.");
    }
  });

  // Initialization
  initActiveTab();
  showIdleState();
})();

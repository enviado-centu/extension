/**
 * AuraGuard - Content Script
 * Injected in web pages to inspect links and show alerts
 */

console.log("AuraGuard: Escudo Ciudadano activo en esta pestaña.");

// Listen for messages from Background Service Worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "AURAGUARD_VERIFY_LINK") {
    showLinkVerificationBanner(request.targetUrl);
    sendResponse({ received: true });
  }
});

function showLinkVerificationBanner(url) {
  // Check if banner already exists
  let existingBanner = document.getElementById("auraguard-quick-banner");
  if (existingBanner) existingBanner.remove();

  const isSuspicious = url.includes("tienda-falsa") || 
                       url.includes("sorteo") || 
                       url.includes("urgente") || 
                       url.includes("clave");

  const banner = document.createElement("div");
  banner.id = "auraguard-quick-banner";
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483647;
    background: ${isSuspicious ? '#FEF2F2' : '#ECFDF5'};
    border: 2px solid ${isSuspicious ? '#DC2626' : '#10B981'};
    color: ${isSuspicious ? '#991B1B' : '#065F46'};
    padding: 12px 18px;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 10px;
    animation: auraguardFadeIn 0.3s ease;
  `;

  banner.innerHTML = `
    <span style="font-size: 18px;">${isSuspicious ? '⚠️' : '🛡️'}</span>
    <div>
      <div>${isSuspicious ? '¡Enlace Sospechoso Detectado!' : 'Enlace Verificado y Seguro'}</div>
      <div style="font-size: 11px; opacity: 0.8; font-weight: 400; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${url}</div>
    </div>
    <span id="auraguard-close-btn" style="cursor: pointer; margin-left: 10px; font-weight: bold; opacity: 0.6;">✕</span>
  `;

  document.body.appendChild(banner);

  document.getElementById("auraguard-close-btn").onclick = () => banner.remove();

  setTimeout(() => {
    if (banner.parentElement) {
      banner.style.transition = "opacity 0.5s ease";
      banner.style.opacity = "0";
      setTimeout(() => banner.remove(), 500);
    }
  }, 5000);
}

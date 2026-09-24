/**
 * AuraGuard - Service Worker (Background Script)
 * Manifest V3 Compatible
 */

// Initialize Extension and Context Menus
chrome.runtime.onInstalled.addListener(() => {
  console.log("AuraGuard: Service Worker instalado con éxito.");

  // Right-click context menu (Capa 2: Inspección bajo demanda)
  chrome.contextMenus.create({
    id: "auraguard-verify-link",
    title: "Verificar con AuraGuard",
    contexts: ["link"],
  });
});

// Context Menu Click Listener
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "auraguard-verify-link" && info.linkUrl) {
    console.log("AuraGuard: Verificando enlace seleccionado:", info.linkUrl);

    // Send message to content script in current tab
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: "AURAGUARD_VERIFY_LINK",
        targetUrl: info.linkUrl,
      });
    }
  }
});

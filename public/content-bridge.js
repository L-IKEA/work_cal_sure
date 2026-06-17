// content-bridge.js
// Runs in ISOLATED world (has access to Chrome extension storage APIs)

console.log("[Suresoft Sync] Isolated world bridge active.");

window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SURESOFT_ATTENDANCE_CAPTURED") {
    const data = event.data.data;
    const url = event.data.url;
    console.log("[Suresoft Sync] Bridge received data. Saving to chrome.storage.local...");
    
    const storageObj = { "suresoft_attendance_data": data };
    if (url) {
      storageObj["suresoft_attendance_url"] = url;
    }
    
    chrome.storage.local.set(storageObj, () => {
      if (chrome.runtime.lastError) {
        console.error("[Suresoft Sync] Bridge failed to save to storage:", chrome.runtime.lastError);
      } else {
        console.log("[Suresoft Sync] Bridge successfully saved attendance data for:", data.standardDay);
      }
    });
  }
});

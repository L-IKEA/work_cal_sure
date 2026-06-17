// content-ehr.js
// Runs in MAIN world (shares JS context with the webpage)

console.log("[Suresoft Sync] Main world content script active.");

// Intercept Fetch
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const url = args[0] && typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
  console.log("[Suresoft Sync] Intercepted Fetch call to:", url);
  
  const response = await originalFetch.apply(this, args);
  
  if (url.includes('/month') || url.includes('month?')) {
    console.log("[Suresoft Sync] Matched '/month' URL in Fetch. Reading response...");
    try {
      const clone = response.clone();
      const data = await clone.json();
      console.log("[Suresoft Sync] Successfully parsed JSON from Fetch. standardDay:", data.standardDay);
      if (data && data.weekList) {
        window.postMessage({ type: 'SURESOFT_ATTENDANCE_CAPTURED', data, url: response.url || url }, '*');
        console.log("[Suresoft Sync] postMessage sent to isolated content script.");
      } else {
        console.warn("[Suresoft Sync] Parsed Fetch data does not contain weekList.", data);
      }
    } catch (e) {
      console.error("[Suresoft Sync] Error parsing JSON from Fetch:", e);
    }
  }
  return response;
};

// Intercept XMLHttpRequest
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url) {
  this._url = url;
  return originalOpen.apply(this, arguments);
};

XMLHttpRequest.prototype.send = function() {
  console.log("[Suresoft Sync] Intercepted XHR send to:", this._url);
  
  this.addEventListener('load', function() {
    const url = this._url || '';
    if (url.includes('/month') || url.includes('month?')) {
      console.log("[Suresoft Sync] Matched '/month' URL in XHR load. Reading response...");
      try {
        const data = JSON.parse(this.responseText);
        console.log("[Suresoft Sync] Successfully parsed JSON from XHR. standardDay:", data.standardDay);
        if (data && data.weekList) {
          window.postMessage({ type: 'SURESOFT_ATTENDANCE_CAPTURED', data, url: this.responseURL || url }, '*');
          console.log("[Suresoft Sync] postMessage sent to isolated content script.");
        } else {
          console.warn("[Suresoft Sync] Parsed XHR data does not contain weekList.", data);
        }
      } catch (e) {
        console.error("[Suresoft Sync] Error parsing JSON from XHR responseText:", e);
      }
    }
  });
  return originalSend.apply(this, arguments);
};

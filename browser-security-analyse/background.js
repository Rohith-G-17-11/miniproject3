// background.js
// Keep basic listener and storage for per-tab reports.

const HEADER_CHECK_TIMEOUT = 3000;

// helper to attempt a fetch HEAD to read response headers (may be opaque due to CORS)
async function tryFetchHeaders(url) {
  try {
    const controller = new AbortController();
    const id = setTimeout(()=>controller.abort(), HEADER_CHECK_TIMEOUT);
    const resp = await fetch(url, { method: 'HEAD', mode: 'cors', signal: controller.signal });
    clearTimeout(id);
    if (!resp || !resp.headers) return { ok: false, reason: 'opaque-or-no-headers' };
    const headers = {};
    resp.headers.forEach((v,k)=>headers[k.toLowerCase()] = v);
    return { ok: true, headers };
  } catch (e) {
    return { ok: false, reason: e.message || 'fetch-failed' };
  }
}

function scoreFromReport(report, cookieInfo, headerInfo) {
  // base 100, subtract points for issues
  let score = 100;
  // insecure page
  if (!report.isSecure) score -= 30;
  // mixed content
  if (report.mixedResources && report.mixedResources.length > 0) score -= Math.min(25, report.mixedResources.length * 3);
  // insecure forms
  if (report.insecureForms && report.insecureForms.length > 0) score -= 20;
  // inline scripts/events
  if (report.inlineScripts > 0) score -= Math.min(15, report.inlineScripts * 3);
  if (report.inlineEventHandlers.length > 0) score -= Math.min(10, report.inlineEventHandlers.length * 2);
  // trackers
  if (report.trackersFound && report.trackersFound.length > 0) score -= Math.min(20, report.trackersFound.length * 4);
  // CSRF tokens present reduces penalty
  if (report.csrfTokens && report.csrfTokens.length === 0) score -= 10;
  // open redirect candidates
  if (report.openRedirectCandidates && report.openRedirectCandidates.length > 0) score -= 8;
  // WebRTC IPs found
  if (report.webrtcIps && report.webrtcIps.length > 0) score -= Math.min(15, report.webrtcIps.length * 5);

  // Cookie flags: cookieInfo is array of cookie objects from chrome.cookies.getAll
  if (cookieInfo && Array.isArray(cookieInfo)) {
    // any cookie without 'secure' attribute? chrome.cookies returns 'secure' boolean
    const insecureCookies = cookieInfo.filter(c=> !c.secure);
    if (insecureCookies.length > 0) score -= Math.min(20, insecureCookies.length * 2);
    // HttpOnly false count
    const httponlyMissing = cookieInfo.filter(c => !c.httpOnly).length;
    if (httponlyMissing > 0) score -= Math.min(10, httponlyMissing);
  }

  // Header checks (CSP/HSTS/X-Frame-Options) - using headerInfo.headers if available
  if (headerInfo && headerInfo.ok && headerInfo.headers) {
    const headers = headerInfo.headers;
    if (!headers['content-security-policy']) score -= 8;
    if (!headers['strict-transport-security']) score -= 6;
    if (!headers['x-frame-options'] && !headers['frame-ancestors']) score -= 6;
    // X-Content-Type-Options
    if (!headers['x-content-type-options']) score -= 4;
  } else {
    // unknown headers => small penalty for inability to verify
    score -= 3;
  }

  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return Math.round(score);
}

// Store reports keyed by tabId (if available) or by hostname
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PAGE_REPORT") {
    const report = message.data;
    const tabId = sender.tab ? sender.tab.id : null;
    const storeKey = tabId ? `report_tab_${tabId}` : `report_host_${report.hostname}`;

    (async () => {
      // get cookies for this domain
      let cookieList = [];
      try {
        const domain = report.hostname;
        // chrome.cookies.getAll needs a domain without protocol
        cookieList = await new Promise(resolve => chrome.cookies.getAll({ domain }, arr => resolve(arr || [])));
      } catch (e) {
        cookieList = [];
      }

      // attempt to fetch headers via background fetch (may be blocked by CORS)
      const headerInfo = await tryFetchHeaders(report.url);

      // compute score
      const score = scoreFromReport(report, cookieList, headerInfo);

      const final = {
        report,
        cookieCount: cookieList.length,
        insecureCookieCount: cookieList.filter(c=> !c.secure).length,
        headerInfo,
        score,
        lastUpdated: Date.now()
      };

      // Save to storage for popup to read
      const obj = {};
      obj[storeKey] = final;
      chrome.storage.local.set(obj);
      // also set a per-host quick index
      chrome.storage.local.set({ [`last_report_${report.hostname}`]: final });
      // send notification to popup if open
      chrome.runtime.sendMessage({ type: "REPORT_STORED", key: storeKey, data: final });
    })();

    // async handling, don't block
    return true;
  }
});

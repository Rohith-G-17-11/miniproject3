// content.js
(function () {
  // Helper
  function unique(array) {
    return Array.from(new Set(array));
  }

  // 1) HTTPS check
  const isSecure = location.protocol === "https:";

  // 2) Mixed content - any loaded resource via http: while on https:
  const mixedResources = [];
  if (isSecure) {
    document.querySelectorAll("img, script, iframe, link").forEach(el => {
      const src = el.src || el.href || "";
      if (src && src.startsWith("http:")) mixedResources.push(src);
    });
  }

  // 3) Insecure form submissions (action starts with http:)
  const insecureForms = [];
  document.querySelectorAll("form").forEach(f => {
    const action = f.getAttribute("action") || "";
    if (action && action.startsWith("http:")) insecureForms.push(action);
  });

  // 4) Inline scripts / event handlers (basic XSS indicator)
  let inlineScripts = 0;
  document.querySelectorAll("script").forEach(s => {
    if (!s.src && s.textContent && s.textContent.trim().length > 0) inlineScripts++;
  });
  // event handler attributes
  const eventAttrs = ["onerror","onclick","onload","onmouseover","onfocus","onblur"];
  let inlineEventHandlers = [];
  document.querySelectorAll("*").forEach(el => {
    eventAttrs.forEach(attr => {
      if (el.hasAttribute && el.hasAttribute(attr)) {
        inlineEventHandlers.push(attr);
      }
    });
  });

  // 5) Third-party trackers (simple heuristic: external script hostnames matched against small list)
  const knownTrackers = [
    "google-analytics.com",
    "googletagmanager.com",
    "doubleclick.net",
    "facebook.net",
    "facebook.com",
    "ads.twitter.com"
  ];
  const trackersFound = [];
  document.querySelectorAll("script[src]").forEach(s => {
    try {
      const u = new URL(s.src);
      if (u.hostname !== location.hostname) {
        knownTrackers.forEach(k => { if (u.hostname.includes(k)) trackersFound.push(u.hostname); });
      }
    } catch (e) {}
  });

  // 6) CSRF token presence heuristic: hidden inputs named csrf/token/_csrf
  const csrfTokens = [];
  document.querySelectorAll("form input[type=hidden]").forEach(inp => {
    const name = (inp.getAttribute("name") || "").toLowerCase();
    if (name.includes("csrf") || name.includes("token") || name.includes("_csrf")) csrfTokens.push(name);
  });

  // 7) Open-redirect-like params detection in links: check common param names that carry URLs
  const redirectParams = ["redirect", "url", "next", "dest", "destination"];
  const openRedirectCandidates = [];
  document.querySelectorAll("a[href]").forEach(a => {
    try {
      const href = a.getAttribute("href");
      const u = new URL(href, location.href);
      u.searchParams.forEach((v, k) => {
        if (redirectParams.includes(k.toLowerCase())) {
          // if it points to different host, mark candidate
          try {
            const target = new URL(v);
            if (target.hostname && target.hostname !== location.hostname) openRedirectCandidates.push(href);
          } catch(e) {
            // value isn't a full URL; skip
          }
        }
      });
    } catch(e){}
  });

  // 8) WebRTC local IP leak attempt (best-effort)
  function detectWebRTCLeak(timeout = 2000) {
    return new Promise(resolve => {
      const ips = new Set();
      try {
        const pc = new RTCPeerConnection({iceServers:[]});
        pc.createDataChannel("");
        pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(()=>{});
        pc.onicecandidate = (e) => {
          if (!e || !e.candidate) {
            // finished
            pc.close();
            resolve(Array.from(ips));
            return;
          }
          const cand = e.candidate.candidate;
          // candidate string contains IPs — extract IPv4/IPv6
          const regex = /([0-9]{1,3}(\.[0-9]{1,3}){3})|([0-9a-fA-F:]{5,})/g;
          let m;
          while ((m = regex.exec(cand)) !== null) {
            ips.add(m[0]);
          }
        };
        // timeout fallback
        setTimeout(()=> {
          try { pc.close(); } catch(e){}
          resolve(Array.from(ips));
        }, timeout);
      } catch (e) {
        resolve([]);
      }
    });
  }

  // Compose report
  (async function sendReport(){
    const webrtcIps = await detectWebRTCLeak();

    const report = {
      url: location.href,
      hostname: location.hostname,
      isSecure,
      mixedResources: unique(mixedResources).slice(0, 20),
      insecureForms: unique(insecureForms),
      inlineScripts,
      inlineEventHandlers: unique(inlineEventHandlers),
      trackersFound: unique(trackersFound),
      csrfTokens: unique(csrfTokens),
      openRedirectCandidates: unique(openRedirectCandidates).slice(0,10),
      webrtcIps: unique(webrtcIps)
    };

    // send to background for cookie flags / storage
    chrome.runtime.sendMessage({ type: "PAGE_REPORT", data: report });
  })();

})();

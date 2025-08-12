// popup.js
const flaggedDomains = [
  "example-bad.com",
  "suspicious-site.test",
  "tracker.example"
];

function getDomain(url) {
  try {
    return (new URL(url)).hostname.replace(/^www\./,'').toLowerCase();
  } catch (e) { return null; }
}

function createBadge(score) {
  const span = document.createElement('span');
  span.className = 'scoreBadge';
  span.textContent = `${score}/100`;
  if (score >= 80) span.classList.add('high');
  else if (score >= 50) span.classList.add('medium');
  else span.classList.add('low');
  return span;
}

function createSmall(text, cls) {
  const s = document.createElement('div');
  s.className = cls || 'small';
  s.textContent = text;
  return s;
}

function renderTabItem(tab, storedReport) {
  const li = document.createElement('li');
  li.className = 'tab-item';

  const meta = document.createElement('div');
  meta.className = 'meta';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = tab.title || tab.url;

  const url = document.createElement('div');
  url.className = 'url';
  url.textContent = tab.url;

  meta.appendChild(title);
  meta.appendChild(url);

  const right = document.createElement('div');
  right.className = 'right';

  // Score or spinner
  if (storedReport && storedReport.score !== undefined) {
    right.appendChild(createBadge(storedReport.score));
  } else {
    const p = document.createElement('div');
    p.className = 'small';
    p.textContent = 'scanning...';
    right.appendChild(p);
  }

  // basic status icons
  const domain = getDomain(tab.url);
  const status = document.createElement('div');
  status.className = 'status';
  if (!tab.url.startsWith('https:')) {
    status.textContent = '⚠ Insecure';
  } else if (flaggedDomains.includes(domain)) {
    status.textContent = '🚨 Flagged';
  } else {
    status.textContent = '✅ Secure';
  }

  li.appendChild(meta);
  li.appendChild(right);
  li.appendChild(status);

  // if report is present, add details
  if (storedReport) {
    const details = document.createElement('div');
    details.className = 'details';

    const r = storedReport.report;
    // summary items
    details.appendChild(createSmall(`Mixed resources: ${r.mixedResources.length}`, 'muted'));
    details.appendChild(createSmall(`Insecure forms: ${r.insecureForms.length}`, 'muted'));
    details.appendChild(createSmall(`Trackers found: ${r.trackersFound.length}`, 'muted'));
    details.appendChild(createSmall(`CSRF tokens found: ${r.csrfTokens.length}`, 'muted'));
    if (r.webrtcIps && r.webrtcIps.length) {
      details.appendChild(createSmall(`WebRTC IPs: ${r.webrtcIps.join(', ')}`, 'warn'));
    }
    // cookie info
    details.appendChild(createSmall(`Cookies: ${storedReport.cookieCount}, insecure: ${storedReport.insecureCookieCount}`, 'muted'));
    // header info - best-effort
    if (storedReport.headerInfo && storedReport.headerInfo.ok && storedReport.headerInfo.headers) {
      const hdr = storedReport.headerInfo.headers;
      details.appendChild(createSmall(`CSP: ${hdr['content-security-policy'] ? 'yes' : 'no'}`, hdr['content-security-policy'] ? 'ok' : 'warn'));
      details.appendChild(createSmall(`HSTS: ${hdr['strict-transport-security'] ? 'yes' : 'no'}`, hdr['strict-transport-security'] ? 'ok' : 'warn'));
      details.appendChild(createSmall(`X-Frame-Options: ${hdr['x-frame-options'] || hdr['frame-ancestors'] ? 'yes' : 'no'}`, (hdr['x-frame-options'] || hdr['frame-ancestors']) ? 'ok' : 'warn'));
    } else {
      details.appendChild(createSmall('Headers: unknown (CORS may block)', 'muted'));
    }

    li.appendChild(details);
  }

  return li;
}

function requestReportForTab(tab) {
  // We rely on content script to send PAGE_REPORT on page load.
  // But we can proactively send a message to the content script to re-scan if needed.
  try {
    chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_SCAN' }, (resp) => {
      // ignore; content script will send PAGE_REPORT when ready
    });
  } catch (e) {
    // Could be cross-extension page or not injectable
  }
}

function load() {
  const list = document.getElementById('tabList');
  const empty = document.getElementById('empty');
  list.innerHTML = '';

  chrome.tabs.query({}, (tabs) => {
    if (!tabs || tabs.length === 0) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    // For each tab, try to read stored report (tab-keyed)
    tabs.forEach(tab => {
      const key = `report_tab_${tab.id}`;
      chrome.storage.local.get([key], (res) => {
        const stored = res[key];
        list.appendChild(renderTabItem(tab, stored));
        // If no stored result, trigger content script re-scan
        if (!stored) requestReportForTab(tab);
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refresh').addEventListener('click', load);
  load();
});

// Update UI when background stores a report
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'REPORT_STORED') {
    // refresh popup list to display latest values
    load();
  }
});

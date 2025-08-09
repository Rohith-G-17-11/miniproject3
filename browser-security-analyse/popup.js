// popup.js
// Simple security checks: HTTPS vs HTTP, and flagged domain list.

const flaggedDomains = [
  "example-bad.com",
  "suspicious-site.test",
  "tracker.example"
  // add more test domains or replace with your list
];

function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch (e) {
    return null;
  }
}

function classifyTab(tab) {
  const url = tab.url || "";
  const domain = getDomain(url);
  const isSecure = url.startsWith("https:");
  const isFlagged = domain ? flaggedDomains.includes(domain) : false;

  let status = "secure";
  if (!url || url.startsWith("chrome:") || url.startsWith("about:")) {
    status = "unknown";
  } else if (!isSecure) {
    status = "insecure";
  }
  if (isFlagged) status = "flagged";

  return {
    id: tab.id,
    title: tab.title || domain || "(no title)",
    url,
    favicon: tab.favIconUrl || "",
    domain,
    status
  };
}

function renderTabs(tabsData) {
  const list = document.getElementById("tabList");
  const empty = document.getElementById("empty");
  list.innerHTML = "";

  if (!tabsData || tabsData.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  tabsData.forEach(t => {
    const li = document.createElement("li");
    li.className = "tab-item";

    const img = document.createElement("img");
    img.className = "favicon";
    img.src = t.favicon || "data:image/svg+xml;charset=utf-8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'></svg>";
    img.alt = "";

    const meta = document.createElement("div");
    meta.className = "meta";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = t.title;

    const url = document.createElement("span");
    url.className = "url";
    url.textContent = t.url;

    meta.appendChild(title);
    meta.appendChild(url);

    const badge = document.createElement("div");
    badge.className = "badge";

    if (t.status === "secure") {
      badge.classList.add("secure");
      badge.textContent = "✅ Secure";
    } else if (t.status === "insecure") {
      badge.classList.add("insecure");
      badge.textContent = "⚠ Insecure";
    } else if (t.status === "flagged") {
      badge.classList.add("flagged");
      badge.textContent = "🚨 Flagged";
    } else {
      badge.textContent = "—";
    }

    li.appendChild(img);
    li.appendChild(meta);
    li.appendChild(badge);
    list.appendChild(li);
  });
}

function listTabs() {
  // request all tabs (all windows)
  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error("tabs.query error:", chrome.runtime.lastError);
      document.getElementById("empty").textContent = "Error fetching tabs.";
      return;
    }

    const filtered = tabs
      .filter(tab => tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("about:"))
      .map(classifyTab);

    renderTabs(filtered);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refresh").addEventListener("click", listTabs);
  listTabs();
});

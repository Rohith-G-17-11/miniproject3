// popup.js
// Lists all open tabs' title + URL in the popup.

function renderTabs(tabs) {
  const list = document.getElementById('tabList');
  const empty = document.getElementById('empty');

  list.innerHTML = ''; // clear

  if (!tabs || tabs.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  tabs.forEach(tab => {
    // skip internal chrome:// and extension pages which may not have a valid URL
    const url = tab.url || '';
    const title = tab.title || url || '(no title)';

    const li = document.createElement('li');

    const titleEl = document.createElement('span');
    titleEl.className = 'title';
    titleEl.textContent = title;

    const urlEl = document.createElement('span');
    urlEl.className = 'url';
    urlEl.textContent = url;

    li.appendChild(titleEl);
    li.appendChild(urlEl);

    list.appendChild(li);
  });
}

// Query all tabs in current browser window(s)
function listAllTabs() {
  // use an empty query to get all tabs across all windows
  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error('chrome.tabs.query error:', chrome.runtime.lastError);
      document.getElementById('empty').textContent = 'Error fetching tabs.';
      return;
    }
    renderTabs(tabs);
  });
}

// Run when popup opens
document.addEventListener('DOMContentLoaded', () => {
  listAllTabs();
});

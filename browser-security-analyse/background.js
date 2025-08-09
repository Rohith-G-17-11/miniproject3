// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SECURITY_SCAN') {
        console.log('Security Scan Result:', message);

        // Send data to popup or store it for later
        chrome.storage.local.set({
            lastScan: {
                tabUrl: sender.tab.url,
                secure: message.secure,
                insecureForms: message.insecureForms,
                mixedContent: message.mixedContent
            }
        });
    }
});

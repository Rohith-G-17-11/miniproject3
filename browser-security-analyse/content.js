// content.js
(function() {
    // Check if the website uses HTTPS
    let isSecure = window.location.protocol === 'https:';

    // Check if page has any insecure form actions
    let forms = document.querySelectorAll('form');
    let insecureForms = [];
    forms.forEach(form => {
        let action = form.getAttribute('action') || '';
        if (action.startsWith('http:')) {
            insecureForms.push(action);
        }
    });

    // Detect mixed content (HTTP resources on HTTPS site)
    let mixedContent = [];
    document.querySelectorAll('img, script, link').forEach(el => {
        let src = el.src || el.href || '';
        if (src.startsWith('http:') && window.location.protocol === 'https:') {
            mixedContent.push(src);
        }
    });

    // Send results to background.js
    chrome.runtime.sendMessage({
        type: 'SECURITY_SCAN',
        secure: isSecure,
        insecureForms: insecureForms,
        mixedContent: mixedContent
    });
})();

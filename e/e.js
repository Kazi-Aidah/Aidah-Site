/**
 * e/e.js
 * Handles page transitions and common UI logic for the e/ folder.
 */
(function () {
    // 1. Handle exit fade-out before navigating
    document.addEventListener('click', function (e) {
        const anchor = e.target.closest('a');
        if (!anchor) return;

        const href = anchor.getAttribute('href');
        if (!href) return;

        // Skip: new tab, external, hash-only, javascript:, mailto:, tel:
        if (
            anchor.target === '_blank' ||
            href.startsWith('http') ||
            href.startsWith('//') ||
            href.startsWith('#') ||
            href.startsWith('javascript') ||
            href.startsWith('mailto') ||
            href.startsWith('tel')
        ) return;

        // Skip if modifier keys are held
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

        e.preventDefault();
        document.body.classList.add('page-exiting');

        setTimeout(function () {
            window.location.href = href;
        }, 230);
    });

    // 2. Active Link Highlighting & Nav link "shaking" effect
    function updateActiveLinks() {
        const currentPage = location.pathname.split('/').pop() || 'portfolio.html';
        document.querySelectorAll('.topbar__nav a').forEach(link => {
            const linkPage = link.getAttribute('href').split('/').pop();
            link.classList.toggle('active', linkPage === currentPage);

            // Add shaking listener if not already added
            if (!link._hasShakeListener) {
                link.addEventListener('mousedown', () => {
                    link.classList.add('is-shaking');
                    link.addEventListener('animationend', () => link.classList.remove('is-shaking'), { once: true });
                });
                link._hasShakeListener = true;
            }
        });
    }

    // Run on load
    updateActiveLinks();

})();

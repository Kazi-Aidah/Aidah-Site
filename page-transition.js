/**
 * page-transition.js
 * Handles the exit fade-out before navigating to another page.
 * The enter animation is handled purely by CSS on body.
 */
(function () {
  document.addEventListener('click', function (e) {
    var anchor = e.target.closest('a');
    if (!anchor) return;

    var href = anchor.getAttribute('href');
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

    // Skip if modifier keys are held (open in new tab, etc.)
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

    e.preventDefault();
    document.body.classList.add('page-exiting');

    setTimeout(function () {
      window.location.href = href;
    }, 230);
  });
})();

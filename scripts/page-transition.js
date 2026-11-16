/**
 * page-transition.js
 * Exit fade-out before navigating, plus desktop bottom-spacer scroll behavior.
 */
(function () {
  // --- Page exit transition ---
  document.addEventListener('click', function (e) {
    var anchor = e.target.closest('a');
    if (!anchor) return;

    var href = anchor.getAttribute('href');
    if (!href) return;

    if (
      anchor.target === '_blank' ||
      href.startsWith('http') ||
      href.startsWith('//') ||
      href.startsWith('#') ||
      href.startsWith('javascript') ||
      href.startsWith('mailto') ||
      href.startsWith('tel')
    ) return;

    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

    if (href === 'codelog.html') {
      e.preventDefault();
      window.location.href = href;
      return;
    }

    e.preventDefault();
    document.body.classList.add('page-exiting');

    setTimeout(function () {
      window.location.href = href;
    }, 230);
  });

  // --- Desktop bottom spacer: shrinks to 50px on scroll down ---
  var minWidth = 701;
  var pageWrapper = document.querySelector('.page-wrapper');
  var bottomSpacer = document.getElementById('bottomSpacer');
  var homeLink = document.querySelector('nav a[href="#"]');
  var contactLink = document.querySelector('nav a[href="#contact"]');

  function getInitialBottomHeight() {
    var style = getComputedStyle(document.documentElement);
    var value = style.getPropertyValue('--initial-bottom-spacer-height').trim();
    var base = parseFloat(value) || 150;
    return Math.max(base, window.innerHeight * 0.2);
  }

  function updateBottomSpacer() {
    if (!bottomSpacer) return;
    if (window.innerWidth <= minWidth) {
      bottomSpacer.style.height = '0px';
      return;
    }
    var scrollTop = pageWrapper ? pageWrapper.scrollTop : (window.scrollY || 0);
    var height = Math.max(50, getInitialBottomHeight() - scrollTop);
    bottomSpacer.style.height = height + 'px';
  }

  if (pageWrapper) {
    pageWrapper.addEventListener('scroll', function () {
      if (pageWrapper.scrollTop > 50) pageWrapper.classList.add('scrolled');
      else pageWrapper.classList.remove('scrolled');
      updateBottomSpacer();
    }, { passive: true });
  }

  if (homeLink && pageWrapper) {
    homeLink.addEventListener('click', function (e) {
      e.preventDefault();
      pageWrapper.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (contactLink && pageWrapper) {
    contactLink.addEventListener('click', function (e) {
      e.preventDefault();
      pageWrapper.scrollTo({ top: 999999, behavior: 'smooth' });
    });
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateBottomSpacer, 100);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateBottomSpacer);
  } else {
    updateBottomSpacer();
  }
})();
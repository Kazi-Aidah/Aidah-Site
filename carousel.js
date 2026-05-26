
  // Carousel behavior: paged by visible columns (3 on wide screens, 1 on small)
  document.addEventListener('DOMContentLoaded', function () {
    const carousels = Array.from(document.querySelectorAll('[data-carousel]'));
    function visibleColumns() {
      if (window.matchMedia('(min-width:900px)').matches) return 3;
      if (window.matchMedia('(min-width:600px)').matches) return 2;
      return 1;
    }
    carousels.forEach((carousel) => {
      const viewport = carousel.querySelector('.carousel-viewport');
      const track = carousel.querySelector('.carousel-track');
      if (!track || !viewport) return;
      const items = Array.from(track.children);
      if (items.length === 0) return;

      // determines how many items to show at once based on breakpoints
      function visibleCount() {
        if (window.matchMedia('(min-width:1200px)').matches) return 4;
        if (window.matchMedia('(min-width:900px)').matches) return 3;
        if (window.matchMedia('(min-width:600px)').matches) return 2;
        return 1;
      }

      let offsets = [];
      let totalWidth = 0;
      let currentIndex = 0;

      function recalcOffsetsAndSizes() {
        const style = getComputedStyle(track);
        const gap = parseFloat(style.gap) || 12;
        offsets = [];
        let acc = 0;
        totalWidth = 0;
        // don't force widths : allow natural image widths
        items.forEach((it, idx) => {
          offsets.push(acc);
          const rect = it.getBoundingClientRect();
          const w = rect.width;
          acc += w + gap;
          totalWidth += w;
        });
        if (items.length > 1) totalWidth += gap * (items.length - 1);
      }

      // recalc when images load or a short fallback; ensure we call showIndex AFTER measuring
      let loaded = 0;
      let totalImages = 0;
      
      // Collect all img elements inside carousel items
      const allImages = [];
      items.forEach(item => {
        const imgs = item.querySelectorAll('img');
        imgs.forEach(img => {
          allImages.push(img);
        });
      });
      
      totalImages = allImages.length;
      
      // If no images, just recalc immediately
      if (totalImages === 0) {
        setTimeout(() => { recalcOffsetsAndSizes(); showIndex(currentIndex); }, 100);
      } else {
        allImages.forEach(img => {
          if (img.complete) {
            loaded++;
            if (loaded === totalImages) {
              // all images loaded -> measure and show
              recalcOffsetsAndSizes();
              showIndex(currentIndex);
            }
          } else {
            img.addEventListener('load', () => {
              loaded++;
              if (loaded === totalImages) {
                // all images loaded -> measure and show
                recalcOffsetsAndSizes();
                showIndex(currentIndex);
              }
            });
          }
        });
      }
  // initial calc + fallback: measure soon and then show index (in case some images are cached)
  setTimeout(() => { recalcOffsetsAndSizes(); showIndex(currentIndex); }, 220);

  // when the whole page (including images) finishes loading, ensure measurements and visibility are correct
  window.addEventListener('load', () => { recalcOffsetsAndSizes(); showIndex(currentIndex); });

      function clampIndex(i) {
        return Math.max(0, Math.min(i, items.length - 1));
      }

      function showIndex(i) {
        currentIndex = clampIndex(i);
        // if offsets aren't ready (race), recalc synchronously so we can compute visibility
        if (offsets.length !== items.length || totalWidth === 0) {
          recalcOffsetsAndSizes();
        }
        const desired = offsets[currentIndex] || 0;
        const vpW = viewport.clientWidth;
        const maxTranslate = Math.max(0, totalWidth - vpW);
        const x = Math.max(0, Math.min(desired, maxTranslate));
        track.style.transform = `translateX(${-x}px)`;
        // mark items visible if they overlap the viewport
        const style = getComputedStyle(track);
        const gap = parseFloat(style.gap) || 12;
        items.forEach((it, idx) => {
          const left = offsets[idx];
          const rect = it.getBoundingClientRect();
          const w = rect.width;
          const itemLeft = left - x; // relative to viewport left
          const itemRight = itemLeft + w;
          const isVisible = itemRight > -gap && itemLeft < vpW + gap;
          it.classList.toggle('visible', !!isVisible);
        });
      }

      // next/prev handlers: step by 1
      const btnPrev = carousel.querySelector('[data-prev]');
      const btnNext = carousel.querySelector('[data-next]');
      if (btnPrev) btnPrev.addEventListener('click', () => showIndex(clampIndex(currentIndex - 1)));
      if (btnNext) btnNext.addEventListener('click', () => showIndex(clampIndex(currentIndex + 1)));

      // respond to resize: recalc sizes & offsets then keep same logical index
      let resizeTimer = null;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { recalcOffsetsAndSizes(); showIndex(currentIndex); }, 120);
      });

  // start: initial measurement/show will occur via the image-load handlers, the load event, or the fallback timeout above
    });
  });

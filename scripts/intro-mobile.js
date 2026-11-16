document.addEventListener('DOMContentLoaded', () => {
    const introSection = document.querySelector('.intro');
    if (!introSection) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    introSection.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });

    introSection.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].clientX;
        touchEndY = e.changedTouches[0].clientY;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        const threshold = 50; // Minimum distance for a swipe
        const restraint = 100; // Maximum distance allowed in the other axis

        // Check if swipe is horizontal and meets threshold
        if (Math.abs(deltaX) >= threshold && Math.abs(deltaY) <= restraint) {
            if (deltaX > 0) {
                // Right swipe (finger moves ->)
                // Expand text, shrink image
                introSection.classList.add('is-swiped');
            } else {
                // Left swipe (finger moves <-)
                // Expand image, shrink text
                introSection.classList.remove('is-swiped');
            }
        }
    }

    // Toggle on click for better accessibility/usability
    introSection.addEventListener('click', (e) => {
        if (window.innerWidth > 700) return;

        // Don't toggle if clicking a link or a button
        if (e.target.closest('a') || e.target.closest('button')) return;

        // Specific tap logic to expand the shrunken element
        if (introSection.classList.contains('is-swiped') && e.target.closest('.intro-image')) {
            introSection.classList.remove('is-swiped');
        } 
        else if (!introSection.classList.contains('is-swiped') && e.target.closest('.intro-text-container')) {
            introSection.classList.add('is-swiped');
        }
        else {
            introSection.classList.toggle('is-swiped');
        }
    });

    // Handle accessibility
    introSection.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            if (window.innerWidth <= 700) {
                introSection.classList.toggle('is-swiped');
            }
        }
    });
});

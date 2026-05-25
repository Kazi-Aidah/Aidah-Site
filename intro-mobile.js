document.addEventListener('DOMContentLoaded', () => {
    const introSection = document.querySelector('.intro');
    if (!introSection) return;

    let touchStartX = 0;
    let touchEndX = 0;

    introSection.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    introSection.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const swipeDistance = touchEndX - touchStartX;
        const threshold = 40; // Minimum distance for a swipe

        if (swipeDistance > threshold) {
            // Right swipe (finger moves ->)
            // User said: "On right swipe, the intro image's width must lesson"
            introSection.classList.add('is-swiped');
        } else if (swipeDistance < -threshold) {
            // Left swipe (finger moves <-)
            // Reverse of right swipe
            introSection.classList.remove('is-swiped');
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

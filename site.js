(() => {
  const backToTop = document.querySelector('[data-back-to-top]');

  if (backToTop) {
    const updateBackToTop = () => {
      backToTop.hidden = window.scrollY <= 300;
    };

    updateBackToTop();
    window.addEventListener('scroll', updateBackToTop, { passive: true });
  }

  document.querySelectorAll('.tableWrapper').forEach((wrapper, index) => {
    const pageTitle = document.querySelector('h1')?.textContent.trim() || 'BonaLabs';
    if (!wrapper.hasAttribute('tabindex')) wrapper.tabIndex = 0;
    if (!wrapper.hasAttribute('role')) wrapper.setAttribute('role', 'region');
    if (!wrapper.hasAttribute('aria-label')) {
      wrapper.setAttribute('aria-label', `Data table ${index + 1}: ${pageTitle}`);
    }
  });

  const revealTrackerUpdate = () => {
    if (!window.location.hash) return;

    let targetId;
    try {
      targetId = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }

    const target = document.getElementById(targetId);
    const update = target?.matches('details.weekly-update')
      ? target
      : target?.closest('details.weekly-update');

    if (!update) return;
    update.open = true;
    window.requestAnimationFrame(() => update.scrollIntoView({ block: 'start' }));
  };

  revealTrackerUpdate();
  window.addEventListener('hashchange', revealTrackerUpdate);
})();

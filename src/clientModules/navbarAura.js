function setupAura() {
  document.querySelectorAll('.navbar__link, .navbar__brand').forEach((el) => {
    if (el._auraAttached) return;
    el._auraAttached = true;

    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty('--mx', `${x}%`);
      el.style.setProperty('--my', `${y}%`);
    });
  });
}

export function onRouteDidUpdate() {
  setupAura();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAura);
  } else {
    setupAura();
  }
}

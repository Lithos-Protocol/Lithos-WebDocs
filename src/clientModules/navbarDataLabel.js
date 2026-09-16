function applyDataLabels() {
  document.querySelectorAll('.navbar__link').forEach((el) => {
    const text = el.textContent.trim();
    if (text) el.setAttribute('data-label', text);
  });
}

export function onRouteDidUpdate() {
  applyDataLabels();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyDataLabels);
  } else {
    applyDataLabels();
  }
}

// Header tone follows the section beneath it; mobile menu with keyboard support.
export function initHeader() {
  const header = document.querySelector('[data-header]');
  if (!header) return;
  const button = header.querySelector('.menu-button');
  const menu = header.querySelector('#mobile-menu');
  let queued = false;
  let menuOpen = false;

  function tone() {
    queued = false;
    if (menuOpen) { header.dataset.tone = 'light'; return; }
    const y = header.offsetHeight / 2;
    const below = document.elementsFromPoint(window.innerWidth / 2, y)
      .find(el => !header.contains(el) && el.closest('[data-theme]'));
    const theme = below?.closest('[data-theme]')?.dataset.theme || 'dark';
    header.dataset.tone = theme;
    // Transparent only over the pinned story stage, which shares the header's navy.
    const story = below?.closest('.story');
    const pinned = story && story.getBoundingClientRect().bottom >= window.innerHeight - 1;
    header.toggleAttribute('data-solid', theme === 'dark' && !pinned);
  }
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(tone); } };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  tone();

  if (!button || !menu) return;
  button.hidden = false;
  const label = button.querySelector('.menu-button__label');
  function setMenu(open, { focusButton = false } = {}) {
    menuOpen = open;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    label.textContent = open ? 'Close' : 'Menu';
    tone();
    if (open) menu.querySelector('a')?.focus();
    else if (focusButton) button.focus();
  }
  button.addEventListener('click', () => setMenu(!menuOpen));
  menu.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuOpen) setMenu(false, { focusButton: true });
  });
  document.addEventListener('click', event => {
    if (menuOpen && !header.contains(event.target)) setMenu(false);
  });
  matchMedia('(min-width: 1024px)').addEventListener?.('change', event => { if (event.matches) setMenu(false); });
}

// Adult self-confirmation. Not identity or age verification. Remembered for this
// browser session only. If <dialog> is unsupported the page simply stays open.
const KEY = 'courtside-adult-confirmed';

export function initGate() {
  const gate = document.querySelector('#age-gate');
  if (!gate || typeof gate.showModal !== 'function') return;
  let confirmed = false;
  try { confirmed = sessionStorage.getItem(KEY) === 'yes'; } catch { /* storage blocked */ }
  if (confirmed) return;

  const root = document.documentElement;
  root.classList.add('gate-open');
  gate.showModal();
  let accepted = false;
  gate.addEventListener('cancel', event => event.preventDefault());
  // Browsers may close a modal on Escape regardless of cancel handling; keep it
  // open until the visitor answers.
  gate.addEventListener('close', () => { if (!accepted) gate.showModal(); });

  gate.querySelector('[data-gate="yes"]').addEventListener('click', () => {
    try { sessionStorage.setItem(KEY, 'yes'); } catch { /* storage blocked */ }
    accepted = true;
    gate.close();
    root.classList.remove('gate-open');
  });
  gate.querySelector('[data-gate="no"]').addEventListener('click', () => {
    gate.dataset.state = 'declined';
    gate.querySelector('#gate-title').innerHTML = 'Sorry, <em>not yet.</em>';
    gate.querySelector('#gate-text').textContent = 'Courtside is only for adults of legal drinking age. Please come back when you are 18 or over.';
    gate.querySelector('#gate-title').setAttribute('tabindex', '-1');
    gate.querySelector('#gate-title').focus();
  });
}

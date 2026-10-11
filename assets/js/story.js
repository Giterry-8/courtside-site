// Scroll story: native page scrolling drives the rendered bottle sequence.
// No scroll interception — progress is read from window.scrollY and drawn on rAF.
import { FrameSequence } from './sequence.js';

const FRAMES = 48;
// progress -> frame. Holds give each chapter reading time; the render eases itself.
const KEYS = [[0, 1], [0.1, 1], [0.45, 16], [0.7, 36], [0.88, 48], [1, 48]];
const CHAPTER_STARTS = [0, 0.2, 0.45, 0.7];
const CHAPTER_TARGETS = [0, 0.32, 0.575, 0.9];
// Fractions of the frame occupied by the bottle (from the render manifest).
const BOTTLE_HALF_WIDTH = 0.1425; // of frame width
const BOTTLE_TOP = 0.144;         // closed cap top, from frame top
const CAP_TOP = 0.042;            // highest point of the lifted cap, from frame top

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function frameAt(p) {
  for (let i = 1; i < KEYS.length; i++) {
    const [p1, f1] = KEYS[i];
    const [p0, f0] = KEYS[i - 1];
    if (p <= p1) return Math.round(lerp(f0, f1, (p - p0) / (p1 - p0 || 1)));
  }
  return FRAMES;
}

export function initStory() {
  const root = document.documentElement;
  const story = document.querySelector('.story');
  if (!story) return;
  const stage = story.querySelector('.story__stage');
  const canvas = story.querySelector('.story__canvas');
  const chaptersBox = story.querySelector('.story__chapters');
  const chapters = [...story.querySelectorAll('.chapter')];
  const hero = story.querySelector('.chapter--hero');
  const marks = [...story.querySelectorAll('.mark')];
  const index = story.querySelector('.story__index');
  const indexButtons = [...story.querySelectorAll('[data-goto]')];
  const ctx = canvas.getContext?.('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  let on = false;
  let seq = null;
  let set = '';
  let top = 0, range = 1, progress = -1, chapter = -1, shown = 0, target = 1;
  let layout = { mode: 'wide', sHero: 1, dxHero: 0 };
  let queued = false;
  let visible = true;

  const scrollToProgress = p => {
    window.scrollTo({ top: top + p * range, behavior: reduce.matches ? 'auto' : 'smooth' });
  };

  function measure() {
    const W = stage.clientWidth, H = stage.clientHeight;
    const mode = W < 640 && H > W ? 'narrow' : (H < 520 && W > H ? 'short' : 'wide');
    story.dataset.layout = mode;
    const gutter = parseFloat(getComputedStyle(chaptersBox).left) || 20;
    let fh, fx, colW;
    if (mode === 'narrow') {
      fh = Math.min(H * 0.74, W * 1.45);
      const fw = fh * 5 / 7;
      fx = Math.min(W * 0.71, W - 6 - 0.3 * fw); // keep the lifted cap on screen
      colW = fx - BOTTLE_HALF_WIDTH * fw - gutter - 14;
    } else {
      // Full height, but keep the lifted cap's highest point clear of the header.
      const headerH = document.querySelector('[data-header]')?.offsetHeight || 0;
      fh = Math.min(H, (H - headerH - 10) / (1 - CAP_TOP));
      const fw = fh * 5 / 7;
      fx = W * (mode === 'short' ? 0.72 : W >= 1100 ? 0.575 : 0.64);
      colW = Math.min(W * 0.42, 600, fx - BOTTLE_HALF_WIDTH * fw - gutter - (mode === 'short' ? 28 : 40));
    }
    stage.style.setProperty('--fh', `${fh}px`);
    stage.style.setProperty('--fx', `${fx}px`);
    stage.style.setProperty('--col-w', `${Math.max(150, colW)}px`);

    if (mode === 'narrow') {
      // Hero state: copy spans the top, bottle centred and scaled to sit below it.
      const stageTop = stage.getBoundingClientRect().top;
      const copyBottom = hero.getBoundingClientRect().bottom - stageTop;
      const room = H - copyBottom - 14;
      layout = { mode, sHero: clamp(room / ((1 - BOTTLE_TOP) * fh), 0.42, 1), dxHero: W / 2 - fx };
    } else {
      layout = { mode, sHero: 1, dxHero: 0 };
    }

    // Canvas resolution and frame set follow the displayed size.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Respect data-saver: the small set is 0.8 MB against 1.5 MB.
    const saveData = navigator.connection?.saveData === true;
    const wantSet = !saveData && fh * dpr > 1060 ? 'lg' : 'sm';
    const source = wantSet === 'lg' ? 1680 : 1008;
    const h = Math.round(Math.min(fh * dpr, source));
    const w = Math.round(h * 5 / 7);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; shown = 0; }
    if (wantSet !== set) useSet(wantSet);

    const rect = story.getBoundingClientRect();
    top = rect.top + window.scrollY;
    range = Math.max(1, story.offsetHeight - stage.offsetHeight);
    progress = -1;
    update();
  }

  function useSet(name) {
    seq?.stop();
    set = name;
    shown = 0;
    seq = new FrameSequence({
      base: `assets/seq/${name}`,
      count: FRAMES,
      decodeCache: name === 'lg' ? 8 : 14,
      onFrameReady: n => { if (n === target || !shown) draw(target); },
      // If the large set is unavailable, fall back to the small one.
      onUnavailable: () => { if (name === 'lg') useSet('sm'); },
    });
    seq.setWanted(target);
    // The hero still loads first; the remaining states follow once the page has loaded.
    const current = seq;
    const begin = () => { if (seq === current) current.start(); };
    if (document.readyState === 'complete') begin();
    else window.addEventListener('load', begin, { once: true });
  }

  function paint(image, n) {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    story.dataset.frame = n; // drawn state, readable for review tooling
    if (!canvas.classList.contains('is-ready')) canvas.classList.add('is-ready');
  }

  function draw(n) {
    if (!seq || !ctx) return;
    target = n;
    seq.setWanted(n);
    if (shown === n) return;
    const image = seq.peek(n);
    if (image) { paint(image, n); shown = n; return; }
    const near = seq.nearestDecoded(n);
    if (near && near !== shown) { paint(seq.peek(near), near); shown = near; }
    const job = seq.decode(n);
    job?.then(img => { if (img && target === n && shown !== n) { paint(img, n); shown = n; } });
    // Warm the next few frames in the scroll direction.
    for (let d = 1; d <= 3; d++) seq.decode(n + d * (n >= shown ? 1 : -1));
  }

  function setChapter(c) {
    chapter = c;
    story.dataset.chapter = c;
    chapters.forEach((el, i) => el.classList.toggle('is-active', i === c));
    marks.forEach(el => el.classList.toggle('is-on', el.dataset.show.split(' ').includes(String(c))));
    indexButtons.forEach((b, i) => (i === c ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
  }

  function update() {
    queued = false;
    if (!on) return;
    const p = clamp((window.scrollY - top) / range);
    if (p === progress) return;
    progress = p;
    let c = 0;
    CHAPTER_STARTS.forEach((start, i) => { if (p >= start) c = i; });
    if (c !== chapter) setChapter(c);
    draw(frameAt(p));
    stage.style.setProperty('--p', p.toFixed(4));
    stage.style.setProperty('--glow', (smooth((p - 0.42) / 0.4) * 0.85).toFixed(3));
    if (layout.mode === 'narrow') {
      const t = smooth((p - 0.07) / 0.15);
      stage.style.setProperty('--s', lerp(layout.sHero, 1, t).toFixed(4));
      stage.style.setProperty('--dx', `${lerp(layout.dxHero, 0, t).toFixed(1)}px`);
    } else {
      stage.style.setProperty('--s', '1');
      stage.style.setProperty('--dx', '0px');
    }
  }

  const onScroll = () => { if (visible && !queued) { queued = true; requestAnimationFrame(update); } };
  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => on && measure(), 120); };
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) onScroll();
  }) : null;
  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(onResize) : null;

  // Keyboard users tabbing into a chapter's link bring that chapter into view.
  chaptersBox.addEventListener('focusin', event => {
    if (!on) return;
    const i = chapters.findIndex(el => el.contains(event.target));
    if (i >= 0 && i !== chapter) scrollToProgress(CHAPTER_TARGETS[i]);
  });
  indexButtons.forEach(button => button.addEventListener('click', () => {
    scrollToProgress(CHAPTER_TARGETS[Number(button.dataset.goto)]);
  }));

  function enable() {
    if (on || !ctx) return;
    on = true;
    // Switch layouts without animating every chapter out of the static state.
    root.classList.add('is-motion', 'is-settling');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('is-settling')));
    index.hidden = false;
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    observer?.observe(story);
    resizeObserver?.observe(document.body);
    measure();
    document.fonts?.ready.then(() => on && measure());
    window.addEventListener('load', () => on && measure(), { once: true });
  }

  function disable() {
    if (!on) return;
    on = false;
    root.classList.remove('is-motion');
    index.hidden = true;
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    observer?.disconnect();
    resizeObserver?.disconnect();
    seq?.stop(); seq = null; set = ''; shown = 0; chapter = -1;
    canvas.classList.remove('is-ready');
    chapters.forEach(el => el.classList.remove('is-active'));
    ['--fh', '--fx', '--col-w', '--p', '--glow', '--s', '--dx'].forEach(k => stage.style.removeProperty(k));
    delete story.dataset.layout; delete story.dataset.frame; delete story.dataset.chapter;
  }

  const apply = () => (reduce.matches ? disable() : enable());
  reduce.addEventListener?.('change', apply);
  apply();
}

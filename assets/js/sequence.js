// Loads a numbered WebP frame sequence progressively and keeps a small cache of
// decoded frames. Compressed frames are kept as Blobs (~20–60 KB each); only a
// handful are decoded at a time so memory stays bounded on phones.

const pad = n => String(n).padStart(4, '0');

export class FrameSequence {
  constructor({ base, count, decodeCache = 10, concurrency = 4, onFrameReady, onUnavailable }) {
    this.base = base;
    this.count = count;
    this.cap = decodeCache;
    this.concurrency = concurrency;
    this.onFrameReady = onFrameReady;
    this.onUnavailable = onUnavailable;
    this.blobs = new Array(count + 1);
    this.failed = new Set();
    this.inflight = new Set();
    this.decoded = new Map(); // frame -> ImageBitmap | HTMLImageElement, in LRU order
    this.decoding = new Map();
    this.want = 1;
    this.first = [1, count, Math.round(count / 2), Math.round(count / 4), Math.round(count * 3 / 4)];
    this.stopped = false;
  }

  url(n) { return `${this.base}/frame-${pad(n)}.webp`; }

  start() { for (let i = 0; i < this.concurrency; i++) this.pump(); }

  stop() {
    this.stopped = true;
    for (const image of this.decoded.values()) image.close?.();
    this.decoded.clear();
  }

  setWanted(n) { this.want = n; }

  loadedCount() { return this.blobs.filter(Boolean).length; }

  nextToFetch() {
    const missing = n => !this.blobs[n] && !this.inflight.has(n) && !this.failed.has(n);
    const early = this.first.find(missing);
    if (early) return early;
    for (let d = 0; d < this.count; d++) {
      for (const n of [this.want + d, this.want - d]) {
        if (n >= 1 && n <= this.count && missing(n)) return n;
      }
    }
    return 0;
  }

  async pump() {
    while (!this.stopped) {
      const n = this.nextToFetch();
      if (!n) return;
      this.inflight.add(n);
      try {
        const response = await fetch(this.url(n));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this.blobs[n] = await response.blob();
        this.onFrameReady?.(n);
      } catch {
        this.failed.add(n);
        // The first frame is fetched first; if it is missing, the set is unusable.
        if (n === 1 && !this.stopped) { this.stopped = true; this.onUnavailable?.(); }
      } finally {
        this.inflight.delete(n);
      }
    }
  }

  // Returns a decoded frame synchronously if cached; otherwise starts decoding.
  peek(n) {
    const image = this.decoded.get(n);
    if (image) {
      this.decoded.delete(n);
      this.decoded.set(n, image); // refresh LRU position
      return image;
    }
    this.decode(n);
    return null;
  }

  decode(n) {
    if (this.decoded.has(n) || this.decoding.has(n) || !this.blobs[n]) return this.decoding.get(n);
    const blob = this.blobs[n];
    const job = (typeof createImageBitmap === 'function'
      ? createImageBitmap(blob)
      : new Promise((resolve, reject) => {
          const img = new Image();
          const src = URL.createObjectURL(blob);
          img.onload = () => { URL.revokeObjectURL(src); resolve(img); };
          img.onerror = reject;
          img.src = src;
        }))
      .then(image => {
        this.decoding.delete(n);
        if (this.stopped) { image.close?.(); return null; }
        this.decoded.set(n, image);
        this.evict();
        return image;
      })
      .catch(() => { this.decoding.delete(n); return null; });
    this.decoding.set(n, job);
    return job;
  }

  evict() {
    while (this.decoded.size > this.cap) {
      const [oldest, image] = this.decoded.entries().next().value;
      if (oldest === this.want) { this.decoded.delete(oldest); this.decoded.set(oldest, image); continue; }
      this.decoded.delete(oldest);
      image.close?.();
    }
  }

  // Nearest frame that is already decoded, so a fast scroll never shows a blank.
  nearestDecoded(n) {
    for (let d = 1; d < this.count; d++) {
      for (const m of [n - d, n + d]) if (this.decoded.has(m)) return m;
    }
    return 0;
  }
}

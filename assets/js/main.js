import { initGate } from './gate.js';
import { initHeader } from './header.js';
import { initStory } from './story.js';
import { initEnquiry } from './enquiry.js';

// Each part fails independently; the static page remains complete regardless.
for (const init of [initGate, initHeader, initStory, initEnquiry]) {
  try { init(); } catch (error) { console.error(error); }
}

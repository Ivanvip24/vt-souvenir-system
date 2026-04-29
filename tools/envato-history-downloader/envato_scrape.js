window.__envatoDone = false;
window.__envatoUrls = [];
(async () => {
  const seen = new Set();
  const collect = () => {
    document.querySelectorAll('img').forEach(i => {
      if (/envatousercontent\.com.*generated-assets/.test(i.src)) seen.add(i.src);
    });
  };
  collect();
  let stableRounds = 0;
  let lastCount = 0;

  // Find every scrollable element on the page (Envato may use an inner scroll container).
  const scrollables = [document.scrollingElement || document.documentElement];
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50) {
      scrollables.push(el);
    }
  });

  for (let i = 0; i < 400 && stableRounds < 12; i++) {
    // Scroll all candidates to the bottom
    scrollables.forEach(s => { try { s.scrollTo(0, s.scrollHeight); } catch(e){} });
    window.scrollBy(0, 8000);
    // Also dispatch a wheel event to nudge virtual scrollers
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 4000, bubbles: true }));
    await new Promise(r => setTimeout(r, 1500));
    collect();
    if (seen.size === lastCount) stableRounds++;
    else { stableRounds = 0; lastCount = seen.size; }
  }

  // Final flush: scroll to top, then back to bottom
  scrollables.forEach(s => { try { s.scrollTo(0, 0); } catch(e){} });
  await new Promise(r => setTimeout(r, 800));
  collect();
  scrollables.forEach(s => { try { s.scrollTo(0, s.scrollHeight); } catch(e){} });
  await new Promise(r => setTimeout(r, 800));
  collect();
  window.__envatoUrls = Array.from(seen);
  window.__envatoDone = true;
})();
'started';

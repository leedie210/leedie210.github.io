/* 可调参数：无需构建工具；修改后重新打开 index.html。 */
const CONFIG = {
  revealDuration: 3000,
  revealSpread: 2200,
  staggerMax: 140,
  scrambleMin: 360,
  scrambleMax: 620,
  scrambleInterval: 48,
  cellWidth: 8,
  cellHeight: 12,
  maxDpr: 2,
  parallaxStrength: 3,
  photoScrub: 0.6,
  trailLifetime: 800,
  trailLimit: 140,
  colors: { black:'#000000', paper:'#F5F5F5', acid:'#DFFF2F', rust:'#6D3425', ink:'#745D50', line:'#C8BEB5', brown:'#795E4B', pale:'#EBFF79', city:'#C8C9BA' }
};

(() => {
  'use strict';
  Object.entries(CONFIG.colors).forEach(([name, value]) => document.documentElement.style.setProperty('--' + name, value));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const touch = matchMedia('(any-pointer: coarse)');
  const quiet = () => reduced.matches || coarse.matches || touch.matches;
  const diagnostics = window.__portfolio = { cityState:'loading', cityFrames:0, cityCells:0, photoProgress:0, photoOverflow:[], config:CONFIG };

  // Closed native details remain a readable, playable no-script fallback.
  // Only folder-summary activation is intercepted; page scrolling is untouched.
  const dialog = document.querySelector('#project-dialog');
  const detail = dialog.querySelector('.detail-body');
  const closeButton = document.querySelector('#close-dialog');
  const backButton = document.querySelector('#back-dialog');
  let opener = null;
  let views = [];
  function pausePlayers() {
    detail.querySelectorAll('video').forEach(video => video.pause());
  }
  function renderView(view, restore = false) {
    pausePlayers();
    detail.replaceChildren(view.content.cloneNode(true));
    // Source registrations stay in closed details; cloned IDs must be unique.
    detail.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    const heading = detail.querySelector('h2');
    if (heading) heading.id = 'detail-title';
    backButton.hidden = views.length < 2;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = restore ? view.scroll : 0;
    const target = restore && view.focusKey
      ? [...detail.querySelectorAll('[data-project], summary')].find(node => focusKey(node) === view.focusKey)
      : null;
    (target || (views.length > 1 ? backButton : closeButton)).focus({preventScroll:true});
  }
  function focusKey(node) {
    return node.dataset.project ? 'project-' + node.dataset.project : 'stack-' + node.parentElement.dataset.stack;
  }
  function enter(content, trigger) {
    if (!dialog.open) {
      opener = trigger;
      views = [];
    } else {
      const previous = views[views.length - 1];
      previous.scroll = dialog.scrollTop;
      previous.focusKey = focusKey(trigger);
    }
    const view = {content, scroll:0, focusKey:null};
    views.push(view);
    renderView(view);
  }
  document.addEventListener('click', event => {
    if (!dialog.showModal) return;
    const summary = event.target.closest('.room-folder, .stack-cover');
    if (summary) {
      event.preventDefault(); // Replace only the native details toggle with a modal.
      enter(summary.nextElementSibling, summary);
      return;
    }
    const trigger = event.target.closest('[data-project]');
    if (!trigger) return;
    if (trigger.matches('summary')) event.preventDefault();
    const source = document.getElementById('project-' + trigger.dataset.project);
    if (!source) return;
    if (source.matches('.local-video-entry')) {
      const content = document.createElement('div');
      content.className = 'local-video-detail';
      const title = document.createElement('h2');
      title.id = 'detail-title';
      title.textContent = source.querySelector('.local-video-title').textContent;
      content.append(title, source.querySelector('video').cloneNode(true));
      const fragment = document.createDocumentFragment();
      fragment.append(content);
      enter(fragment, trigger);
    } else {
      enter(source.content, trigger);
    }
  });
  backButton.addEventListener('click', () => {
    if (views.length < 2) return;
    views.pop();
    renderView(views[views.length - 1], true);
  });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const stops = [...dialog.querySelectorAll('button, a[href], summary, video[controls], [tabindex]')]
      .filter(node => node.tabIndex >= 0 && !node.disabled && node.checkVisibility());
    const first = stops[0], last = stops[stops.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({preventScroll:true});
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({preventScroll:true});
    }
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  // Native modal semantics handle Esc; Tab wraps at the sheet's boundaries.
  dialog.addEventListener('close', () => {
    // A queued close event must not clear a sheet that has already reopened.
    if (dialog.open) return;
    pausePlayers();
    detail.replaceChildren();
    views = [];
    opener?.focus({preventScroll:true});
    opener = null;
  });

  // Content is visible by default. Only the entry itself receives an animation.
  if ('IntersectionObserver' in window && !reduced.matches) {
    const entries = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(list => list.forEach(entry => {
      if (!entry.isIntersecting) return;
      const element = entry.target;
      element.classList.add('is-entering');
      element.addEventListener('animationend', () => element.classList.remove('is-entering'), {once:true});
      observer.unobserve(element);
    }), {rootMargin:'0px 0px -15% 0px', threshold:0});
    entries.forEach(element => {
      const siblings = [...element.parentElement.children].filter(child => child.classList.contains('reveal'));
      element.style.setProperty('--delay', Math.min(4, siblings.indexOf(element)) * (element.classList.contains('room-card') ? .1 : .08) + 's');
      observer.observe(element);
    });
  }

  // Two measured, opposite horizontal tracks. No wheel listeners or scroll hijack.
  const band = document.querySelector('#photo-band');
  const rows = [...band.querySelectorAll('.drift-row')];
  let overflow = [0, 0], target = 0, progress = null, driftRaf = 0, previousTime = 0;
  function applyDrift() {
    rows.forEach((row, index) => {
      const x = -overflow[index] * (index === 0 ? progress : 1 - progress);
      row.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
    });
    diagnostics.photoProgress = progress;
  }
  function driftFrame(time) {
    driftRaf = 0;
    if (document.hidden) return;
    const dt = Math.min(64, time - (previousTime || time - 16));
    previousTime = time;
    if (progress === null || reduced.matches) progress = target;
    else progress += (target - progress) * (1 - Math.exp(-dt / (CONFIG.photoScrub * 1000)));
    if (Math.abs(progress - target) < .00005) progress = target;
    applyDrift();
    if (progress !== target) driftRaf = requestAnimationFrame(driftFrame);
  }
  function updateDrift() {
    const rect = band.getBoundingClientRect();
    target = Math.max(0, Math.min(1, (innerHeight - rect.top) / (innerHeight + rect.height)));
    if (!driftRaf && !document.hidden) { previousTime = 0; driftRaf = requestAnimationFrame(driftFrame); }
  }
  function measureDrift() {
    overflow = rows.map(row => Math.max(0, row.scrollWidth - row.parentElement.clientWidth));
    diagnostics.photoOverflow = overflow.slice();
    updateDrift();
  }
  addEventListener('scroll', updateDrift, {passive:true});
  addEventListener('resize', measureDrift, {passive:true});
  if ('ResizeObserver' in window) new ResizeObserver(measureDrift).observe(band);
  band.querySelectorAll('img').forEach(img => img.addEventListener('load', measureDrift, {once:true}));
  measureDrift();

  // Photo luminance was sampled offline. No fetch(), external font or file://
  // canvas pixel read is required. Every visible mark is a real text glyph.
  let cityResume = () => {}, trailResume = () => {};
  try {
    const canvas = document.querySelector('#city');
    const ctx = canvas.getContext('2d', {alpha:false});
    if (!ctx || !window.CITY_FIELD) throw new Error('Canvas or luminance field unavailable');
    const field = window.CITY_FIELD;
    const bytes = Uint8Array.from(atob(field.luminance), char => char.charCodeAt(0));
    const gradient = ' .,:;i1tfLCG08@';
    const noise = '01[]{}<>/\\:;+=*#%';
    let width, height, cells = [], cityRaf = 0, active = true, settled = quiet();
    let lastTick = -1, dirty = true, mx = 0, my = 0, tx = 0, ty = 0;
    const start = performance.now();
    diagnostics.cityStarted = start;
    function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
    function layout() {
      width = innerWidth; height = innerHeight;
      const dpr = Math.min(CONFIG.maxDpr, devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.font = `${CONFIG.cellHeight - 1}px ui-monospace, "Cascadia Code", Consolas, monospace`;
      ctx.textBaseline = 'top';
      const scale = Math.max(width / field.width, height / field.height);
      // Portrait layouts retain a wider skyline instead of a single tower crop.
      const portrait = width / height < .8;
      const sourceWidth = portrait ? field.width * .9 : width / scale;
      const sourceHeight = height / scale;
      const sourceLeft = (field.width - sourceWidth) / 2;
      const sourceTop = (field.height - sourceHeight) / 2;
      cells = [];
      for (let y = 0, row = 0; y < height; y += CONFIG.cellHeight, row++) {
        for (let x = 0, col = 0; x < width; x += CONFIG.cellWidth, col++) {
          const sx = Math.max(0,Math.min(field.width - 1, Math.floor(sourceLeft + x / width * sourceWidth)));
          const sy = Math.max(0,Math.min(field.height - 1, Math.floor(sourceTop + y / height * sourceHeight)));
          const index = sy * field.width + sx;
          const lum = bytes[index];
          const strength = Math.max(0, Math.min(1, (216 - lum) / 175));
          const edge = Math.abs(lum - bytes[sy * field.width + Math.min(sx + 1,field.width - 1)]) / 255;
          const id = row * 1000 + col;
          if (strength < .11 && hash(id) > .13) continue;
          const char = gradient[Math.max(1,Math.min(gradient.length - 1,Math.floor(strength * (gradient.length - 1))))];
          const fade = Math.max(.08, 1 - Math.max(0, sy / field.height - .60) * 2.7);
          const alpha = Math.min(.75, (.06 + strength * .46 + edge * .4) * fade);
          const delay = y / height * CONFIG.revealSpread + hash(id + 4) * CONFIG.staggerMax;
          const duration = CONFIG.scrambleMin + hash(id + 8) * (CONFIG.scrambleMax - CONFIG.scrambleMin);
          cells.push({x,y,char,alpha,delay,duration,id,depth:.25 + strength * .75});
        }
      }
      diagnostics.cityCells = cells.length;
      dirty = true; lastTick = -1; schedule();
    }
    function draw(elapsed) {
      ctx.globalAlpha = 1; ctx.fillStyle = CONFIG.colors.black; ctx.fillRect(0,0,width,height);
      ctx.fillStyle = CONFIG.colors.city;
      let scrambling = 0, final = 0, activeYMax = 0;
      const tick = Math.floor(elapsed / CONFIG.scrambleInterval);
      for (const cell of cells) {
        const age = elapsed - cell.delay;
        if (!settled && age < 0) continue;
        activeYMax = Math.max(activeYMax,cell.y);
        let char = cell.char, alpha = cell.alpha;
        if (!settled && age < cell.duration) {
          char = noise[Math.floor(hash(cell.id + tick * 21) * noise.length)];
          alpha = Math.min(.65, alpha + .1); scrambling++;
        } else final++;
        ctx.globalAlpha = alpha;
        ctx.fillText(char,cell.x + mx * cell.depth,cell.y + my * cell.depth);
      }
      diagnostics.cityFrames++;
      diagnostics.scramblingCells = scrambling;
      diagnostics.finalCells = final;
      diagnostics.activeHeightRatio = activeYMax / height;
      diagnostics.cityElapsed = Math.round(elapsed);
    }
    function frame(time) {
      cityRaf = 0;
      if (!active || document.hidden) return;
      const elapsed = time - start;
      if (!settled && (quiet() || elapsed >= CONFIG.revealDuration)) {
        settled = true; dirty = true;
        diagnostics.citySettledAt = Math.round(elapsed);
      }
      diagnostics.cityState = settled ? 'settled' : 'revealing';
      const tick = Math.floor(elapsed / CONFIG.scrambleInterval);
      const moving = Math.abs(tx - mx) + Math.abs(ty - my) > .02;
      if (moving) { mx += (tx - mx) * .16; my += (ty - my) * .16; dirty = true; }
      if (dirty || (!settled && tick !== lastTick)) { draw(elapsed); dirty = false; lastTick = tick; }
      if (!settled || moving) schedule();
    }
    function schedule() { if (!cityRaf && active && !document.hidden) cityRaf = requestAnimationFrame(frame); }
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      active = entries[0].isIntersecting;
      if (!active) { cancelAnimationFrame(cityRaf); cityRaf = 0; }
      else { dirty = true; schedule(); }
    }).observe(document.querySelector('.hero'));
    addEventListener('pointermove', event => {
      if (quiet() || event.pointerType !== 'mouse' || !active) return;
      tx = (event.clientX / innerWidth - .5) * CONFIG.parallaxStrength;
      ty = (event.clientY / innerHeight - .5) * CONFIG.parallaxStrength;
      schedule();
    }, {passive:true});
    addEventListener('resize', layout, {passive:true});
    const modeChange = () => { if (quiet()) { settled = true; mx = my = tx = ty = 0; dirty = true; } schedule(); };
    reduced.addEventListener('change', modeChange); coarse.addEventListener('change', modeChange); touch.addEventListener('change', modeChange);
    cityResume = () => { if (document.hidden) { cancelAnimationFrame(cityRaf); cityRaf = 0; } else schedule(); };
    layout();
  } catch (error) {
    diagnostics.cityState = 'fallback';
    diagnostics.cityError = error.message;
    // Plain black is intentional: all HTML content remains readable and usable.
  }

  // Small, short lived desktop trail. Its RAF ends after the last mark fades.
  try {
    const canvas = document.querySelector('#cursor-trail');
    const ctx = canvas.getContext('2d');
    let particles = [], raf = 0, lastSpawn = 0;
    function sizeTrail() {
      const dpr = Math.min(CONFIG.maxDpr, devicePixelRatio || 1);
      canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    function paint(time) {
      raf = 0; ctx.clearRect(0,0,innerWidth,innerHeight);
      if (document.hidden || quiet()) { particles = []; return; }
      particles = particles.filter(p => time - p.born < CONFIG.trailLifetime);
      ctx.fillStyle = CONFIG.colors.acid;
      ctx.font = '11px ui-monospace, Consolas, monospace';
      for (const p of particles) {
        const age = (time - p.born) / CONFIG.trailLifetime;
        ctx.globalAlpha = (1 - age) * .65;
        if (p.block) ctx.fillRect(p.x,p.y + age * 14,4,4);
        else ctx.fillText(p.char,p.x,p.y + age * 14);
      }
      ctx.globalAlpha = 1;
      if (particles.length) raf = requestAnimationFrame(paint);
    }
    addEventListener('pointermove', event => {
      if (quiet() || event.pointerType !== 'mouse' || document.hidden) return;
      const now = performance.now();
      if (now - lastSpawn < 16) return;
      lastSpawn = now;
      particles.push({x:event.clientX + 10,y:event.clientY + 6,born:now,char:'01+:'[Math.floor(Math.random() * 4)],block:Math.random() > .6});
      if (particles.length > CONFIG.trailLimit) particles.shift();
      if (!raf) raf = requestAnimationFrame(paint);
    }, {passive:true});
    addEventListener('resize', sizeTrail, {passive:true});
    trailResume = () => { cancelAnimationFrame(raf); raf = 0; particles = []; ctx.clearRect(0,0,innerWidth,innerHeight); };
    sizeTrail();
  } catch (_) { /* Decorative only. */ }
  document.addEventListener('visibilitychange', () => {
    cityResume(); trailResume();
    if (document.hidden) { cancelAnimationFrame(driftRaf); driftRaf = 0; } else updateDrift();
  });
})();

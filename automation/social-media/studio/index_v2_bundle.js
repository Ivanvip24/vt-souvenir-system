// Bundled scripts — auto-extracted for browser execution reliability


//  ======== SCRIPT {} ========


(function(){
  'use strict';

  // -------------------- Shared state --------------------
  window.AXKAN = window.AXKAN || {};
  const AXKAN = window.AXKAN;

  AXKAN.state = {
    contentType: null,   // 'imagen' | 'video' | 'pitch' | 'post' | 'pitch-b2b'
    subType: null,       // 'carousel-loop' | 'personaje-hablando'
    destination: '',
    theme: '',
    files: [],
    prompts: []
  };

  // Safe shims in case the shell agent hasn't wired these yet.
  // For callback registrars (onContinuar/onAtras), remember the last callback
  // passed so the real shell implementation can pick it up after DOMContentLoaded.
  // Without this, any cb registered here would be lost when the shell replaces
  // the shim, and the CTA click would dispatch to nothing.
  AXKAN.__pendingContinuar = null;
  AXKAN.__pendingAtras = null;
  AXKAN.setStep     = AXKAN.setStep     || function(){};
  AXKAN.enableCTA   = AXKAN.enableCTA   || function(){};
  AXKAN.showAtras   = AXKAN.showAtras   || function(){};
  AXKAN.onContinuar = AXKAN.onContinuar || function(cb){ AXKAN.__pendingContinuar = cb; };
  AXKAN.onAtras     = AXKAN.onAtras     || function(cb){ AXKAN.__pendingAtras = cb; };
  AXKAN.setCTALabel = AXKAN.setCTALabel || function(){};

  // Exposed for agent C
  AXKAN.getUploadedFiles = function(){ return AXKAN.state.files.slice(); };
  AXKAN.getState = function(){ return AXKAN.state; };

  // -------------------- Screen switching --------------------
  const screens = Array.from(document.querySelectorAll('.screen'));
  let current = 2;

  function showScreen(n){
    if (n < 1 || n > 7) return;
    // Skip screen 3 when contentType !== 'video'
    if (n === 3 && AXKAN.state.contentType !== 'video') {
      // direction-aware: decide from current
      if (current < 3) return showScreen(4);
      return showScreen(2);
    }
    const prev = document.getElementById('screen-' + current);
    const next = document.getElementById('screen-' + n);
    if (prev) prev.classList.remove('active');
    if (next) {
      next.classList.add('active');
      // Re-trigger animation
      next.style.animation = 'none';
      void next.offsetWidth;
      next.style.animation = '';
    }
    current = n;
    AXKAN.state.currentScreen = n;
    if (AXKAN.persistState) AXKAN.persistState();
    onEnter(n);
  }

  AXKAN.showScreen = showScreen;

  function onEnter(n){
    const sec = document.getElementById('screen-' + n);
    const step = sec && sec.dataset.step;
    if (step) AXKAN.setStep(step);

    // Default back-button visibility (screen 2 is first, screen 7 is last)
    AXKAN.showAtras(n > 2 && n < 7);
    AXKAN.setCTALabel(n === 6 ? 'Enviar a Envato' : 'Continuar');

    switch(n){
      case 1: enterWelcome(); break;
      case 2: enterType(); break;
      case 3: enterSubType(); break;
      case 4: enterDetails(); break;
      case 5: enterUpload(); break;
      case 6: enterPrompts(); break;
      case 7: enterDone(); break;
    }
  }

  // Map the UI's content type to the backend's content_type + is_video params.
  // Kept in one place so case 5 + case 6 agree.
  function backendContentType() {
    const t = AXKAN.state.contentType;
    const s = AXKAN.state.subType;
    if (t === 'video' && s === 'carousel-loop')      return { content_type: 'living',              is_video: true,  loop: true  };
    if (t === 'video' && s === 'personaje-hablando') return { content_type: 'character',           is_video: true,  loop: false };
    if (t === 'video')                                return { content_type: 'reel',                is_video: true,  loop: false };
    if (t === 'pitch' || t === 'pitch-b2b')           return { content_type: 'pitch',               is_video: false, loop: false };
    if (t === 'post')                                 return { content_type: 'post',                is_video: false, loop: false };
    /* default: imagen */                             return { content_type: 'instagram_carousel',  is_video: false, loop: false };
  }

  // Continuar → forward logic per screen
  AXKAN.onContinuar(function(){
    switch(current){
      case 2:
        if (!AXKAN.state.contentType) return;
        showScreen(AXKAN.state.contentType === 'video' ? 3 : 4);
        break;
      case 3:
        if (!AXKAN.state.subType) return;
        showScreen(4);
        break;
      case 4:
        if (!validateDetails()) return;
        showScreen(5);
        break;
      case 5: {
        // Screen 5 → 6: upload files, then generate prompts.
        if (AXKAN.state.files.length < 1) return;
        const api = window.AXKAN && window.AXKAN.api;
        const showToast = (window.AXKAN && window.AXKAN.showToast) || function(){};
        const showLoading = (window.AXKAN && window.AXKAN.showLoading) || function(){};
        const hideLoading = (window.AXKAN && window.AXKAN.hideLoading) || function(){};
        if (!api) {
          // No backend wired — fall back to placeholders so the UI still flows.
          AXKAN.state.prompts = defaultPrompts();
          showScreen(6);
          return;
        }
        AXKAN.enableCTA(false);
        showLoading('Subiendo imágenes…');
        const cfg = backendContentType();
        (async function(){
          try {
            // Upload every File in AXKAN.state.files
            const uploadRes = await api.uploadImages(AXKAN.state.files);
            AXKAN.state.sessionId = uploadRes.session_id;
            AXKAN.state.filePaths = (uploadRes.files || []).map(function(f){ return f.path; });

            showLoading('Claude está escribiendo tus prompts… ~22s');
            const slidesCount = Math.max(AXKAN.state.files.length, 3);
            const promptPayload = {
              destination: AXKAN.state.destination || '',
              slides: slidesCount,
              product_type: 'iman',
              content_type: cfg.content_type,
              theme: AXKAN.state.theme || '',
              is_video: cfg.is_video,
              session_id: AXKAN.state.sessionId,
            };
            const res = await api.generatePrompts(promptPayload);
            const list = (res && res.prompts) || [];
            AXKAN.state.prompts = list.map(function(p){
              return {
                slide_name: p.slide_name || ('Slide ' + (p.slide_number || '')),
                prompt_text: p.prompt_text || '',
                speech: p.speech || '',
                estimated_time: p.estimated_time || '',
                slide_number: p.slide_number,
              };
            });
            hideLoading();
            showToast('Prompts listos ✨', 'success');
            showScreen(6);
          } catch (e) {
            hideLoading();
            AXKAN.enableCTA(true);
            showToast('Error: ' + (e && e.message ? e.message : 'desconocido'), 'error');
          }
        })();
        break;
      }
      case 6: {
        // Screen 6 → 7: send prompts to Envato.
        const api = window.AXKAN && window.AXKAN.api;
        const showToast = (window.AXKAN && window.AXKAN.showToast) || function(){};
        const showLoading = (window.AXKAN && window.AXKAN.showLoading) || function(){};
        const hideLoading = (window.AXKAN && window.AXKAN.hideLoading) || function(){};
        const cfg = backendContentType();
        if (!api) { showScreen(7); return; }
        AXKAN.enableCTA(false);
        showLoading('Enviando a Envato…');
        (async function(){
          try {
            const prompts = AXKAN.state.prompts || [];
            const filePaths = AXKAN.state.filePaths || [];
            if (cfg.is_video) {
              // Video flow: send each prompt paired with its corresponding uploaded frame.
              if (prompts.length > 1) {
                await api.sendToEnvato({
                  prompts:    prompts.map(function(p){ return p.prompt_text; }),
                  speeches:   prompts.map(function(p){ return p.speech || ''; }),
                  imagePaths: prompts.map(function(_, i){ return filePaths[i] || filePaths[0] || null; }),
                  loop: cfg.loop,
                }, true);
              } else {
                const p = prompts[0] || { prompt_text: '', speech: '' };
                await api.sendToEnvato({
                  prompt:    p.prompt_text,
                  speech:    p.speech || '',
                  imagePath: filePaths[0] || null,
                  loop:      cfg.loop,
                });
              }
            } else {
              // Static image flow — one Envato ImageGen tab per prompt.
              for (let i = 0; i < prompts.length; i++) {
                await api.sendToEnvato({
                  prompt:      prompts[i].prompt_text,
                  aspectRatio: '1:2',
                  referenceImages: [],
                }, 'image');
              }
            }
            hideLoading();
            showToast('Enviado a Envato 🚀', 'success');
            showScreen(7);
          } catch (e) {
            hideLoading();
            AXKAN.enableCTA(true);
            showToast('Error al enviar: ' + (e && e.message ? e.message : 'desconocido'), 'error');
          }
        })();
        break;
      }
      case 7: /* no-op */ break;
    }
  });

  AXKAN.onAtras(function(){
    switch(current){
      case 3: showScreen(2); break;
      case 4:
        showScreen(AXKAN.state.contentType === 'video' ? 3 : 2);
        break;
      case 5: showScreen(4); break;
      case 6: showScreen(5); break;
      default: break; // 2 (start) and 7 (done) don't show back
    }
  });

  // Welcome screen removed — app starts at content-type selection
  function enterWelcome(){ showScreen(2); }

  // -------------------- Screen 2: type --------------------
  const typeGrid = document.getElementById('type-grid');
  const moreCards = document.getElementById('more-cards');
  const moreLink = document.getElementById('more-link');

  function allTypeCards(){
    return Array.from(document.querySelectorAll('.type-card[data-type]'));
  }

  function selectType(card){
    allTypeCards().forEach(c => {
      c.classList.remove('selected');
      c.setAttribute('aria-checked','false');
    });
    card.classList.add('selected');
    card.setAttribute('aria-checked','true');
    AXKAN.state.contentType = card.dataset.type;
    AXKAN.enableCTA(true);
    if (AXKAN.persistState) AXKAN.persistState();
  }

  allTypeCards().forEach(card => {
    card.addEventListener('click', () => selectType(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectType(card);
      }
    });
  });

  // Arrow key nav between cards on screen 2
  document.addEventListener('keydown', function(e){
    if (current !== 2) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const cards = allTypeCards();
    const active = document.activeElement;
    let idx = cards.indexOf(active);
    if (idx === -1) idx = 0;
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const next = cards[(idx + delta + cards.length) % cards.length];
    if (next) { next.focus(); e.preventDefault(); }
  });

  moreLink.addEventListener('click', function(){
    moreCards.classList.toggle('hidden');
  });
  moreLink.addEventListener('keydown', function(e){
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      moreCards.classList.toggle('hidden');
    }
  });

  function enterType(){
    AXKAN.enableCTA(!!AXKAN.state.contentType);
    // Restore visual selection
    allTypeCards().forEach(c => {
      const on = c.dataset.type === AXKAN.state.contentType;
      c.classList.toggle('selected', on);
      c.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  // -------------------- Screen 3: sub-type --------------------
  const subGrid = document.getElementById('sub-grid');
  function allSubCards(){
    return Array.from(subGrid.querySelectorAll('.type-card[data-sub]'));
  }
  function selectSub(card){
    allSubCards().forEach(c => {
      c.classList.remove('selected');
      c.setAttribute('aria-checked','false');
    });
    card.classList.add('selected');
    card.setAttribute('aria-checked','true');
    AXKAN.state.subType = card.dataset.sub;
    AXKAN.enableCTA(true);
    if (AXKAN.persistState) AXKAN.persistState();
  }
  allSubCards().forEach(card => {
    card.addEventListener('click', () => selectSub(card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectSub(card);
      }
    });
  });

  function enterSubType(){
    AXKAN.enableCTA(!!AXKAN.state.subType);
    allSubCards().forEach(c => {
      const on = c.dataset.sub === AXKAN.state.subType;
      c.classList.toggle('selected', on);
      c.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  // -------------------- Screen 4: details + ghost text --------------------
  const destInput  = document.getElementById('dest-input');
  const themeInput = document.getElementById('theme-input');
  const ghostLayer = document.getElementById('ghost-layer');

  const GHOST_PROMPTS = [
    'atardecer dorado, vibes tropicales, cámara flotando lento',
    'colores saturados, hora dorada, hojas de palma',
    'luz cenital suave, primer plano del detalle artesanal',
    'amanecer pastel, niebla suave, partículas de polen',
    'textura de madera y tinta, macro cinemático',
    'mercado mexicano vibrante, pan handheld'
  ];

  let ghost = {
    idx: 0,
    charIdx: 0,
    phase: 'typing', // 'typing' | 'pausing' | 'deleting'
    timer: null,
    enabled: false,
    accepted: false
  };

  function ghostRender(){
    const text = GHOST_PROMPTS[ghost.idx].slice(0, ghost.charIdx);
    ghostLayer.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = text;
    ghostLayer.appendChild(span);
    const caret = document.createElement('span');
    caret.className = 'caret';
    caret.textContent = ' ';
    ghostLayer.appendChild(caret);
  }

  function ghostClear(){
    ghostLayer.innerHTML = '';
  }

  function ghostStep(){
    if (!ghost.enabled) return;
    const full = GHOST_PROMPTS[ghost.idx];
    if (ghost.phase === 'typing') {
      if (ghost.charIdx < full.length) {
        ghost.charIdx++;
        ghostRender();
        ghost.timer = setTimeout(ghostStep, 50);
      } else {
        ghost.phase = 'pausing';
        ghost.timer = setTimeout(ghostStep, 2500);
      }
    } else if (ghost.phase === 'pausing') {
      ghost.phase = 'deleting';
      ghost.timer = setTimeout(ghostStep, 30);
    } else if (ghost.phase === 'deleting') {
      if (ghost.charIdx > 0) {
        ghost.charIdx--;
        ghostRender();
        ghost.timer = setTimeout(ghostStep, 20);
      } else {
        ghost.idx = (ghost.idx + 1) % GHOST_PROMPTS.length;
        ghost.phase = 'typing';
        ghost.timer = setTimeout(ghostStep, 300);
      }
    }
  }

  function ghostStart(){
    if (ghost.enabled) return;
    if (themeInput.value.length > 0) return; // user typed, don't start
    ghost.enabled = true;
    ghost.idx = 0;
    ghost.charIdx = 0;
    ghost.phase = 'typing';
    ghostStep();
  }

  function ghostStop(){
    ghost.enabled = false;
    if (ghost.timer) { clearTimeout(ghost.timer); ghost.timer = null; }
    ghostClear();
  }

  function validateDetails(){
    return destInput.value.trim().length >= 2;
  }

  function syncDetailsCTA(){
    AXKAN.state.destination = destInput.value.trim();
    AXKAN.state.theme = themeInput.value.trim();
    AXKAN.enableCTA(validateDetails());
    if (AXKAN.persistState) AXKAN.persistState();
  }

  destInput.addEventListener('input', syncDetailsCTA);

  themeInput.addEventListener('input', function(){
    if (themeInput.value.length > 0 && ghost.enabled) ghostStop();
    AXKAN.state.theme = themeInput.value.trim();
    if (AXKAN.persistState) AXKAN.persistState();
  });

  themeInput.addEventListener('keydown', function(e){
    if (e.key === 'Tab' && ghost.enabled && !e.shiftKey) {
      // Accept current ghost text
      const accepted = GHOST_PROMPTS[ghost.idx].slice(0, ghost.charIdx);
      if (accepted.length > 0) {
        e.preventDefault();
        themeInput.value = accepted;
        AXKAN.state.theme = accepted;
        ghostStop();
      }
    }
  });

  function enterDetails(){
    syncDetailsCTA();
    // Restore visible values
    destInput.value = AXKAN.state.destination || '';
    themeInput.value = AXKAN.state.theme || '';
    setTimeout(() => destInput.focus(), 60);
    if (!themeInput.value) ghostStart();
  }

  // -------------------- Screen 5: upload --------------------
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const thumbRow = document.getElementById('thumb-row');

  function addFiles(fileList){
    const incoming = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    incoming.forEach(f => AXKAN.state.files.push(f));
    renderThumbs();
    AXKAN.enableCTA(AXKAN.state.files.length >= 1);
  }

  function renderThumbs(){
    thumbRow.innerHTML = '';
    AXKAN.state.files.forEach((file, i) => {
      const t = document.createElement('div');
      t.className = 'thumb';
      const img = document.createElement('img');
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.readAsDataURL(file);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'rm';
      rm.setAttribute('aria-label','Eliminar imagen');
      rm.textContent = '×';
      rm.addEventListener('click', (ev) => {
        ev.stopPropagation();
        AXKAN.state.files.splice(i, 1);
        renderThumbs();
        AXKAN.enableCTA(AXKAN.state.files.length >= 1);
      });
      t.appendChild(img);
      t.appendChild(rm);
      thumbRow.appendChild(t);
    });
  }

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length) addFiles(e.target.files);
    fileInput.value = '';
  });
  ['dragenter','dragover'].forEach(ev => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      dropZone.classList.add('drag-over');
    });
  });
  ['dragleave','drop'].forEach(ev => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      dropZone.classList.remove('drag-over');
    });
  });
  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) addFiles(dt.files);
  });
  // Prevent browser from opening dropped file outside the zone
  window.addEventListener('dragover', (e) => { if (current === 5) e.preventDefault(); });
  window.addEventListener('drop',     (e) => { if (current === 5) e.preventDefault(); });

  // Cmd+V / Ctrl+V paste support — accepts images from clipboard anywhere on screen 5
  window.addEventListener('paste', (e) => {
    if (current !== 5) return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    const pasted = [];
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f && f.type.startsWith('image/')) pasted.push(f);
      }
    }
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
      dropZone.classList.add('drag-over');
      setTimeout(() => dropZone.classList.remove('drag-over'), 180);
    }
  });

  function enterUpload(){
    renderThumbs();
    AXKAN.enableCTA(AXKAN.state.files.length >= 1);
  }

  // -------------------- Screen 6: prompts --------------------
  const promptList = document.getElementById('prompt-list');

  function defaultPrompts(){
    return [
      { title: 'Video 1', text: 'Cinematic drone shot of a golden-hour beach in Tulum, turquoise water, palm shadows stretching long across white sand, slow dolly in.' },
      { title: 'Video 2', text: 'Close-up macro of handcrafted Mexican textile, warm tungsten light, shallow depth of field, fibers catching sunlight, subtle handheld movement.' },
      { title: 'Video 3', text: 'Bustling mercado in Mérida at dusk, vibrant fabrics and produce, handheld POV walking through, soft bokeh of market lights at golden-blue hour.' }
    ];
  }

  function renderPrompts(){
    promptList.innerHTML = '';
    AXKAN.state.prompts.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'prompt-card';
      card.tabIndex = 0;

      const title = document.createElement('div');
      title.className = 'p-title';
      title.textContent = p.title;

      const text = document.createElement('div');
      text.className = 'p-text';
      text.textContent = p.text;

      card.appendChild(title);
      card.appendChild(text);

      function enterEdit(){
        if (card.classList.contains('editing')) return;
        card.classList.add('editing');
        const ta = document.createElement('textarea');
        ta.value = p.text;
        ta.rows = Math.max(3, Math.ceil(p.text.length / 70));
        card.replaceChild(ta, text);
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);

        function save(){
          p.text = ta.value.trim();
          text.textContent = p.text;
          if (ta.parentNode === card) card.replaceChild(text, ta);
          card.classList.remove('editing');
          if (AXKAN.persistState) AXKAN.persistState();
        }
        ta.addEventListener('blur', save);
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            ta.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            ta.value = p.text;
            ta.blur();
          }
        });
      }

      card.addEventListener('click', enterEdit);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); enterEdit(); }
      });

      promptList.appendChild(card);
    });
  }

  AXKAN.setPrompts = function(list){
    if (Array.isArray(list)) {
      AXKAN.state.prompts = list.slice();
      if (current === 6) renderPrompts();
    }
  };

  function enterPrompts(){
    if (!AXKAN.state.prompts || AXKAN.state.prompts.length === 0) {
      AXKAN.state.prompts = defaultPrompts();
    }
    renderPrompts();
    AXKAN.enableCTA(true);
  }

  // -------------------- Screen 7: done --------------------
  const progressList = document.getElementById('progress-list');
  const btnEnvato = document.getElementById('btn-envato');
  const btnNew = document.getElementById('btn-new');

  function renderProgress(){
    progressList.innerHTML = '';
    const isVid = AXKAN.state.contentType === 'video';
    const prompts = AXKAN.state.prompts || [];
    const n = Math.max(1, prompts.length);
    const icon = isVid ? '🎬' : '📸';
    const noun = isVid ? 'Video'   : 'Imagen';
    const eta  = isVid ? '~30-60s' : '~20s';
    for (let i = 0; i < n; i++) {
      const p = prompts[i] || {};
      const row = document.createElement('div');
      row.className = 'progress-item';
      const dot = document.createElement('span');
      dot.className = 'dot';
      const txt = document.createElement('span');
      const label = p.slide_name ? (noun + ' — ' + p.slide_name) : (noun + ' ' + (i + 1));
      txt.textContent = icon + ' ' + label + ' · generando en Envato… ' + eta;
      row.appendChild(dot);
      row.appendChild(txt);
      progressList.appendChild(row);
    }
  }

  btnEnvato.addEventListener('click', function(){
    const isVid = AXKAN.state.contentType === 'video';
    const url = isVid ? 'https://app.envato.com/video-gen' : 'https://app.envato.com/image-gen';
    window.open(url, '_blank', 'noopener');
  });

  btnNew.addEventListener('click', function(){
    // Reset state
    AXKAN.state = {
      contentType: null,
      subType: null,
      destination: '',
      theme: '',
      files: [],
      prompts: []
    };
    // Reset visible form fields
    if (destInput) destInput.value = '';
    if (themeInput) themeInput.value = '';
    allTypeCards().forEach(c => {
      c.classList.remove('selected');
      c.setAttribute('aria-checked','false');
    });
    allSubCards().forEach(c => {
      c.classList.remove('selected');
      c.setAttribute('aria-checked','false');
    });
    thumbRow.innerHTML = '';
    promptList.innerHTML = '';
    showScreen(2);
  });

  function enterDone(){
    AXKAN.showAtras(false);
    AXKAN.enableCTA(false);
    renderProgress();
  }

  // -------------------- Stepper navigation --------------------
  const STEP_TO_SCREEN = { tipo: 2, detalles: 4, imagenes: 5, prompts: 6, enviar: 7 };

  window.addEventListener('axkan:navigate', (e) => {
    const step = e.detail && e.detail.step;
    let target = STEP_TO_SCREEN[step];
    if (!target) return;

    const noFiles = !AXKAN.state.files || AXKAN.state.files.length === 0;
    if (target >= 5 && noFiles) target = 5;
    if (target >= 3 && !AXKAN.state.contentType) target = 2;
    if (target === 6 && (!AXKAN.state.prompts || AXKAN.state.prompts.length === 0)) target = 5;
    if (target === 7) target = 6;

    showScreen(target);
  });

  // -------------------- Initial state --------------------
  // Kick off the first screen's onEnter logic once the shell is ready.
  // We defer one tick so the shell agent's AXKAN methods (and the backend
  // script's restoreState()) have run. Then we jump to the saved screen
  // if there is one — clamped to a safe screen if required inputs are
  // missing (File objects can't be serialized, so landing on screen 5+
  // without files would be broken).
  setTimeout(() => {
    const saved = AXKAN.state && AXKAN.state.currentScreen;
    let target = (typeof saved === 'number' && saved >= 1 && saved <= 7) ? saved : 2;

    // Guard: can't restore past screen 5 without files (they aren't serializable).
    const noFiles = !AXKAN.state.files || AXKAN.state.files.length === 0;
    if (target >= 5 && noFiles) target = 5;

    // Guard: can't land on sub-type screen if contentType isn't video.
    if (target === 3 && AXKAN.state.contentType !== 'video') target = 2;

    // Guard: can't land on details/later without a contentType.
    if (target >= 3 && !AXKAN.state.contentType) target = 2;

    // Guard: can't land on prompts (6) without prompts array or files.
    if (target === 6 && (!AXKAN.state.prompts || AXKAN.state.prompts.length === 0)) target = 5;

    if (target === 2) onEnter(2);
    else showScreen(target);
  }, 0);

})();



//  ======== SCRIPT {} ========


(function () {
  "use strict";

  // ---------- Element refs ----------
  const paletteEl    = document.getElementById("palette");
  const paletteInput = document.getElementById("palette-input");
  const paletteOpen  = document.getElementById("palette-open");
  const paletteClose = document.getElementById("palette-close");
  const stepperEl    = document.getElementById("stepper");
  const stepEls      = Array.from(stepperEl.querySelectorAll(".step"));
  const crumbEl      = document.getElementById("topbar-crumb");
  const btnContinuar = document.getElementById("btn-continuar");
  const btnAtras     = document.getElementById("btn-atras");
  const sessionTimeEl = document.getElementById("session-time");

  // ---------- Canonical step order ----------
  const STEPS = ["tipo", "detalles", "imagenes", "prompts", "enviar"];
  const STEP_LABELS = {
    tipo: "Tipo", detalles: "Detalles", imagenes: "Imágenes",
    prompts: "Prompts", enviar: "Enviar"
  };

  // ---------- Internal state ----------
  const state = {
    current: "tipo",
    reached: new Set(["tipo"]),
    continuarCb: null,
    atrasCb: null,
  };

  // ---------- Session time in sidebar ----------
  function fmtTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
           " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  sessionTimeEl.textContent = fmtTime();
  setInterval(() => { sessionTimeEl.textContent = fmtTime(); }, 60 * 1000);

  // ---------- Stepper rendering ----------
  function renderStepper() {
    stepEls.forEach((btn) => {
      const step = btn.dataset.step;
      btn.classList.remove("is-active", "is-done", "is-reachable");
      btn.removeAttribute("aria-current");

      const isCurrent = step === state.current;
      const currentIdx = STEPS.indexOf(state.current);
      const myIdx = STEPS.indexOf(step);
      const reached = state.reached.has(step);

      if (isCurrent) {
        btn.classList.add("is-active");
        btn.setAttribute("aria-current", "step");
      } else if (reached && myIdx < currentIdx) {
        btn.classList.add("is-done");
      } else if (reached) {
        btn.classList.add("is-reachable");
      }
    });
    crumbEl.textContent = STEP_LABELS[state.current] || "—";
  }

  // ---------- Emit navigation event ----------
  function emitNavigate(step) {
    window.dispatchEvent(new CustomEvent("axkan:navigate", {
      detail: { step }
    }));
  }

  // Clicking a step (only if reached)
  stepperEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".step");
    if (!btn) return;
    const step = btn.dataset.step;
    if (!state.reached.has(step)) return;
    if (step === state.current) return;
    emitNavigate(step);
  });

  // ---------- Command palette ----------
  function openPalette() {
    if (paletteEl.open) return;
    if (typeof paletteEl.showModal === "function") {
      paletteEl.showModal();
    } else {
      paletteEl.setAttribute("open", "");
    }
    paletteInput.value = "";
    requestAnimationFrame(() => paletteInput.focus());
  }
  function closePalette() {
    if (!paletteEl.open) return;
    paletteEl.close();
  }
  function togglePalette() { paletteEl.open ? closePalette() : openPalette(); }

  paletteOpen.addEventListener("click", openPalette);
  paletteClose.addEventListener("click", closePalette);
  paletteEl.addEventListener("click", (e) => {
    // Click outside inner content (on backdrop area) → close
    const rect = paletteEl.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top  && e.clientY <= rect.bottom;
    if (!inside) closePalette();
  });

  // Palette command dispatch
  paletteEl.addEventListener("click", (e) => {
    const item = e.target.closest(".palette__item");
    if (!item) return;
    const cmd = item.dataset.cmd || "";
    if (cmd.startsWith("go:")) {
      const step = cmd.slice(3);
      if (state.reached.has(step)) {
        emitNavigate(step);
        closePalette();
      }
    } else if (cmd === "continue") {
      closePalette();
      if (!btnContinuar.disabled && state.continuarCb) state.continuarCb();
    } else if (cmd === "new-session") {
      closePalette();
      window.dispatchEvent(new CustomEvent("axkan:new-session"));
    } else if (cmd === "help") {
      closePalette();
      window.dispatchEvent(new CustomEvent("axkan:help"));
    }
  });

  // Filter palette items as you type
  paletteInput.addEventListener("input", () => {
    const q = paletteInput.value.trim().toLowerCase();
    paletteEl.querySelectorAll(".palette__item").forEach((item) => {
      const label = item.querySelector(".palette__item-label").textContent.toLowerCase();
      const match = !q || label.includes(q);
      item.parentElement.style.display = match ? "" : "none";
    });
  });

  // ---------- Global keyboard ----------
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;

    // ⌘K — toggle palette
    if (mod && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      togglePalette();
      return;
    }
    // Esc — close palette (native dialog also handles, but explicit for safety)
    if (e.key === "Escape" && paletteEl.open) {
      e.preventDefault();
      closePalette();
      return;
    }
    // ⌘↵ — advance when CTA enabled
    if (mod && e.key === "Enter" && !btnContinuar.disabled) {
      // Only if not inside a textarea that should accept the keystroke
      const t = e.target;
      const isTextarea = t && t.tagName === "TEXTAREA";
      if (!isTextarea) {
        e.preventDefault();
        if (state.continuarCb) state.continuarCb();
      }
    }
  });

  // ---------- Action bar buttons ----------
  btnContinuar.addEventListener("click", () => {
    if (btnContinuar.disabled) return;
    if (state.continuarCb) state.continuarCb();
  });
  btnAtras.addEventListener("click", () => {
    if (state.atrasCb) state.atrasCb();
  });

  // ---------- Public API ----------
  // NB: merge (Object.assign) instead of replace, so the screens-agent's
  // state + helpers installed before DOMContentLoaded survive. Otherwise
  // window.AXKAN.state is wiped out and clicks can't record contentType.
  Object.assign(window.AXKAN = window.AXKAN || {}, {
    /**
     * Set the active step. Also marks all prior steps as reached.
     * @param {string} step — one of "tipo", "detalles", "imagenes", "prompts", "enviar"
     */
    setStep(step) {
      if (!STEPS.includes(step)) {
        console.warn("[AXKAN] unknown step:", step);
        return;
      }
      const idx = STEPS.indexOf(step);
      for (let i = 0; i <= idx; i++) state.reached.add(STEPS[i]);
      state.current = step;
      renderStepper();
    },

    /** Current active step id. */
    getStep() { return state.current; },

    /** Enable / disable the primary CTA. Plays a rosa-pulse "unlock" animation
     *  on the disabled→enabled transition so the user sees it become interactive. */
    enableCTA(enabled) {
      const wasDisabled = btnContinuar.disabled;
      btnContinuar.disabled = !enabled;
      btnContinuar.classList.toggle("is-disabled", !enabled);
      if (enabled && wasDisabled) {
        btnContinuar.classList.remove("just-unlocked");
        // Force reflow so the animation re-triggers
        // eslint-disable-next-line no-unused-expressions
        btnContinuar.offsetWidth;
        btnContinuar.classList.add("just-unlocked");
      }
    },

    /** Set the CTA label text (keeps the arrow and shortcut hint). */
    setCTALabel(text) {
      const span = btnContinuar.querySelector("span:first-child");
      if (span) span.textContent = text;
    },

    /** Show or hide the "Atrás" ghost button. */
    showAtras(show) {
      btnAtras.hidden = !show;
    },

    /** Register the Continuar callback. */
    onContinuar(cb) { state.continuarCb = typeof cb === "function" ? cb : null; },

    /** Register the Atrás callback. */
    onAtras(cb)     { state.atrasCb     = typeof cb === "function" ? cb : null; },

    /** Programmatically open the palette. */
    openPalette,

    /** Programmatically close the palette. */
    closePalette,

    /** Set the session name shown in the sidebar meta card. */
    setSessionName(name) {
      const el = document.getElementById("session-name");
      if (el && typeof name === "string") el.textContent = name;
    },

    /** Canonical step order (read-only copy). */
    STEPS: STEPS.slice(),
  });

  // Pick up any callbacks the screens/backend scripts registered BEFORE this
  // shell IIFE ran (they registered into the queue-based shims above).
  if (typeof window.AXKAN.__pendingContinuar === "function") {
    state.continuarCb = window.AXKAN.__pendingContinuar;
  }
  if (typeof window.AXKAN.__pendingAtras === "function") {
    state.atrasCb = window.AXKAN.__pendingAtras;
  }

  // ---------- Initial render ----------
  renderStepper();
})();


//  ======== SCRIPT {} ========


/* ============================================================
   AXKAN Content Studio — Backend Wiring Layer + Command Palette
   ============================================================
   Pure glue code. No markup, no CSS. Assumes window.AXKAN,
   its state object, and shell helpers already exist.
   ============================================================ */
(function () {
  'use strict';

  // ---------- safety: bootstrap namespace if shell hasn't yet ----------
  window.AXKAN = window.AXKAN || {};
  const A = window.AXKAN;
  A.state = A.state || {
    contentType: null,
    subType: null,
    destination: null,
    theme: null,
    files: [],
    filePaths: [],
    prompts: [],
    sessionId: null,
    currentScreen: 1,
  };

  const API_BASE = (window.location && window.location.origin) || 'http://localhost:8080';

  // ============================================================
  // 1. API HELPER
  // ============================================================
  async function _json(res) {
    let body = null;
    try { body = await res.json(); } catch (e) { /* non-json */ }
    if (!res.ok) {
      const msg = (body && (body.error || body.message)) || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    if (body && body.success === false) {
      throw new Error(body.error || 'Request failed');
    }
    return body;
  }

  A.api = {
    async uploadImages(files) {
      if (!files || !files.length) throw new Error('No hay archivos para subir');
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const res = await fetch(API_BASE + '/api/images/upload', {
        method: 'POST',
        body: fd,
      });
      return _json(res);
    },

    async generatePrompts(payload) {
      const res = await fetch(API_BASE + '/api/prompts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return _json(res);
    },

    async generateVideoPrompts(payload) {
      const res = await fetch(API_BASE + '/api/video-prompts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return _json(res);
    },

    async sendToEnvato(payload, bulk) {
      // bulk => /api/envato/send-all-video
      // image (static) => /api/envato/send
      // default video => /api/envato/send-video
      let endpoint = '/api/envato/send-video';
      if (bulk === true) endpoint = '/api/envato/send-all-video';
      else if (bulk === 'image') endpoint = '/api/envato/send';
      const res = await fetch(API_BASE + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return _json(res);
    },

    async abort() {
      const res = await fetch(API_BASE + '/api/abort', { method: 'POST' });
      return _json(res).catch(() => ({ success: true }));
    },
  };

  // ============================================================
  // 4. TOAST / BANNER
  // ============================================================
  function ensureToastHost() {
    let host = document.getElementById('axkan-toast-host');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'axkan-toast-host';
    Object.assign(host.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '99999',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'none',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    });
    document.body.appendChild(host);
    return host;
  }

  const TOAST_COLORS = {
    info:    { bg: '#2AB7B7', fg: '#0C1016' }, // turquesa
    success: { bg: '#34C759', fg: '#0C1016' }, // verde
    error:   { bg: '#FF3B8A', fg: '#FFFFFF' }, // rosa
    warn:    { bg: '#F0A800', fg: '#0C1016' },
  };

  function showToast(message, type) {
    type = type || 'info';
    const host = ensureToastHost();
    const t = document.createElement('div');
    const c = TOAST_COLORS[type] || TOAST_COLORS.info;
    Object.assign(t.style, {
      background: c.bg,
      color: c.fg,
      padding: '12px 16px',
      borderRadius: '12px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)',
      fontSize: '13px',
      fontWeight: '500',
      letterSpacing: '0.01em',
      minWidth: '240px',
      maxWidth: '360px',
      pointerEvents: 'auto',
      transform: 'translateX(420px)',
      opacity: '0',
      transition: 'transform .28s cubic-bezier(.2,.9,.25,1), opacity .28s ease',
    });
    t.textContent = message;
    host.appendChild(t);
    // animate in
    requestAnimationFrame(() => {
      t.style.transform = 'translateX(0)';
      t.style.opacity = '1';
    });
    const remove = () => {
      t.style.transform = 'translateX(420px)';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 300);
    };
    setTimeout(remove, 4000);
    t.addEventListener('click', remove);
    return t;
  }
  A.showToast = showToast;

  // inline red error banner (lives at top of main)
  function showErrorBanner(message) {
    clearErrorBanner();
    const main = document.querySelector('main') || document.getElementById('main') || document.body;
    const b = document.createElement('div');
    b.id = 'axkan-error-banner';
    Object.assign(b.style, {
      background: 'linear-gradient(90deg, rgba(255,59,138,0.15), rgba(255,59,138,0.05))',
      border: '1px solid rgba(255,59,138,0.5)',
      color: '#FF3B8A',
      padding: '12px 16px',
      borderRadius: '10px',
      margin: '12px 16px',
      fontSize: '13px',
      fontWeight: '500',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
    });
    b.innerHTML = '<span>⚠ ' + escapeHtml(message) + '</span>';
    const close = document.createElement('button');
    close.textContent = '✕';
    Object.assign(close.style, {
      background: 'transparent', border: 'none', color: '#FF3B8A',
      cursor: 'pointer', fontSize: '14px', marginLeft: '12px',
    });
    close.addEventListener('click', clearErrorBanner);
    b.appendChild(close);
    main.insertBefore(b, main.firstChild);
  }
  function clearErrorBanner() {
    const ex = document.getElementById('axkan-error-banner');
    if (ex) ex.remove();
  }
  A.showErrorBanner = showErrorBanner;
  A.clearErrorBanner = clearErrorBanner;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ============================================================
  // 3. LOADING STATES
  // ============================================================
  function showLoading(message) {
    hideLoading();
    const main = document.querySelector('main') || document.getElementById('main') || document.body;
    const overlay = document.createElement('div');
    overlay.id = 'axkan-loading-overlay';
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '20px',
      background: 'rgba(12,16,22,0.75)',
      backdropFilter: 'blur(6px)',
      webkitBackdropFilter: 'blur(6px)',
      zIndex: '1000',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#EDEFF3',
    });

    const spinner = document.createElement('div');
    Object.assign(spinner.style, {
      width: '44px',
      height: '44px',
      borderRadius: '50%',
      border: '3px solid rgba(255,255,255,0.1)',
      borderTopColor: '#2AB7B7',
      animation: 'axkan-spin 0.9s linear infinite',
    });

    // ensure keyframes exist
    if (!document.getElementById('axkan-spin-kf')) {
      const s = document.createElement('style');
      s.id = 'axkan-spin-kf';
      s.textContent = '@keyframes axkan-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }

    const label = document.createElement('div');
    Object.assign(label.style, {
      fontSize: '13px',
      color: 'rgba(237,239,243,0.75)',
      letterSpacing: '0.01em',
      textAlign: 'center',
      maxWidth: '340px',
    });
    label.textContent = message || 'Cargando…';

    overlay.appendChild(spinner);
    overlay.appendChild(label);

    // need relative parent
    const cs = getComputedStyle(main);
    if (cs.position === 'static') main.style.position = 'relative';
    main.appendChild(overlay);

    if (A.enableCTA) A.enableCTA(false);
  }
  function hideLoading() {
    const ex = document.getElementById('axkan-loading-overlay');
    if (ex) ex.remove();
    if (A.enableCTA) A.enableCTA(true);
  }
  A.showLoading = showLoading;
  A.hideLoading = hideLoading;

  // ============================================================
  // 2. FLOW ORCHESTRATION
  // ============================================================
  function mapContentTypeForBackend() {
    const ct = (A.state.contentType || '').toString().toLowerCase();
    const st = (A.state.subType || '').toString().toLowerCase();
    if (ct === 'imagen' || ct === 'imagengen' || ct === 'image') {
      return { content_type: 'carousel', is_video: false };
    }
    if (ct === 'pitch') {
      return { content_type: 'pitch', is_video: false };
    }
    if (ct === 'video') {
      if (st.includes('carousel') || st.includes('loop')) {
        return { content_type: 'living', is_video: true };
      }
      if (st.includes('personaje') || st.includes('character') || st.includes('hablando')) {
        return { content_type: 'character', is_video: true };
      }
      return { content_type: 'living', is_video: true };
    }
    return { content_type: 'carousel', is_video: false };
  }

  function isVideoFlow() {
    return (A.state.contentType || '').toString().toLowerCase() === 'video';
  }
  function isCarouselLoop() {
    const st = (A.state.subType || '').toString().toLowerCase();
    return isVideoFlow() && (st.includes('carousel') || st.includes('loop'));
  }

  async function handleScreen5To6() {
    clearErrorBanner();
    const files = (A.getUploadedFiles && A.getUploadedFiles()) || A.state.files || [];
    if (!files || files.length === 0) {
      showErrorBanner('Selecciona al menos una imagen antes de continuar.');
      return;
    }

    try {
      // --- upload
      const up = showToast('Subiendo imágenes…', 'info');
      showLoading('Subiendo ' + files.length + ' imagen' + (files.length === 1 ? '' : 'es') + '…');
      const uploadRes = await A.api.uploadImages(files);
      A.state.sessionId = uploadRes.session_id;
      A.state.filePaths = (uploadRes.files || []).map(f => f.path);
      A.state.uploadedFiles = uploadRes.files || [];
      persistState();

      // --- generate prompts
      showLoading('Claude está escribiendo tus prompts… ~22s');
      const map = mapContentTypeForBackend();
      let promptsRes;

      if (isVideoFlow() && isCarouselLoop()) {
        // Carousel Loop: first we need base prompts (living), then per-clip video prompts
        const base = await A.api.generatePrompts({
          destination: A.state.destination,
          slides: files.length,
          product_type: A.state.productType || null,
          content_type: map.content_type,
          theme: A.state.theme,
          session_id: A.state.sessionId,
        });
        A.state.basePrompts = base.prompts || [];
        showLoading('Generando prompts de video por clip…');
        promptsRes = await A.api.generateVideoPrompts({
          session_id: A.state.sessionId,
          destination: A.state.destination,
          content_type: map.content_type,
          theme: A.state.theme,
          video_clip_count: files.length,
          original_prompts: base.prompts || [],
        });
      } else if (isVideoFlow()) {
        // Personaje Hablando — normal prompt generate with is_video flag
        promptsRes = await A.api.generatePrompts({
          destination: A.state.destination,
          slides: files.length,
          product_type: A.state.productType || null,
          content_type: map.content_type,
          theme: A.state.theme,
          session_id: A.state.sessionId,
          is_video: true,
        });
      } else {
        promptsRes = await A.api.generatePrompts({
          destination: A.state.destination,
          slides: files.length,
          product_type: A.state.productType || null,
          content_type: map.content_type,
          theme: A.state.theme,
          session_id: A.state.sessionId,
        });
      }

      A.state.prompts = promptsRes.prompts || [];
      persistState();

      renderPromptCards(A.state.prompts);

      hideLoading();
      showToast('Prompts listos (' + A.state.prompts.length + ')', 'success');
      if (A.showScreen) A.showScreen(6);
      if (A.setStep) A.setStep('prompts');
      A.state.currentScreen = 6;
    } catch (err) {
      hideLoading();
      console.error('[AXKAN] 5→6 failed', err);
      showErrorBanner('No se pudo procesar: ' + (err && err.message ? err.message : 'error desconocido'));
      showToast('Error al generar prompts', 'error');
    }
  }

  function renderPromptCards(prompts) {
    const list = document.getElementById('prompts-list');
    if (!list) return;
    list.innerHTML = '';
    prompts.forEach((p, i) => {
      const card = document.createElement('article');
      card.className = 'prompt-card';
      card.dataset.index = String(i);
      card.innerHTML =
        '<header class="prompt-card__head">' +
          '<span class="prompt-card__num">' + (p.slide_number || (i + 1)) + '</span>' +
          '<h3 class="prompt-card__title">' + escapeHtml(p.slide_name || ('Slide ' + (i + 1))) + '</h3>' +
          '<span class="prompt-card__eta">~' + escapeHtml(p.estimated_time || '8s') + '</span>' +
        '</header>' +
        '<div class="prompt-card__body">' +
          '<label class="prompt-card__label">Prompt</label>' +
          '<textarea class="prompt-card__prompt" data-field="prompt_text" rows="4">' + escapeHtml(p.prompt_text || '') + '</textarea>' +
          (p.speech != null ?
            '<label class="prompt-card__label">Speech</label>' +
            '<textarea class="prompt-card__speech" data-field="speech" rows="2">' + escapeHtml(p.speech || '') + '</textarea>'
            : '') +
        '</div>';

      // wire edits back into state
      card.querySelectorAll('textarea').forEach(ta => {
        ta.addEventListener('input', e => {
          const field = e.target.dataset.field;
          if (A.state.prompts[i]) {
            A.state.prompts[i][field] = e.target.value;
            persistState();
          }
        });
      });
      list.appendChild(card);
    });
  }
  A.renderPromptCards = renderPromptCards;

  async function handleScreen6To7() {
    clearErrorBanner();
    const prompts = A.state.prompts || [];
    if (!prompts.length) {
      showErrorBanner('No hay prompts para enviar.');
      return;
    }

    // seed status list
    renderStatusList(prompts);
    if (A.showScreen) A.showScreen(7);
    if (A.setStep) A.setStep('enviar');
    A.state.currentScreen = 7;

    const paths = A.state.filePaths || [];
    const loop = isCarouselLoop();
    const isImage = !isVideoFlow();

    try {
      showToast('Enviando a Envato…', 'info');

      if (isImage) {
        // ImageGen flow — /api/envato/send per prompt (static)
        for (let i = 0; i < prompts.length; i++) {
          const p = prompts[i];
          updateStatus(i, '🎨 Imagen ' + (i + 1) + ' · enviando…');
          await A.api.sendToEnvato({
            prompt: p.prompt_text,
            aspectRatio: A.state.aspectRatio || '9:16',
            referenceImages: paths,
          }, 'image');
          updateStatus(i, '🎨 Imagen ' + (i + 1) + ' · generando…');
        }
      } else if (prompts.length > 1) {
        // bulk video
        for (let i = 0; i < prompts.length; i++) {
          updateStatus(i, '🎬 Video ' + (i + 1) + ' · en cola…');
        }
        await A.api.sendToEnvato({
          prompts: prompts.map(p => p.prompt_text),
          speeches: prompts.map(p => p.speech || ''),
          imagePaths: paths,
          loop: loop,
        }, true);
        for (let i = 0; i < prompts.length; i++) {
          updateStatus(i, '🎬 Video ' + (i + 1) + ' · generando…');
        }
      } else {
        // single
        updateStatus(0, '🎬 Video 1 · enviando…');
        await A.api.sendToEnvato({
          prompt: prompts[0].prompt_text,
          speech: prompts[0].speech || '',
          imagePath: paths[0],
          loop: loop,
        }, false);
        updateStatus(0, '🎬 Video 1 · generando…');
      }

      showToast('Enviado a Envato correctamente', 'success');
    } catch (err) {
      console.error('[AXKAN] 6→7 failed', err);
      showToast('Error al enviar: ' + (err.message || 'desconocido'), 'error');
      showErrorBanner('Falló el envío a Envato: ' + (err.message || 'error desconocido'));
    }
  }

  function renderStatusList(prompts) {
    const list = document.getElementById('status-list');
    if (!list) return;
    list.innerHTML = '';
    prompts.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'status-item';
      li.dataset.index = String(i);
      const label = isVideoFlow()
        ? '🎬 Video ' + (i + 1) + ' · preparando…'
        : '🎨 Imagen ' + (i + 1) + ' · preparando…';
      li.textContent = label;
      list.appendChild(li);
    });
  }
  function updateStatus(i, text) {
    const list = document.getElementById('status-list');
    if (!list) return;
    const item = list.querySelector('[data-index="' + i + '"]');
    if (item) item.textContent = text;
  }
  A.updateStatus = updateStatus;

  // ---------- master continuar dispatcher ----------
  async function handleContinuar() {
    const s = A.state.currentScreen || 1;
    switch (s) {
      case 1:
        if (A.showScreen) A.showScreen(2);
        if (A.setStep) A.setStep('tipo');
        A.state.currentScreen = 2;
        break;
      case 2:
        if (isVideoFlow()) {
          if (A.showScreen) A.showScreen(3);
          A.state.currentScreen = 3;
        } else {
          if (A.showScreen) A.showScreen(4);
          if (A.setStep) A.setStep('detalles');
          A.state.currentScreen = 4;
        }
        break;
      case 3:
        if (A.showScreen) A.showScreen(4);
        if (A.setStep) A.setStep('detalles');
        A.state.currentScreen = 4;
        break;
      case 4:
        if (A.showScreen) A.showScreen(5);
        if (A.setStep) A.setStep('imagenes');
        A.state.currentScreen = 5;
        break;
      case 5:
        await handleScreen5To6();
        break;
      case 6:
        await handleScreen6To7();
        break;
      case 7:
        // terminal
        break;
    }
    persistState();
  }

  function handleAtras() {
    const s = A.state.currentScreen || 1;
    let target = Math.max(1, s - 1);
    // skip subtype screen if not video going backward
    if (s === 4 && !isVideoFlow()) target = 2;
    if (A.showScreen) A.showScreen(target);
    A.state.currentScreen = target;
    const stepMap = { 1: 'tipo', 2: 'tipo', 3: 'tipo', 4: 'detalles', 5: 'imagenes', 6: 'prompts', 7: 'enviar' };
    if (A.setStep) A.setStep(stepMap[target]);
    persistState();
  }

  // NOTE: Disabled — the screens agent already installed the authoritative
  // flow handler via A.onContinuar. Re-registering here would overwrite it
  // (only the last cb passed to onContinuar wins). Backend work (upload,
  // prompt gen, send) will be invoked by the screens handler through A.api.*
  // when we wire that up in a later pass.
  // if (A.onContinuar) A.onContinuar(handleContinuar);
  // if (A.onAtras) A.onAtras(handleAtras);
  A.handleContinuar = handleContinuar;
  A.handleAtras = handleAtras;

  // ============================================================
  // 7. SESSION PERSISTENCE
  // ============================================================
  const LS_KEY = 'axkan.studio.state.v1';
  function persistState() {
    try {
      // don't serialize File objects
      const clone = Object.assign({}, A.state);
      delete clone.files;
      localStorage.setItem(LS_KEY, JSON.stringify(clone));
    } catch (e) { /* ignore quota */ }
  }
  function restoreState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      Object.assign(A.state, saved);
    } catch (e) { /* ignore */ }
  }
  A.persistState = persistState;
  A.restoreState = restoreState;
  restoreState();

  // watch for state mutations (best-effort via Proxy on a shim)
  // Lightweight: expose setState that persists
  A.setState = function (patch) {
    Object.assign(A.state, patch || {});
    persistState();
  };

  // ============================================================
  // 5. COMMAND PALETTE
  // ============================================================
  const COMMANDS = [
    {
      id: 'nuevo-proyecto',
      icon: '✨',
      label: 'Nuevo proyecto',
      desc: 'Reinicia todo y vuelve al inicio',
      shortcut: '⌘⇧N',
      run: () => {
        localStorage.removeItem(LS_KEY);
        A.state = {
          contentType: null, subType: null, destination: null, theme: null,
          files: [], filePaths: [], prompts: [], sessionId: null, currentScreen: 1,
        };
        if (A.showScreen) A.showScreen(1);
        if (A.setStep) A.setStep('tipo');
        showToast('Proyecto nuevo', 'success');
      },
    },
    {
      id: 'goto-tipo', icon: '🎯', label: 'Ir a Tipo', desc: 'Paso 1 — tipo de contenido', shortcut: '⌘1',
      run: () => { if (A.showScreen) A.showScreen(2); if (A.setStep) A.setStep('tipo'); A.state.currentScreen = 2; },
    },
    {
      id: 'goto-detalles', icon: '⚙️', label: 'Ir a Detalles', desc: 'Paso 2 — destino y tema', shortcut: '⌘2',
      run: () => {
        if (!A.state.contentType) { showToast('Primero elige un tipo', 'warn'); return; }
        if (A.showScreen) A.showScreen(4); if (A.setStep) A.setStep('detalles'); A.state.currentScreen = 4;
      },
    },
    {
      id: 'goto-imagenes', icon: '🖼️', label: 'Ir a Imágenes', desc: 'Paso 3 — subir imágenes', shortcut: '⌘3',
      run: () => {
        if (!A.state.destination) { showToast('Completa los detalles primero', 'warn'); return; }
        if (A.showScreen) A.showScreen(5); if (A.setStep) A.setStep('imagenes'); A.state.currentScreen = 5;
      },
    },
    {
      id: 'goto-prompts', icon: '📝', label: 'Ir a Prompts', desc: 'Paso 4 — revisar prompts', shortcut: '⌘4',
      run: () => {
        if (!A.state.prompts || !A.state.prompts.length) { showToast('Aún no hay prompts generados', 'warn'); return; }
        if (A.showScreen) A.showScreen(6); if (A.setStep) A.setStep('prompts'); A.state.currentScreen = 6;
      },
    },
    {
      id: 'abort', icon: '⏹️', label: 'Abortar automatización', desc: 'Detiene cualquier envío a Envato en curso', shortcut: '⌘.',
      run: async () => {
        try { await A.api.abort(); showToast('Automatización abortada', 'success'); }
        catch (e) { showToast('Error al abortar: ' + e.message, 'error'); }
      },
    },
    {
      id: 'envato', icon: '🌐', label: 'Ver Envato (labs)', desc: 'Abre el panel de Envato Video Gen', shortcut: '',
      run: () => window.open('https://app.envato.com/video-gen', '_blank', 'noopener'),
    },
    {
      id: 'theme', icon: '🎨', label: 'Cambiar tema visual', desc: 'Alternar apariencia (próximamente)', shortcut: '',
      run: () => showToast('Cambio de tema próximamente', 'info'),
    },
  ];

  // palette state
  let paletteIndex = 0;
  let paletteFiltered = COMMANDS.slice();

  function paletteEls() {
    return {
      dlg: document.getElementById('palette'),
      input: document.getElementById('palette-search'),
      list: document.getElementById('palette-commands'),
    };
  }

  function renderPalette() {
    const { list } = paletteEls();
    if (!list) return;
    list.innerHTML = '';
    if (paletteFiltered.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'palette-empty';
      empty.style.cssText = 'padding:16px;color:rgba(237,239,243,0.5);font-size:13px;text-align:center;';
      empty.textContent = 'Sin resultados';
      list.appendChild(empty);
      return;
    }
    paletteFiltered.forEach((cmd, i) => {
      const li = document.createElement('li');
      li.className = 'palette-item' + (i === paletteIndex ? ' is-active' : '');
      li.dataset.id = cmd.id;
      li.style.cssText =
        'display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;cursor:pointer;' +
        'font-family:Inter,system-ui,sans-serif;font-size:13px;color:#EDEFF3;' +
        (i === paletteIndex ? 'background:rgba(42,183,183,0.15);outline:1px solid rgba(42,183,183,0.35);' : '');
      li.innerHTML =
        '<span style="font-size:18px;width:22px;text-align:center;">' + cmd.icon + '</span>' +
        '<span style="flex:1;">' +
          '<div style="font-weight:500;">' + escapeHtml(cmd.label) + '</div>' +
          '<div style="font-size:11px;color:rgba(237,239,243,0.5);margin-top:2px;">' + escapeHtml(cmd.desc) + '</div>' +
        '</span>' +
        (cmd.shortcut
          ? '<kbd style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.06);color:rgba(237,239,243,0.7);border:1px solid rgba(255,255,255,0.08);">' + escapeHtml(cmd.shortcut) + '</kbd>'
          : '');
      li.addEventListener('mouseenter', () => {
        paletteIndex = i; renderPalette();
      });
      li.addEventListener('click', () => runPaletteAt(i));
      list.appendChild(li);
    });
  }

  function filterPalette(q) {
    const needle = (q || '').toLowerCase().trim();
    if (!needle) { paletteFiltered = COMMANDS.slice(); }
    else {
      paletteFiltered = COMMANDS.filter(c =>
        c.label.toLowerCase().includes(needle) ||
        c.desc.toLowerCase().includes(needle) ||
        c.id.toLowerCase().includes(needle)
      );
    }
    paletteIndex = 0;
    renderPalette();
  }

  function runPaletteAt(i) {
    const cmd = paletteFiltered[i];
    if (!cmd) return;
    closePalette();
    try { cmd.run(); } catch (e) { showToast('Error: ' + e.message, 'error'); }
  }

  function openPalette() {
    const { dlg, input } = paletteEls();
    if (!dlg) return;
    paletteFiltered = COMMANDS.slice();
    paletteIndex = 0;
    if (input) input.value = '';
    renderPalette();
    if (typeof dlg.showModal === 'function' && !dlg.open) {
      try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
    } else {
      dlg.setAttribute('open', '');
    }
    setTimeout(() => { if (input) input.focus(); }, 10);
  }
  function closePalette() {
    const { dlg } = paletteEls();
    if (!dlg) return;
    if (dlg.open && typeof dlg.close === 'function') {
      try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); }
    } else {
      dlg.removeAttribute('open');
    }
  }
  function togglePalette() {
    const { dlg } = paletteEls();
    if (!dlg) return;
    if (dlg.open) closePalette(); else openPalette();
  }
  A.openPalette = openPalette;
  A.closePalette = closePalette;
  A.togglePalette = togglePalette;
  A.renderPalette = renderPalette;

  // wire palette search + key navigation once DOM ready
  function wirePalette() {
    const { dlg, input, list } = paletteEls();
    if (!dlg || !input || !list) return false;
    input.addEventListener('input', e => filterPalette(e.target.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        paletteIndex = Math.min(paletteFiltered.length - 1, paletteIndex + 1);
        renderPalette();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        paletteIndex = Math.max(0, paletteIndex - 1);
        renderPalette();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        runPaletteAt(paletteIndex);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
      }
    });
    dlg.addEventListener('close', () => { /* no-op */ });
    // seed list
    renderPalette();
    return true;
  }

  // ============================================================
  // 6. GLOBAL KEYBOARD SHORTCUTS
  // ============================================================
  // undo stack (optional, low-pri)
  const undoStack = [];
  let lastSnapshot = null;
  function snapshot() {
    try {
      const s = JSON.stringify({ ...A.state, files: undefined });
      if (s !== lastSnapshot) {
        undoStack.push(lastSnapshot);
        if (undoStack.length > 20) undoStack.shift();
        lastSnapshot = s;
      }
    } catch (e) {}
  }
  function undo() {
    const prev = undoStack.pop();
    if (!prev) { showToast('Nada que deshacer', 'info'); return; }
    try {
      Object.assign(A.state, JSON.parse(prev));
      persistState();
      if (A.showScreen && A.state.currentScreen) A.showScreen(A.state.currentScreen);
      showToast('Deshecho', 'info');
    } catch (e) {}
  }
  A.undo = undo;

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;

    // ⌘K toggles palette (shell may also wire this; idempotent)
    if (mod && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      togglePalette();
      return;
    }

    // Esc closes palette and any open <dialog>
    if (e.key === 'Escape') {
      const { dlg } = paletteEls();
      if (dlg && dlg.open) { e.preventDefault(); closePalette(); return; }
      // close any other open dialogs
      document.querySelectorAll('dialog[open]').forEach(d => {
        if (d.id !== 'palette') { try { d.close(); } catch (err) { d.removeAttribute('open'); } }
      });
      return;
    }

    // don't hijack while user is typing in the palette input or an editable field
    const tgt = e.target;
    const inField = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable);

    // ⌘↵ Continuar
    if (mod && e.key === 'Enter' && !inField) {
      e.preventDefault();
      handleContinuar();
      return;
    }
    // Also allow ⌘↵ inside palette = same as Enter (handled there)
    if (mod && e.key === 'Enter' && tgt && tgt.id === 'palette-search') {
      // palette handles its own Enter
      return;
    }

    // ⌘⌫ Atrás
    if (mod && (e.key === 'Backspace' || e.key === 'Delete') && !inField) {
      e.preventDefault();
      handleAtras();
      return;
    }

    // ⌘Z undo
    if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z') && !inField) {
      e.preventDefault();
      undo();
      return;
    }
  });

  // snapshot state before each continuar
  // Backend wrapper disabled (see note above). Undo/snapshot still
  // happens on state changes, just not via re-registering onContinuar.
  // const _origContinuar = handleContinuar;
  // const _wrappedContinuar = async function () {
  //   snapshot();
  //   return _origContinuar.apply(null, arguments);
  // };
  // if (A.onContinuar) A.onContinuar(_wrappedContinuar);
  // A.handleContinuar = _wrappedContinuar;

  // ============================================================
  // BOOT
  // ============================================================
  function boot() {
    ensureToastHost();
    if (!wirePalette()) {
      // retry once DOM mounts palette markup
      const obs = new MutationObserver(() => {
        if (wirePalette()) obs.disconnect();
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
    // initial persistence snapshot
    snapshot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // expose commands list for introspection/tests
  A._commands = COMMANDS;

  console.log('[AXKAN] backend wiring ready');
})();

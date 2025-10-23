/***********************
 * Perception Study (PNG images)
 * One image + four 1–7 sliders per trial
 * Two blocks (Male / Female) — block order randomized; trials randomized within blocks
 * Saves ONLY once at the very end (no streaming/partials)
 * Thank-You page has ONLY the CloudResearch link (no Finish button)
 ***********************/

/* ========= BASIC OPTIONS ========= */

const IMAGE_EXT = '.png';   // your files are PNG

// Slider tick labels (1..7 with endpoint text)
const tickRowHTML = `
  <div class="slider-ticks">
    <span>1<br><small>Not at all</small></span>
    <span>2</span><span>3</span><span>4</span><span>5</span><span>6</span>
    <span>7<br><small>Very</small></span>
  </div>`;

// Your four questions
const questionTexts = [
  "How attractive is this person?",
  "How tall is this person?",
  "How athletic is this person?",
  "How intelligent is this person?"
];

// Optional: paste your CloudResearch completion URL (unused in this flow)
const CLOUDRESEARCH_COMPLETION_URL = "";

/* ========= UTILITIES ========= */

// Safe UUID (works even if crypto.randomUUID is missing)
function safeUUID() {
  try { if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID(); }
  catch(_) {}
  return 'pid_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Read a URL parameter (e.g., ?pid=ABC123)
function getParam(name) {
  const m = new URLSearchParams(location.search).get(name);
  return m ? decodeURIComponent(m) : null;
}

// Build filenames from your scheme (TEMP: 1 face per sex while testing)
const NUM_FACES_PER_SEX = 1;
const HEIGHT_CODES = ['1','2','3'];    // 1=Tall, 2=Average, 3=Short
const ATTR_CODES   = ['', '.2', '.3'];  // ''=Attractive, .2=Less, .3=Very unattractive

function buildFiles(sexTag /* "M.F" or "F.F" */) {
  const files = [];
  for (let face = 1; face <= NUM_FACES_PER_SEX; face++) {
    for (const h of HEIGHT_CODES) {
      for (const a of ATTR_CODES) {
        files.push(`${sexTag}.${face}_${h}${a}${IMAGE_EXT}`);
      }
    }
  }
  return files;
}

const maleFiles   = buildFiles('M.F');
const femaleFiles = buildFiles('F.F');

const malePaths   = maleFiles.map(f => `all_images/${f}`);
const femalePaths = femaleFiles.map(f => `all_images/${f}`);

// Parse meta from a filename into clean columns
function parseMeta(imgPath) {
  const name = imgPath.split('/').pop();
  const m = name.match(/^([FM]\.F)\.(\d+)_([123])(?:\.([23]))?\.(png|jpg|jpeg)$/i);

  const meta = { sex:null, face_id:null, height_code:null, height_label:null, attract_code:null, attract_label:null };
  if (!m) return meta;

  const tag = m[1], face = parseInt(m[2],10), h = m[3], a = m[4] || '';
  meta.sex = (tag === 'F.F') ? 'Female' : 'Male';
  meta.face_id = face;
  meta.height_code = h;
  meta.height_label = (h==='1') ? 'Tall' : (h==='2') ? 'Average' : 'Short';
  meta.attract_code = a || null;
  meta.attract_label = (a==='') ? 'Attractive' : (a==='2') ? 'LessAttractive' : 'VeryUnattractive';
  return meta;
}

/* ========= INSTRUCTION-PAGE CENTERING HELPERS ========= */

function enterInstructionsMode() {
  const el = document.querySelector('.jspsych-content');
  if (el) el.classList.add('instructions-mode');
}
function exitInstructionsMode() {
  const el = document.querySelector('.jspsych-content');
  if (el) el.classList.remove('instructions-mode');
}

/* ========= FIREBASE INIT & AUTH ========= */

firebase.initializeApp(window.FIREBASE_CONFIG);

// Sign in anonymously so DB rules `auth != null` pass
let fbUser = null;
function ensureFirebaseAuth() {
  return new Promise((resolve) => {
    firebase.auth().onAuthStateChanged((user) => { fbUser = user; resolve(user); });
    firebase.auth().signInAnonymously().catch((e) => {
      console.warn('Anonymous sign-in failed:', e);
      resolve(null); // still run
    });
  });
}

const db = firebase.database();

/* ========= INIT JPSYCH ========= */

const jsPsych = initJsPsych({
  show_progress_bar: true,
  message_progress_bar: 'Progress',
  // No per-trial streaming; we save once at the end
});

// Participant IDs (CloudResearch / MTurk / Prolific, fallback UUID)
const participant_id =
  getParam('pid') || getParam('workerId') || getParam('PROLIFIC_PID') || safeUUID();
const participantId = getParam('participantId') || '';  // CR Connect
const assignmentId  = getParam('assignmentId')  || '';
const projectId     = getParam('projectId')     || '';

jsPsych.data.addProperties({ participant_id, participantId, assignmentId, projectId });

/* ========= PREVENT ACCIDENTAL EXITS ========= */
const beforeUnloadHandler = (e) => { e.preventDefault(); e.returnValue = ''; };
window.addEventListener('beforeunload', beforeUnloadHandler);

/* ========= PRELOAD ========= */

const preload = {
  type: jsPsychPreload,
  images: [...malePaths, ...femalePaths]
};

/* ========= FULLSCREEN SCREEN ========= */
const fullscreen = {
  type: jsPsychFullscreen,
  fullscreen_mode: true,
  message: `
    <div class="fs-message">
      <p>The experiment will switch to full screen mode when you press the button below.</p>
      <p><strong>Please make sure to remain in full-screen mode for the entirety of the study.</strong></p>
    </div>
  `,
  button_label: "Continue",
  on_load: () => {
    const el = document.querySelector('.jspsych-content');
    if (el) el.classList.add('fullscreen-mode');
  },
  on_finish: () => {
    const el = document.querySelector('.jspsych-content');
    if (el) el.classList.remove('fullscreen-mode');
  }
};

/* ========= SCREENS ========= */

const welcome = {
  type: jsPsychInstructions,
  pages: [
    `<div class="center">
       <h2>Welcome</h2>
       <p>Welcome to the experiment. This experiment will take approximately 30–40 minutes to complete.</p>
       <p>Please make sure you are in a quiet space and have a strong Wi-Fi connection while doing this experiment.</p>
       <p>If you wish to stop participating in this study at any point, simply close the window and your data will not be recorded.</p>
     </div>`
  ],
  show_clickable_nav: true,
  button_label_next: 'Continue',
  on_load: enterInstructionsMode,
  on_finish: exitInstructionsMode
};

const instructions = {
  type: jsPsychInstructions,
  pages: [
    `<div class="center">
       <h2>Instructions</h2>
       <p><strong>In this experiment, we will ask you to make judgments about a series of male and female images.</strong></p>
       <p>On each screen, you will see one image and four questions. <strong>Please answer the questions based on your perception of the image.</strong></p>
       <p>Use the 1–7 scale for each question. <strong>The scale is pre-set to 4 by default. However, you must still click or tap on your chosen response — including 4 — to record your answer</strong>.</p>
       <p>All four answers are required.</p>
     </div>`
  ],
  show_clickable_nav: true,
  button_label_next: 'Start',
  on_load: enterInstructionsMode,
  on_finish: exitInstructionsMode
};

function blockIntroHTML(label) {
  const line = (label === 'Male')
    ? 'Please view and rate the following male images'
    : 'Please view and rate the following female images';
  return `<div class="center">
            <h2>${label} Images</h2>
            <p>${line}.</p>
            <p>Click Continue to begin.</p>
          </div>`;
}
function makeBlockIntro(label){
  return {
    type: jsPsychInstructions,
    pages: [ blockIntroHTML(label) ],
    show_clickable_nav: true,
    button_label_next: 'Continue',
    on_load: enterInstructionsMode,
    on_finish: exitInstructionsMode
  };
}

/* ========= SLIDER TRIAL (one screen with 4 sliders, all required) ========= */

function sliderHTML(name, prompt) {
  return `
    <div class="q">
      <div class="q-title">${prompt}</div>
      <div class="slider-row">
        <input class="slider" type="range" min="1" max="7" step="1" value="4" name="${name}">
        ${tickRowHTML}
      </div>
    </div>`;
}

// Adds per-question active manipulation time (Q*_interact_ms)
function makeImageTrial(blockLabel, imgPath) {
  const htmlBlock = `
    <div class="q-block">
      ${sliderHTML('Q1', questionTexts[0])}
      ${sliderHTML('Q2', questionTexts[1])}
      ${sliderHTML('Q3', questionTexts[2])}
      ${sliderHTML('Q4', questionTexts[3])}
    </div>`;

  // accumulators for "active manipulation" time (ms)
  const interact = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  const activeSince = { Q1: null, Q2: null, Q3: null, Q4: null };

  return {
    type: jsPsychSurveyHtmlForm,
    preamble: `<div class="preamble-wrap">
                 <img class="stimulus-image" src="${imgPath}" alt="stimulus">
               </div>`,
    html: htmlBlock,
    button_label: 'Continue',
    data: {
      block: blockLabel,
      image: imgPath,
      ...parseMeta(imgPath)
    },

    on_load: () => {
      const btn =
        document.querySelector('#jspsych-survey-html-form-next') ||
        document.querySelector('form button[type="submit"]');
      if (!btn) return;

      // make sure instruction centering is off for rating trials
      exitInstructionsMode();

      btn.disabled = true;

      const msg = document.createElement('div');
      msg.id = 'move-all-sliders-msg';
      msg.style.textAlign = 'center';
      msg.style.color = '#b00';
      msg.style.margin = '6px 0 0';
      msg.textContent = 'Please answer all four questions to continue.';
      btn.parentElement.insertBefore(msg, btn);

      const sliders = Array.from(document.querySelectorAll('input[type="range"]'));
      sliders.forEach(s => { s.dataset.touched = '0'; });

      function checkAllTouched() {
        const ok = sliders.every(s => s.dataset.touched === '1');
        btn.disabled = !ok;
        msg.style.display = ok ? 'none' : 'block';
      }

      function startActive(name){ stopAll(); if (activeSince[name] == null) activeSince[name] = performance.now(); }
      function stopActive(name){ if (activeSince[name] != null){ interact[name] += performance.now() - activeSince[name]; activeSince[name] = null; } }
      function stopAll(){ ['Q1','Q2','Q3','Q4'].forEach(stopActive); }

      sliders.forEach(s => {
        const mark = () => { s.dataset.touched = '1'; checkAllTouched(); };
        s.addEventListener('input',       mark, { once: true });
        s.addEventListener('change',      mark, { once: true });
        s.addEventListener('pointerdown', mark, { once: true });
        s.addEventListener('mousedown',   mark, { once: true });
        s.addEventListener('touchstart',  mark, { once: true });
        s.addEventListener('focus',       mark, { once: true });
        s.addEventListener('keydown',     mark, { once: true });
      });

      sliders.forEach(s => {
        const name = s.name;
        const onStart = () => { startActive(name); };
        const onStop  = ()  => { stopActive(name); };
        s.addEventListener('pointerdown', onStart);
        s.addEventListener('mousedown',   onStart);
        s.addEventListener('touchstart',  onStart, { passive: true });
        s.addEventListener('keydown',     onStart);
        s.addEventListener('focus',       onStart);
        s.addEventListener('pointerup',   onStop);
        s.addEventListener('mouseup',     onStop);
        s.addEventListener('touchend',    onStop);
        s.addEventListener('keyup',       onStop);
        s.addEventListener('blur',        onStop);
        s.addEventListener('mouseleave',  onStop);
      });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) ['Q1','Q2','Q3','Q4'].forEach(stopActive);
      });

      btn.addEventListener('click', () => {
        ['Q1','Q2','Q3','Q4'].forEach(stopActive);
        document.body.dataset.interactTimes = JSON.stringify({
          Q1: Math.round(interact.Q1),
          Q2: Math.round(interact.Q2),
          Q3: Math.round(interact.Q3),
          Q4: Math.round(interact.Q4)
        });
      }, { once: true });

      /* ====== HARD 40% IMAGE / 60% SCALES + AUTO SCALE-FIT FOR FORM ====== */
      (function fitWithStrictSplitAndFormScale() {
        const stage   = document.querySelector('.jspsych-content');
        const preWrap = stage?.querySelector('.preamble-wrap');
        const form    = stage?.querySelector('form');
        if (!stage || !preWrap || !form) return;

        // create a wrapper around the form's children so we can scale the content cleanly
        let inner = form.querySelector('.form-scale-wrap');
        if (!inner) {
          inner = document.createElement('div');
          inner.className = 'form-scale-wrap';
          // move all children into the wrapper
          while (form.firstChild) inner.appendChild(form.firstChild);
          form.appendChild(inner);
        }
        inner.style.transformOrigin = 'top center';
        inner.style.width = '100%';

        const SAFETY = 8; // small gap to avoid clipping at the bottom

        const compute = () => {
          const cs   = getComputedStyle(stage);
          const padT = parseFloat(cs.paddingTop) || 0;
          const padB = parseFloat(cs.paddingBottom) || 0;

          const H = window.innerHeight - padT - padB;

          // 1) Fix the image container to exactly 40% of the usable viewport
          const imgH = Math.floor(H * 0.40);
          preWrap.style.height = imgH + 'px';

          // 2) The form gets the remaining 60% (minus a tiny safety)
          const formBoxH = H - imgH - SAFETY;

          // 3) Measure the *natural* height of the form content (unscaled)
          //    Reset any previous transform first
          inner.style.transform = 'scale(1)';
          // force a reflow
          const naturalH = inner.getBoundingClientRect().height;

          // 4) If content is taller than the 60% box, scale it down to fit
          let scale = 1;
          if (naturalH > formBoxH) {
            scale = formBoxH / naturalH;
            // keep a floor so text remains readable; adjust if you want smaller
            const MIN_SCALE = 0.82;
            scale = Math.max(MIN_SCALE, scale);
          }
          inner.style.transform = `scale(${scale})`;

          // When we scale down, visually it fits, but the container still "thinks"
          // the content is taller. Prevent scrollbars/clipping:
          form.style.overflow = 'hidden';
          // give the form enough internal height so the scaled content is fully visible
          form.style.height = formBoxH + 'px';
        };

        compute();
        setTimeout(compute, 0);
        setTimeout(compute, 60);
        setTimeout(compute, 200);

        const handler = () => compute();
        window.addEventListener('resize', handler);
        preWrap.__resizeHandler = handler;
      })();
      /* ====== END STRICT SPLIT + FORM SCALE ====== */
    },

    // Built-in page RT is saved as data.rt
    on_finish: (data) => {
      try {
        const t = JSON.parse(document.body.dataset.interactTimes || '{}');
        data.Q1_interact_ms = t.Q1 ?? null;
        data.Q2_interact_ms = t.Q2 ?? null;
        data.Q3_interact_ms = t.Q3 ?? null;
        data.Q4_interact_ms = t.Q4 ?? null;
      } catch (_) {
        data.Q1_interact_ms = data.Q2_interact_ms =
        data.Q3_interact_ms = data.Q4_interact_ms = null;
      }

      // Clean up the resize listener we attached in on_load (prevents leaks)
      const preWrap = document.querySelector('.preamble-wrap');
      if (preWrap && preWrap.__resizeHandler) {
        window.removeEventListener('resize', preWrap.__resizeHandler);
        delete preWrap.__resizeHandler;
      }
    }
  };
}

function makeBlockTrials(label, paths) {
  const trials = paths.map(p => makeImageTrial(label, p));
  return jsPsych.randomization.shuffle(trials); // randomize within block
}

/* ========= BLOCKS & TIMELINE ========= */

const maleIntro   = makeBlockIntro('Male');
const femaleIntro = makeBlockIntro('Female');

const maleTrials   = makeBlockTrials('Male', malePaths);
const femaleTrials = makeBlockTrials('Female', femalePaths);

// Randomize the order of Male vs Female blocks
const blocks = jsPsych.randomization.shuffle([
  { intro: maleIntro,   trials: maleTrials },
  { intro: femaleIntro, trials: femaleTrials }
]);

/* ===== Save gate (shows while saving), then Thank-You with ONLY the link ===== */

const saveGate = {
  type: jsPsychInstructions,
  show_clickable_nav: false,
  pages: [
    `<div class="center" style="max-width:800px;margin:0 auto;">
       <h3>Saving your responses…</h3>
       <p>Please wait a moment.</p>
     </div>`
  ],
  on_load: () => {
    finalSave()
      .then(() => {
        window.__saved__ = true;
        setTimeout(() => jsPsych.finishTrial(), 200);
      })
      .catch((e) => {
        console.error('Save failed:', e);
        setTimeout(() => jsPsych.finishTrial(), 200);
      });
  }
};

const thankYou = {
  type: jsPsychInstructions,
  show_clickable_nav: false,
  pages: [
    `<div class="center" style="max-width:800px;margin:0 auto;">
       <h2>Thank you!</h2>
       <p>Your responses have been recorded.</p>

       <hr style="margin:18px 0; border:0; border-top:2px solid #d5d5d5;">

       <p><strong>Thank you for participating! Your responses have been recorded.
       <br>Please click on the link below to be redirected to CloudResearch and then close this window.</strong></p>

       <p style="margin-top:12px;">
         <a href="https://connect.cloudresearch.com/participant/project/266D5D8639/complete"
            target="_blank" rel="noopener noreferrer"
            style="display:inline-block;padding:10px 16px;text-decoration:none;border-radius:8px;border:1px solid #2b6cb0;">
            Continue to CloudResearch
         </a>
       </p>
     </div>`
  ],
  on_load: () => {
    try { window.removeEventListener('beforeunload', beforeUnloadHandler); } catch(_) {}
    enterInstructionsMode();  // center thank-you as well
  },
  on_finish: exitInstructionsMode
};

/* ========= TIMELINE ========= */

const timeline = [];
timeline.push(fullscreen);
timeline.push(preload, welcome, instructions);
timeline.push(blocks[0].intro, ...blocks[0].trials);
timeline.push(blocks[1].intro, ...blocks[1].trials);
timeline.push(saveGate, thankYou);

/* ========= SAVE LOGIC ========= */

function finalSave() {
  const trials = jsPsych.data.get()
    .filter({ trial_type: 'survey-html-form' })
    .values()
    .map(row => ({
      block: row.block,
      image: row.image,
      sex: row.sex,
      face_id: row.face_id,
      height_label: row.height_label,
      attract_label: row.attract_label,

      // built-in page RT
      rt: row.rt,

      // slider responses
      Q1: Number(row.response?.Q1),
      Q2: Number(row.response?.Q2),
      Q3: Number(row.response?.Q3),
      Q4: Number(row.response?.Q4),

      // per-question active manipulation time (ms)
      Q1_interact_ms: row.Q1_interact_ms ?? null,
      Q2_interact_ms: row.Q2_interact_ms ?? null,
      Q3_interact_ms: row.Q3_interact_ms ?? null,
      Q4_interact_ms: row.Q4_interact_ms ?? null
    }));

  const payload = {
    participant_id,
    participantId,
    assignmentId,
    projectId,
    trials,
    client_version: 'v3',
    createdAt: firebase.database.ServerValue.TIMESTAMP
  };

  return db.ref('responses').push(payload);
}

/* ========= RUN ========= */

ensureFirebaseAuth().finally(() => {
  jsPsych.run(timeline);
});

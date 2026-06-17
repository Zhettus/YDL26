// ══════════════════════════════════════════════════════════════════════════════
// game.js — Robot Workshop
//
// Game loop:  tutorial → contract-select → building → testing → (×3) → gameover
//
// Backend calls:
//   GET  /api/contracts         → loadContracts()
//   POST /api/review {build,…}  → runReview() inside test-btn handler
// ══════════════════════════════════════════════════════════════════════════════

// ── Part catalogue ────────────────────────────────────────────────────────────
// Each part has:
//   desc      — one-liner shown on the card
//   detail    — plain-English explanation of what the part actually does
//   satisfies — human-readable label of which requirement(s) it helps meet
//   helpsReqs — machine-readable keys ('torque' | 'line' | 'camera' | 'grip' | 'power')

const PARTS = [
  {
    id: 'basic_motor', name: 'Basic Motor', icon: '⚙️', type: 'motor', typeLabel: 'MOTOR',
    torque: 5, power: 3, cost: 30, senses: [],
    desc: 'Simple DC motor. Low torque, low power draw.',
    detail: 'Adds 5 torque to your build. Stack two of these if you need more strength without breaking the budget.',
    satisfies: 'Helps meet: Torque requirement',
    helpsReqs: ['torque'],
  },
  {
    id: 'geared_motor', name: 'Geared Motor', icon: '🔩', type: 'motor', typeLabel: 'MOTOR',
    torque: 15, power: 6, cost: 60, senses: [],
    desc: 'High-torque motor with built-in gear reduction.',
    detail: 'Trades speed for strength — the most torque per slot. Expensive and power-hungry, but worth it for hard contracts.',
    satisfies: 'Helps meet: Torque requirement (best for high-torque contracts)',
    helpsReqs: ['torque'],
  },
  {
    id: 'battery', name: 'Battery Pack', icon: '🔋', type: 'battery', typeLabel: 'BATTERY',
    torque: 0, power: 1, cost: 20, senses: [],
    desc: 'Lightweight power cell. Minimal overhead.',
    detail: 'Adds only 1W of draw. Useful as cheap filler when you have a spare slot and plenty of power budget left.',
    satisfies: 'No specific requirement — filler part',
    helpsReqs: [],
  },
  {
    id: 'wheels', name: 'Drive Wheels', icon: '⭕', type: 'mobility', typeLabel: 'MOBILITY',
    torque: 0, power: 1, cost: 25, senses: [],
    desc: 'Standard rubber wheels. Fast on flat surfaces.',
    detail: 'Your robot needs at least one mobility part to move at all. Wheels are cheap and efficient but can\'t add torque.',
    satisfies: 'Allows movement (required for most contracts)',
    helpsReqs: [],
  },
  {
    id: 'tracks', name: 'Tank Tracks', icon: '🔲', type: 'mobility', typeLabel: 'MOBILITY',
    torque: 3, power: 2, cost: 45, senses: [],
    desc: 'Tank treads. Grips any surface, adds 3 torque.',
    detail: 'More expensive than wheels but also adds 3 torque — great when you\'re just a little short on strength.',
    satisfies: 'Helps meet: Torque requirement (and allows movement)',
    helpsReqs: ['torque'],
  },
  {
    id: 'line_sensor', name: 'Line Sensor', icon: '👁️', type: 'sensor', typeLabel: 'SENSOR',
    torque: 0, power: 1, cost: 35, senses: ['line'],
    desc: 'IR sensor that detects floor markings.',
    detail: 'An infrared sensor pointed at the floor. It detects contrast — like a white line on a dark surface. Required for any "line-following" or "navigation" contract.',
    satisfies: 'Satisfies: line sensor requirement',
    helpsReqs: ['line'],
  },
  {
    id: 'camera', name: 'Camera', icon: '📷', type: 'sensor', typeLabel: 'SENSOR',
    torque: 0, power: 2, cost: 55, senses: ['camera'],
    desc: 'Vision camera for object and colour recognition.',
    detail: 'A small camera with onboard image processing. Required when the robot needs to identify objects, read labels, or sort by colour. Uses more power than a line sensor.',
    satisfies: 'Satisfies: camera / vision requirement',
    helpsReqs: ['camera'],
  },
  {
    id: 'gripper', name: 'Gripper Arm', icon: '🦾', type: 'actuator', typeLabel: 'ACTUATOR',
    torque: 2, power: 2, cost: 50, senses: ['grip'],
    desc: 'Articulated arm for picking up and moving objects.',
    detail: 'A mechanical arm with a servo-driven claw. Required for any task involving grabbing, lifting, or sorting physical items. Also adds 2 torque because the arm motor contributes to the drivetrain.',
    satisfies: 'Satisfies: grip requirement',
    helpsReqs: ['grip'],
  },
];

// Plain-English explanations for each requirement type
// These appear as callouts inside the contract reminder on the chassis panel.
const REQ_EXPLANATIONS = {
  torque: (val) => ({
    icon: '🔩',
    title: `Torque ≥ ${val} — Robot must be strong enough`,
    body:  `Torque is your robot's pushing and lifting power. Add motors to increase it. Basic Motor = +5, Geared Motor = +15, Tank Tracks = +3.`,
  }),
  line: {
    icon: '👁️',
    title: 'Line sensor — Robot must see floor markings',
    body:  'The floor has painted guide lines. Without a Line Sensor, the robot can\'t follow them and will wander off course.',
  },
  camera: {
    icon: '📷',
    title: 'Camera — Robot must identify objects visually',
    body:  'The task requires the robot to recognise items by sight. A Camera gives it vision. The Line Sensor alone is not enough.',
  },
  grip: {
    icon: '🦾',
    title: 'Grip — Robot must physically handle objects',
    body:  'The task requires picking up or placing items. Only the Gripper Arm provides grip ability.',
  },
  maxPower: (val) => ({
    icon: '⚡',
    title: `Max ${val}W — Stay under the power budget`,
    body:  `The site's power outlet can only supply ${val}W. Add up all your parts' power draw and keep the total at or below this limit.`,
  }),
};

const TYPE_COLORS = {
  motor:    '#ff8c00',
  battery:  '#ffd700',
  mobility: '#4fc3f7',
  sensor:   '#ce93d8',
  actuator: '#f48fb1',
};

// ── Game state ─────────────────────────────────────────────────────────────────

const G = {
  round:       1,
  maxRounds:   3,
  score:       0,
  credits:     200,
  startCredits:200,
  contract:    null,
  slots:       new Array(6).fill(null),
  highScore:   parseInt(localStorage.getItem('rw-hs') || '0'),
};

// ── Sound engine ───────────────────────────────────────────────────────────────

const SFX = (() => {
  let ctx = null;
  const init = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); };
  function tone(freq, type, dur, vol = 0.25) {
    init();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(); osc.stop(ctx.currentTime + dur);
  }
  return {
    drop()   { tone(520,'square',0.08,0.18); },
    remove() { tone(260,'square',0.08,0.14); },
    click()  { tone(780,'sine',0.06,0.12); },
    select() { tone(660,'sine',0.18,0.22); tone(880,'sine',0.18,0.18); setTimeout(()=>tone(1100,'sine',0.2,0.2),80); },
    success(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,'sine',0.35,0.3),i*90)); },
    fail()   { [440,330,220,110].forEach((f,i)=>setTimeout(()=>tone(f,'sawtooth',0.25,0.25),i*100)); },
  };
})();

// ── Particles ─────────────────────────────────────────────────────────────────

function spawnParticles(x, y, color='#00ffa3', count=10) {
  const layer = document.getElementById('fx-layer');
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const a = Math.random()*Math.PI*2, d = 30+Math.random()*60;
    p.style.cssText = `left:${x}px;top:${y}px;background:${color};box-shadow:0 0 4px ${color};--dx:${Math.cos(a)*d}px;--dy:${Math.sin(a)*d}px;`;
    layer.appendChild(p);
    setTimeout(()=>p.remove(), 700);
  }
}

function spawnScorePopup(amount, color='#ffd700') {
  const popup = document.createElement('div');
  popup.className = 'score-popup';
  popup.textContent = `+${amount}`;
  popup.style.color = color;
  popup.style.textShadow = `0 0 20px ${color}`;
  popup.style.left = `${window.innerWidth/2-60}px`;
  popup.style.top  = `${window.innerHeight/2}px`;
  document.body.appendChild(popup);
  setTimeout(()=>popup.remove(), 1100);
}

function screenShake() {
  document.body.classList.remove('shake');
  void document.body.offsetWidth;
  document.body.classList.add('shake');
  setTimeout(()=>document.body.classList.remove('shake'), 450);
}

// ── HUD ────────────────────────────────────────────────────────────────────────

function updateHUD() {
  document.getElementById('hud-round').textContent     = G.round;
  document.getElementById('hud-maxrounds').textContent = G.maxRounds;
  document.getElementById('hud-score').textContent     = G.score;
  document.getElementById('hud-best').textContent      = G.highScore;
  document.getElementById('hud-credits').textContent   = G.credits;
}

function animateNumber(elId, from, to, dur=600) {
  const el = document.getElementById(elId), start = performance.now();
  const step = now => {
    const t = Math.min((now-start)/dur, 1);
    el.textContent = Math.round(from+(to-from)*t);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── Phase switcher ────────────────────────────────────────────────────────────

function showPhase(name) {
  ['phase-contract','phase-build','phase-gameover'].forEach(id => {
    document.getElementById(id).classList.toggle('hidden', id !== name);
  });
}

// ── Tutorial ──────────────────────────────────────────────────────────────────

const tutOverlay = document.getElementById('tutorial-overlay');

document.getElementById('tut-close-btn').addEventListener('click', () => {
  SFX.click();
  tutOverlay.classList.add('hidden');
});

document.getElementById('help-btn').addEventListener('click', () => {
  SFX.click();
  tutOverlay.classList.remove('hidden');
});

// ── PHASE 1: Contract selection ───────────────────────────────────────────────

async function loadContracts() {
  showPhase('phase-contract');
  document.getElementById('contract-loading').classList.remove('hidden');
  document.getElementById('contract-cards-grid').hidden = true;

  let contracts;

  // ── BACKEND CALL #1 ────────────────────────────────────────────────────────
  // GET /api/contracts — Flask calls the LLM, returns array of 3 contract objects.
  // Falls back to hardcoded if the LLM fails (see app.py::api_contracts).
  try {
    const res = await fetch('/api/contracts');
    if (!res.ok) throw new Error(res.status);
    contracts = await res.json();
  } catch(err) {
    console.warn('Contracts fetch failed:', err);
    contracts = [
      { title:'Floor Patrol Unit', description:'Simple line-following patrol robot for the factory perimeter.',
        requires:{torque:5,senses:['line'],maxPower:8}, reward:120, difficulty:'easy' },
      { title:'Recycling Sorter', description:'Follow a conveyor line and sort recyclables into bins with a gripper.',
        requires:{torque:10,senses:['line','grip'],maxPower:14}, reward:210, difficulty:'medium' },
      { title:'Vision Assembly Bot', description:'Camera-guided robot that identifies and places components on the rig.',
        requires:{torque:16,senses:['camera','grip'],maxPower:16}, reward:300, difficulty:'hard' },
    ];
  }

  renderContractCards(contracts);
}

const DIFF_ICONS = { easy:'🟢', medium:'🟡', hard:'🔴' };

function renderContractCards(contracts) {
  const grid = document.getElementById('contract-cards-grid');
  document.getElementById('contract-loading').classList.add('hidden');
  grid.innerHTML = '';
  grid.hidden = false;

  contracts.forEach(c => {
    const card = document.createElement('div');
    card.className = `contract-card ${c.difficulty}`;

    // Build requirement chips with plain labels
    const senseLabels = {
      line:   '👁️ Line sensor (for floor navigation)',
      camera: '📷 Camera (for object recognition)',
      grip:   '🦾 Gripper arm (for picking up items)',
    };
    const senseChips = c.requires.senses.map(s => `<span class="cc-req-chip">${senseLabels[s] || s}</span>`).join('');

    card.innerHTML = `
      <div class="cc-diff">${DIFF_ICONS[c.difficulty]||''} ${c.difficulty.toUpperCase()}</div>
      <div class="cc-title">${c.title}</div>
      <div class="cc-desc">${c.description}</div>
      <div class="cc-reqs">
        <span class="cc-req-chip">🔩 Torque ≥ ${c.requires.torque} (motor strength needed)</span>
        ${senseChips}
        <span class="cc-req-chip">⚡ Max ${c.requires.maxPower}W power draw</span>
      </div>
      <div class="cc-reward">${c.reward} <span>CREDIT REWARD</span></div>
    `;

    card.addEventListener('click', () => {
      SFX.select();
      G.contract = c;
      const rect = card.getBoundingClientRect();
      spawnParticles(rect.left+rect.width/2, rect.top+rect.height/2,
        c.difficulty==='hard' ? '#ff4c4c' : c.difficulty==='medium' ? '#ffd700' : '#00ffa3', 16);
      startBuildPhase();
    });

    grid.appendChild(card);
  });
}

// ── PHASE 2: Building ─────────────────────────────────────────────────────────

function startBuildPhase() {
  G.slots   = new Array(6).fill(null);
  G.credits = G.startCredits;
  showPhase('phase-build');
  document.getElementById('phase-test').classList.add('hidden');
  renderContractReminder();
  renderChassis();
  renderParts();
  updateStats();
  updateHUD();
}

// ── Contract reminder with requirement explanations ────────────────────────────

function renderContractReminder() {
  const c = G.contract;
  document.getElementById('reminder-title').textContent = c.title;

  // Compact chips
  const reqs = document.getElementById('reminder-reqs');
  reqs.innerHTML = '';
  [`🔩 ≥${c.requires.torque} torque`, `⚡ max ${c.requires.maxPower}W`,
   ...(c.requires.senses.length ? [`👁 ${c.requires.senses.join(', ')}`] : [])
  ].forEach(t => {
    const chip = document.createElement('span');
    chip.className = 'rem-chip';
    chip.textContent = t;
    reqs.appendChild(chip);
  });

  // Plain-English explanations for each requirement
  const explEl = document.getElementById('reminder-explanations');
  explEl.innerHTML = '';

  // Torque explanation
  const tq = REQ_EXPLANATIONS.torque(c.requires.torque);
  explEl.appendChild(makeExplainRow(tq));

  // Sense explanations
  c.requires.senses.forEach(s => {
    if (REQ_EXPLANATIONS[s]) explEl.appendChild(makeExplainRow(REQ_EXPLANATIONS[s]));
  });

  // Power explanation
  const pw = REQ_EXPLANATIONS.maxPower(c.requires.maxPower);
  explEl.appendChild(makeExplainRow(pw));
}

function makeExplainRow({ icon, title, body }) {
  const row = document.createElement('div');
  row.className = 'req-explain';
  row.innerHTML = `
    <span class="req-explain-icon">${icon}</span>
    <div class="req-explain-text"><b>${title}</b>${body}</div>
  `;
  return row;
}

// ── Parts inventory ───────────────────────────────────────────────────────────

function renderParts() {
  const list = document.getElementById('parts-list');
  list.innerHTML = '';

  // Group parts by type for readability
  const groups = [
    { label: '— Motors (add torque) —',   ids: ['basic_motor','geared_motor'] },
    { label: '— Mobility (must move) —',   ids: ['wheels','tracks'] },
    { label: '— Sensors (perception) —',   ids: ['line_sensor','camera'] },
    { label: '— Actuators (action) —',     ids: ['gripper'] },
    { label: '— Power —',                  ids: ['battery'] },
  ];

  groups.forEach(group => {
    const header = document.createElement('div');
    header.style.cssText = 'font-size:0.6rem;color:var(--muted);letter-spacing:1px;margin:10px 0 5px;opacity:0.7;';
    header.textContent = group.label;
    list.appendChild(header);

    group.ids.forEach(id => {
      const p = PARTS.find(x => x.id === id);
      if (!p) return;
      const card = document.createElement('div');
      card.className = 'part-card';
      card.draggable = true;
      card.dataset.id = p.id;
      card.style.setProperty('--type-color', TYPE_COLORS[p.type] || '#00ffa3');

      // Stat pills — only show what's non-zero / relevant
      const pills = [];
      if (p.torque > 0) pills.push(`<span class="pc-stat-pill torque">🔩 +${p.torque} torque</span>`);
      pills.push(`<span class="pc-stat-pill power">⚡ ${p.power}W draw</span>`);
      p.senses.forEach(s => pills.push(`<span class="pc-stat-pill sense">👁 ${s}</span>`));
      pills.push(`<span class="pc-stat-pill cost">💰 ${p.cost} cr</span>`);

      card.innerHTML = `
        <div class="pc-top">
          <span class="pc-icon">${p.icon}</span>
          <div class="pc-meta">
            <span class="pc-type">${p.typeLabel}</span>
            <span class="pc-name">${p.name}</span>
          </div>
        </div>
        <div class="pc-desc">${p.desc}</div>
        <div class="pc-desc" style="font-size:0.7rem;color:var(--muted);margin-top:3px">${p.detail}</div>
        <div class="pc-stats">${pills.join('')}</div>
        <div class="pc-satisfies"><span>${p.satisfies}</span></div>
      `;

      const canAfford = p.cost <= G.credits;
      if (!canAfford) {
        card.classList.add('too-expensive');
        card.title = `Can't afford — costs ${p.cost} cr, you have ${G.credits} cr`;
      }

      card.addEventListener('dragstart', e => {
        if (!canAfford) { e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', p.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));

      list.appendChild(card);
    });
  });
}

// ── Chassis slots ──────────────────────────────────────────────────────────────

function renderChassis() {
  const zone = document.getElementById('chassis-zone');
  zone.innerHTML = '';

  G.slots.forEach((part, i) => {
    const slot = document.createElement('div');
    slot.className   = 'part-slot' + (part ? ' filled' : '');
    slot.dataset.slot = i;
    if (part) slot.style.setProperty('--slot-color', TYPE_COLORS[part.type] || '#00ffa3');

    if (part) {
      slot.innerHTML = `
        <div class="slot-icon">${part.icon}</div>
        <div class="slot-name">${part.name}</div>
        <button class="slot-remove" title="Remove this part">✕</button>
      `;
      slot.querySelector('.slot-remove').addEventListener('click', e => {
        e.stopPropagation();
        SFX.remove();
        G.credits += part.cost;
        G.slots[i] = null;
        renderChassis();
        renderParts();
        updateStats();
        updateHUD();
      });
    } else {
      slot.innerHTML = `<span style="font-size:1.2rem;opacity:.2">+</span><span style="font-size:0.55rem;opacity:.3;margin-top:3px">drag here</span>`;
    }

    slot.addEventListener('dragover', e => {
      e.preventDefault();
      if (!slot.classList.contains('filled')) slot.classList.add('drag-over');
    });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', e => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      if (slot.classList.contains('filled')) return;
      const part = PARTS.find(p => p.id === e.dataTransfer.getData('text/plain'));
      if (!part || part.cost > G.credits) return;
      SFX.drop();
      G.credits -= part.cost;
      G.slots[i] = { ...part, uid: Date.now()+Math.random() };
      const rect = slot.getBoundingClientRect();
      spawnParticles(rect.left+rect.width/2, rect.top+rect.height/2, TYPE_COLORS[part.type], 12);
      renderChassis();
      renderParts();
      updateStats();
      updateHUD();
    });

    zone.appendChild(slot);
  });

  document.getElementById('slots-used').textContent = G.slots.filter(Boolean).length;
}

// ── Live stats + hints ────────────────────────────────────────────────────────

function getBuildStats() {
  const parts  = G.slots.filter(Boolean);
  const torque = parts.reduce((s,p)=>s+(p.torque||0), 0);
  const power  = parts.reduce((s,p)=>s+(p.power ||0), 0);
  const senses = [...new Set(parts.flatMap(p=>p.senses))];
  const cost   = G.startCredits - G.credits;
  return { parts, torque, power, senses, cost };
}

/**
 * Build specific, actionable hints when a requirement isn't met.
 * Each hint tells the player exactly which part to add and why.
 */
function buildHints(req, { torque, power, senses }) {
  const hints = [];

  const torqueShortfall = req.torque - torque;
  if (torqueShortfall > 0) {
    if (torqueShortfall <= 5)
      hints.push(`Need ${torqueShortfall} more torque → add a Basic Motor ⚙️ (+5 torque, 30 cr)`);
    else if (torqueShortfall <= 10)
      hints.push(`Need ${torqueShortfall} more torque → add a Geared Motor 🔩 (+15 torque, 60 cr) or two Basic Motors ⚙️`);
    else
      hints.push(`Need ${torqueShortfall} more torque → use a Geared Motor 🔩 (+15, 60 cr). Tank Tracks 🔲 also add +3 torque.`);
  }

  if (!senses.includes('line') && req.senses.includes('line'))
    hints.push('Missing floor navigation → add a Line Sensor 👁️ (35 cr). It detects the painted floor line.');

  if (!senses.includes('camera') && req.senses.includes('camera'))
    hints.push('Missing vision → add a Camera 📷 (55 cr). It lets the robot recognise objects by sight.');

  if (!senses.includes('grip') && req.senses.includes('grip'))
    hints.push('Can\'t grab things → add a Gripper Arm 🦾 (50 cr). Required for picking up or sorting items.');

  if (power > req.maxPower)
    hints.push(`${power - req.maxPower}W over the power limit → remove a high-draw part. Geared Motor uses 6W, Camera 2W.`);

  return hints;
}

function updateStats() {
  const { torque, power, senses, cost } = getBuildStats();
  const req = G.contract?.requires;
  const MAX_TORQUE = 25, MAX_POWER = 20;

  // Torque bar
  document.getElementById('val-torque').textContent = torque;
  document.getElementById('req-torque').textContent = req ? req.torque : '?';
  document.getElementById('bar-torque').style.width = `${Math.min(torque/MAX_TORQUE*100,100)}%`;
  document.getElementById('bar-torque').style.background = (!req || torque >= req.torque) ? 'var(--accent)' : 'var(--warn)';
  if (req) document.getElementById('mark-torque').style.left = `${Math.min(req.torque/MAX_TORQUE*100,100)}%`;

  // Power bar
  document.getElementById('val-power').textContent = power;
  document.getElementById('req-power').textContent = req ? req.maxPower : '?';
  const overPower = req && power > req.maxPower;
  const barPow = document.getElementById('bar-power');
  barPow.style.width = `${Math.min(power/MAX_POWER*100,100)}%`;
  barPow.style.background = overPower ? 'var(--warn)' : 'var(--accent2)';
  if (req) document.getElementById('mark-power').style.left = `${Math.min(req.maxPower/MAX_POWER*100,100)}%`;

  // Sense badges
  const senseList = document.getElementById('senses-list');
  senseList.innerHTML = '';
  ['line','camera','grip'].forEach(s => {
    const needed = req?.senses.includes(s);
    const have   = senses.includes(s);
    if (!needed && !have) return;
    const badge = document.createElement('span');
    badge.className = `sense-badge ${have && needed ? 'have' : needed ? 'need' : 'extra'}`;
    badge.textContent = (have ? '✓ ' : '✗ ') + s;
    senseList.appendChild(badge);
  });

  // Cost
  document.getElementById('cost-display').textContent = `${cost} CR`;

  // Budget bar
  document.getElementById('credits-display').textContent = G.credits;
  const bFill = document.getElementById('budget-fill');
  bFill.style.width = `${G.credits/G.startCredits*100}%`;
  bFill.style.background = G.credits < 40 ? 'var(--warn)' : 'var(--gold)';

  const placed = G.slots.filter(Boolean).length;
  const testBtn = document.getElementById('test-btn');

  if (!placed || !req) {
    document.getElementById('verdict').className = 'verdict neutral';
    document.getElementById('verdict').textContent = 'Drag parts from the left onto the chassis slots →';
    document.getElementById('hints-box').classList.add('hidden');
    testBtn.disabled = true;
    return;
  }

  const okTorque = torque >= req.torque;
  const okPower  = power  <= req.maxPower;
  const okSenses = req.senses.every(s => senses.includes(s));
  const allGood  = okTorque && okPower && okSenses;

  const verdict = document.getElementById('verdict');
  verdict.className   = 'verdict ' + (allGood ? 'pass' : 'fail');
  verdict.textContent = allGood ? '✅ ALL SPECS MET — READY TO DEPLOY!' : '❌ Build doesn\'t meet requirements yet';

  // Hints
  const hints     = allGood ? [] : buildHints(req, { torque, power, senses });
  const hintsBox  = document.getElementById('hints-box');
  const hintsList = document.getElementById('hints-list');

  if (hints.length > 0) {
    hintsList.innerHTML = hints.map(h =>
      `<div class="hint-item"><span class="hint-arrow">→</span><span>${h}</span></div>`
    ).join('');
    hintsBox.classList.remove('hidden');
  } else {
    hintsBox.classList.add('hidden');
  }

  testBtn.disabled = placed === 0;
}

// ── PHASE 3: Test ─────────────────────────────────────────────────────────────

document.getElementById('test-btn').addEventListener('click', async () => {
  SFX.click();
  const { parts, torque, power, senses } = getBuildStats();
  if (!parts.length || !G.contract) return;

  const req    = G.contract.requires;
  const passed = torque >= req.torque && power <= req.maxPower && req.senses.every(s => senses.includes(s));

  const testEl = document.getElementById('phase-test');
  testEl.classList.remove('hidden');
  document.getElementById('review-panel').classList.add('hidden');
  document.getElementById('next-btn').classList.add('hidden');
  document.getElementById('score-earned').classList.add('hidden');

  const robot = document.getElementById('robot-sprite');
  robot.classList.remove('anim-pass','anim-fail');
  void robot.offsetWidth;

  if (passed) {
    SFX.success();
    robot.classList.add('anim-pass');
    document.getElementById('sparks').classList.remove('hidden');
    document.getElementById('sparks').classList.add('visible');
  } else {
    SFX.fail();
    robot.classList.add('anim-fail');
    screenShake();
    setTimeout(()=>{
      document.getElementById('explode').classList.remove('hidden');
      setTimeout(()=>document.getElementById('explode').classList.add('hidden'), 800);
    }, 1400);
  }

  testEl.scrollIntoView({ behavior:'smooth', block:'end' });
  await new Promise(r=>setTimeout(r,2300));
  document.getElementById('sparks').classList.add('hidden');
  document.getElementById('sparks').classList.remove('visible');

  const reviewPanel = document.getElementById('review-panel');
  reviewPanel.classList.remove('hidden');
  const header = document.getElementById('review-header');
  header.textContent = passed ? '✅ CONTRACT FULFILLED' : '❌ ROBOT FAILED';
  header.className   = passed ? 'pass' : 'fail';
  document.getElementById('review-text').textContent = '📋 Inspector is writing their verdict…';

  // ── BACKEND CALL #2 ────────────────────────────────────────────────────────
  // POST /api/review — Flask calls the LLM for an in-character verdict.
  // Response shape: { feedback: "..." }
  try {
    const res  = await fetch('/api/review', {
      method:  'POST',
      headers: { 'Content-Type':'application/json' },
      body:    JSON.stringify({ build:parts, passed, contract:G.contract }),
    });
    const data = await res.json();
    document.getElementById('review-text').textContent = data.feedback; // ← LLM text here
  } catch(e) {
    document.getElementById('review-text').textContent = 'Inspector is on holiday. No verdict available.';
  }

  if (passed) {
    const base = G.contract.reward;
    const eff  = Math.round((G.credits/G.startCredits)*60);
    const total = base + eff;
    G.score += total;
    if (G.score > G.highScore) { G.highScore = G.score; localStorage.setItem('rw-hs', G.highScore); }
    updateHUD();
    animateNumber('hud-score', G.score-total, G.score);
    spawnScorePopup(total, '#ffd700');
    spawnParticles(window.innerWidth/2, window.innerHeight/2, '#00ffa3', 20);
    const earnedEl = document.getElementById('score-earned');
    earnedEl.innerHTML = `💰 Contract reward: <b>${base} pts</b> &nbsp;+&nbsp; ⚡ Budget bonus: <b>${eff} pts</b> (${G.credits} cr left) &nbsp;= <b>${total} pts total</b>`;
    earnedEl.classList.remove('hidden');
  }

  const nextBtn = document.getElementById('next-btn');
  nextBtn.classList.remove('hidden');
  nextBtn.textContent = G.round >= G.maxRounds ? 'VIEW FINAL SCORE →' : 'NEXT CONTRACT →';
});

document.getElementById('next-btn').addEventListener('click', ()=>{
  SFX.click();
  if (G.round >= G.maxRounds) {
    endGame();
  } else {
    G.round++;
    updateHUD();
    document.getElementById('phase-test').classList.add('hidden');
    loadContracts();
  }
});

// ── Game over ──────────────────────────────────────────────────────────────────

function endGame() {
  showPhase('phase-gameover');
  document.getElementById('phase-test').classList.add('hidden');
  document.getElementById('final-score').textContent = G.score;
  if (G.score > 0 && G.score >= parseInt(localStorage.getItem('rw-hs')||'0'))
    document.getElementById('new-record').classList.remove('hidden');
  spawnParticles(window.innerWidth/2, window.innerHeight/3, '#ffd700', 30);
  SFX.success();
}

document.getElementById('restart-btn').addEventListener('click', ()=>{
  SFX.click();
  Object.assign(G, { round:1, score:0, credits:G.startCredits, contract:null, slots:new Array(6).fill(null) });
  document.getElementById('new-record').classList.add('hidden');
  document.getElementById('phase-test').classList.add('hidden');
  updateHUD();
  loadContracts();
});

// ── Boot ───────────────────────────────────────────────────────────────────────

updateHUD();
loadContracts();
// Tutorial shown on page load (see HTML — it's visible by default)

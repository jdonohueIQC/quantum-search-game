/* ============================================================
   Hadamard's Hoard — browser simulator
   Faithful digital adaptation of the IQC card/board game.
   See README.md for the design decisions behind the numbers.
   ============================================================ */

/* ---------- Small SVG icon helpers (used instead of emoji so
   colors are exact and consistent across platforms) ---------- */

function svgDiamond(fill, size){
  size = size || 26;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><polygon points="12,2 22,9 12,22 2,9" fill="${fill}"/></svg>`;
}
function svgX(color, size){
  size = size || 30;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><line x1="4" y1="4" x2="20" y2="20" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/><line x1="20" y1="4" x2="4" y2="20" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/></svg>`;
}

/* ---------- Board math ---------- */

// Rounded, dice-friendly boards mirroring the printed game boards.
// Each array lists the "measurable" tiles (as [numerator, denominator]).
// A guaranteed-win final tile is appended automatically.
const ROUNDED_BOARDS = {
  4:   [[1,4]],
  12:  [[1,12],[1,2]],
  30:  [[1,30],[1,4],[1,2],[5,6]],
  100: [[1,100],[1,10],[1,4],[2,5],[5,8],[4,5],[9,10]] // extrapolated — no printed board for N=100
};

function groverProbability(N, k){
  const theta = Math.asin(1/Math.sqrt(N));
  return Math.pow(Math.sin((2*k+1)*theta), 2);
}

function buildBoard(N, mode){
  const roundedCount = ROUNDED_BOARDS[N].length;
  const tiles = [];
  for(let k=0;k<roundedCount;k++){
    if(mode === 'real'){
      tiles.push({ p: groverProbability(N,k), label: null });
    } else {
      const [num,den] = ROUNDED_BOARDS[N][k];
      tiles.push({ p: num/den, label: `${num}/${den}` });
    }
  }
  tiles.push({ p: 1, label: 'final', final: true });
  return tiles;
}

/* ---------- Event deck ----------
   24 cards total: 8 Decoherence, 5 Quantum Error Correction,
   6 Extra RAM, 4 Cosmic Ray, 1 Blue Screen. */

function freshEventDeck(){
  const cards = [];
  for(let i=0;i<8;i++) cards.push('DECOHERENCE');
  for(let i=0;i<5;i++) cards.push('QEC');
  for(let i=0;i<6;i++) cards.push('EXTRA_RAM');
  for(let i=0;i<4;i++) cards.push('COSMIC_RAY');
  for(let i=0;i<1;i++) cards.push('BLUE_SCREEN');
  return shuffle(cards);
}

const EVENT_TEXT = {
  DECOHERENCE: { title: 'Decoherence', desc: 'The right-most open tile is covered. Progress can\u2019t pass it until you next measure.' },
  COSMIC_RAY: { title: 'Cosmic Ray', desc: 'You must measure on your next turn.' },
  BLUE_SCREEN: { title: 'Blue Screen', desc: 'Your opponent\u2019s entire deck is reshuffled from scratch (it keeps any Extra RAM).' },
  QEC: { title: 'Quantum Error Correction', desc: 'You gain a shield that cancels the next Decoherence drawn.' },
  EXTRA_RAM: { title: 'Extra RAM', desc: 'Your opponent can now flip one additional card per turn.' }
};

/* ---------- Utilities ---------- */

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function freshClassicalDeck(N){
  const cards = [{type:'gem'}];
  for(let i=1;i<N;i++) cards.push({type:'blank'});
  return shuffle(cards);
}

/* ---------- Timing (ms) — tuned so each action reads clearly ---------- */

const TIMING = {
  cardDrawGap: 600,      // between successive opponent card flips (extra RAM)
  gemHold: 850,          // pause after opponent finds a gem, before quantum turn begins
  advancePause: 550,     // pause after "run the algorithm" before opponent's turn
  measureOpen: 380,      // suspense delay before the measurement box reveals its result
  measureHold: 1100,     // how long the result stays visible before moving on
  eventReveal: 500,      // delay before an event's effect is logged/applied
  eventHold: 900          // pause after an event resolves before opponent's turn
};

/* ---------- Game state ---------- */

let game = null;
let soundOn = true;

function newGame(config){
  const board = buildBoard(config.deckSize, config.probMode);
  game = {
    config,
    board,
    quantum: {
      tileIndex: 0,
      maxReachable: board.length - 1,
      points: 0,
      qecCharges: 0,
      forcedMeasure: false
    },
    classical: {
      deck: freshClassicalDeck(config.deckSize),
      revealed: 0,
      lastRevealedIndex: -1,
      pendingReshuffle: false,
      points: 0,
      ram: 0
    },
    eventDeck: config.eventsEnabled ? freshEventDeck() : [],
    phase: 'classical', // classical -> quantum -> event -> classical... ('resolving' is transient, disables input)
    over: false,
    log: []
  };
  render();
  resetMeasureBox();
}

function finalIndex(){ return game.board.length - 1; }

function log(who, text){
  game.log.push({who, text});
  renderLog();
}

/* ---------- Turn logic: classical opponent ---------- */

function runClassicalTurn(){
  const c = game.classical;
  if(c.pendingReshuffle){
    c.deck = freshClassicalDeck(game.config.deckSize);
    c.revealed = 0;
    c.lastRevealedIndex = -1;
    c.pendingReshuffle = false;
    render();
  }
  const totalDraws = 1 + c.ram;
  drawNextClassicalCard(totalDraws, 0);
}

function drawNextClassicalCard(totalDraws, doneCount){
  const c = game.classical;
  if(doneCount >= totalDraws){
    finishClassicalTurn();
    return;
  }
  if(c.revealed >= c.deck.length){ finishClassicalTurn(); return; } // safety

  const card = c.deck[c.revealed];
  c.lastRevealedIndex = c.revealed;
  c.revealed++;
  SFX.cardFlip();

  if(card.type === 'gem'){
    c.points++;
    log('c', `Opponent flips a gem! (${c.points}/${game.config.gemTarget})`);
    c.ram = 0; // discard held RAM when a point is scored
    c.pendingReshuffle = true; // deck reshuffles at the start of the opponent's NEXT turn
    render();
    if(checkWin()) return;
    setTimeout(finishClassicalTurn, TIMING.gemHold);
  } else {
    log('c', `Opponent flips a blank (${c.revealed}/${c.deck.length}).`);
    render();
    setTimeout(()=> drawNextClassicalCard(totalDraws, doneCount+1), TIMING.cardDrawGap);
  }
}

function finishClassicalTurn(){
  render();
  if(checkWin()) return;
  resetMeasureBox();
  game.phase = 'quantum';
  updateReadouts();
}

/* ---------- Turn logic: quantum player ---------- */

function canAdvance(){
  const q = game.quantum;
  return q.tileIndex < q.maxReachable;
}

function isQuantumTurn(){
  return game.phase === 'quantum' && !game.over;
}

function doAdvance(){
  if(!isQuantumTurn()) return;
  const q = game.quantum;
  if(q.forcedMeasure) return;
  if(!canAdvance()) return;

  game.phase = 'resolving';
  q.tileIndex++;
  if(q.tileIndex === finalIndex()){
    q.maxReachable = finalIndex();
    if(q.qecCharges > 0) q.qecCharges = 0; // used up on any measurement
    q.forcedMeasure = false;
    log('q', `You advance onto the final tile. The gem is guaranteed — collect it next turn.`);
  } else {
    log('q', `You run the algorithm. Now sitting at tile ${q.tileIndex+1}.`);
  }
  render();
  setTimeout(proceedAfterQuantumTurn, TIMING.advancePause);
}

function doMeasure(){
  if(!isQuantumTurn()) return;
  game.phase = 'resolving';
  updateReadouts();
  setMeasureBoxState('opening');

  setTimeout(()=>{
    const q = game.quantum;
    const tile = game.board[q.tileIndex];
    const success = Math.random() < tile.p;

    if(success){
      q.points++;
      setMeasureBoxState('success');
      SFX.win();
      log('q', `You measure… success! (${q.points}/${game.config.gemTarget})`);
    } else {
      setMeasureBoxState('fail');
      SFX.fail();
      log('q', `You measure… no luck this time.`);
    }

    // Any measurement: return to tile 1, clear decoherence, consume QEC, clear cosmic ray.
    q.tileIndex = 0;
    q.maxReachable = finalIndex();
    if(q.qecCharges > 0) q.qecCharges = 0;
    q.forcedMeasure = false;

    render();
    if(checkWin()) return;
    setTimeout(proceedAfterQuantumTurn, TIMING.measureHold);
  }, TIMING.measureOpen);
}

function proceedAfterQuantumTurn(){
  if(game.over) return;
  if(game.config.eventsEnabled){
    game.phase = 'event';
    updateReadouts();
    setTimeout(runEvent, TIMING.eventReveal);
  } else {
    game.phase = 'classical';
    updateReadouts();
    setTimeout(runClassicalTurn, 400);
  }
}

/* ---------- Turn logic: events ---------- */

function runEvent(){
  if(game.eventDeck.length === 0) game.eventDeck = freshEventDeck();
  const card = game.eventDeck.shift();
  const info = EVENT_TEXT[card];
  let title = info.title;
  let desc = info.desc;

  const q = game.quantum;
  const c = game.classical;

  switch(card){
    case 'DECOHERENCE': {
      if(q.qecCharges > 0){
        q.qecCharges--;
        desc = 'Your error correction shield cancels this Decoherence card.';
        SFX.qec();
      } else if(q.maxReachable > 0){
        q.maxReachable--;
        if(q.tileIndex > q.maxReachable) q.tileIndex = q.maxReachable;
        SFX.decoherence();
      } else {
        desc = 'Every tile is already covered — no further effect.';
        SFX.decoherence();
      }
      break;
    }
    case 'COSMIC_RAY':
      q.forcedMeasure = true;
      SFX.cosmicRay();
      break;
    case 'BLUE_SCREEN':
      c.deck = freshClassicalDeck(game.config.deckSize);
      c.revealed = 0;
      c.lastRevealedIndex = -1;
      c.pendingReshuffle = false;
      SFX.blueScreen();
      break;
    case 'QEC':
      q.qecCharges++;
      SFX.qec();
      break;
    case 'EXTRA_RAM':
      c.ram++;
      SFX.extraRam();
      break;
  }

  log('e', `${title} — ${desc}`);
  renderEventCard(title, desc);
  render();
  game.phase = 'classical';
  updateReadouts();
  setTimeout(runClassicalTurn, TIMING.eventHold);
}

/* ---------- Win check ---------- */

function checkWin(){
  if(game.quantum.points >= game.config.gemTarget){
    endGame('quantum');
    return true;
  }
  if(game.classical.points >= game.config.gemTarget){
    endGame('classical');
    return true;
  }
  return false;
}

function endGame(winner){
  game.over = true;
  document.getElementById('win-icon').innerHTML = winner === 'quantum' ? '⚛️' : '🃏';
  document.getElementById('win-title').textContent = winner === 'quantum' ? 'You win!' : 'Your opponent wins.';
  document.getElementById('win-sub').textContent = winner === 'quantum'
    ? 'Grover\u2019s algorithm found its target first.'
    : 'Classical search got lucky before you could measure it out.';
  showScreen('win-screen');
}

/* ---------- Rendering ---------- */

function render(){
  renderGems();
  renderQuantumBoard();
  renderClassicalDeck();
  renderIndicators();
  updateReadouts();
}

function renderGems(){
  const q = game.quantum, c = game.classical, target = game.config.gemTarget;
  document.getElementById('quantum-gems').innerHTML =
    Array.from({length: target}).map((_,i)=>`<span class="gem-slot ${i<q.points?'filled':''}">💎</span>`).join('');
  document.getElementById('classical-gems').innerHTML =
    Array.from({length: target}).map((_,i)=>`<span class="gem-slot ${i<c.points?'filled':''}">💎</span>`).join('');
}

function hexToRgb(hex){
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function mixColor(hexA, hexB, t){
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const r = Math.round(a[0] + (b[0]-a[0])*t);
  const g = Math.round(a[1] + (b[1]-a[1])*t);
  const bl = Math.round(a[2] + (b[2]-a[2])*t);
  return `rgb(${r},${g},${bl})`;
}
function probToColor(p){
  // washed-out blue/white at low probability -> pure quantum blue at high probability
  return mixColor('#e9f5fa', '#005D7E', Math.min(p, 1));
}
function textColorFor(p){
  return p > 0.55 ? '#eafbff' : '#04141c';
}

function renderQuantumBoard(){
  const q = game.quantum;
  const wrap = document.getElementById('quantum-tiles');
  wrap.innerHTML = '';
  game.board.forEach((tile, idx)=>{
    const div = document.createElement('div');
    div.className = 'q-tile';
    if(idx === q.tileIndex) div.classList.add('current');
    if(idx > q.maxReachable) div.classList.add('blocked');
    if(tile.final) div.classList.add('final');

    if(idx > q.maxReachable){
      // blocked styling (from CSS) takes over; leave blank
    } else if(tile.final){
      div.innerHTML = svgDiamond('#0b0e14', 30);
    } else {
      div.style.background = probToColor(tile.p);
      div.style.color = textColorFor(tile.p);
      if(game.config.showProb){
        const pct = Math.round(tile.p*100);
        div.textContent = game.config.probMode === 'rounded' ? tile.label : `${pct}%`;
      }
    }
    wrap.appendChild(div);
  });
}

function renderClassicalDeck(){
  const c = game.classical;
  const wrap = document.getElementById('classical-deck');
  wrap.setAttribute('data-size', game.config.deckSize);
  wrap.innerHTML = '';
  c.deck.forEach((card, idx)=>{
    const outer = document.createElement('div');
    outer.className = 'c-card';
    const face = document.createElement('div');

    if(idx < c.revealed){
      outer.classList.toggle('revealed', idx === c.lastRevealedIndex);
      if(card.type === 'gem'){
        face.className = 'c-card-face gem-face';
        face.innerHTML = svgDiamond('#f2c94c', 22);
      } else {
        face.className = 'c-card-face blank-face fail-face';
        face.innerHTML = svgX('#8b93a7', 16);
      }
    } else {
      face.className = 'c-card-face';
    }
    outer.appendChild(face);
    wrap.appendChild(outer);
  });
}

function renderIndicators(){
  const q = game.quantum, c = game.classical;

  const qecEl = document.getElementById('qec-shield');
  if(q.qecCharges > 0){
    qecEl.style.display = 'block';
    document.getElementById('qec-count').textContent = `×${q.qecCharges}`;
  } else {
    qecEl.style.display = 'none';
  }

  const ramEl = document.getElementById('ram-indicator');
  if(c.ram > 0){
    ramEl.style.display = 'block';
    document.getElementById('ram-count').textContent = c.ram;
    document.getElementById('ram-desc').textContent = `${1+c.ram} draws per turn`;
  } else {
    ramEl.style.display = 'none';
  }
}

function renderLog(){
  const wrap = document.getElementById('log-list');
  const cls = {q:'who-q', c:'who-c', e:'who-e'};
  const label = {q:'YOU', c:'OPPONENT', e:'EVENT'};
  wrap.innerHTML = game.log.slice(-40).map(entry =>
    `<div class="log-entry"><span class="${cls[entry.who]}">[${label[entry.who]}]</span> ${entry.text}</div>`
  ).reverse().join('');
}

function renderEventCard(title, desc){
  const panel = document.getElementById('event-card');
  document.getElementById('event-card-title').textContent = title;
  document.getElementById('event-card-desc').textContent = desc;
  panel.classList.remove('flash');
  void panel.offsetWidth; // restart animation
  panel.classList.add('flash');
}

function setMeasureBoxState(state){
  const inner = document.getElementById('measure-box-inner');
  const icon = document.getElementById('measure-icon');
  inner.classList.remove('opening','success','fail');
  if(state === 'closed'){
    icon.textContent = '?';
    icon.innerHTML = '?';
  } else if(state === 'opening'){
    inner.classList.add('opening');
  } else if(state === 'success'){
    inner.classList.add('success');
    icon.innerHTML = svgDiamond('#f2c94c', 26);
  } else if(state === 'fail'){
    inner.classList.add('fail');
    icon.innerHTML = svgX('#e0637a', 28);
  }
}
function resetMeasureBox(){ setMeasureBoxState('closed'); }

function updateReadouts(){
  const q = game.quantum, c = game.classical;
  const qEl = document.getElementById('quantum-readout');
  const cEl = document.getElementById('classical-readout');
  const advanceBtn = document.getElementById('advance-btn');
  const measureBtn = document.getElementById('measure-btn');
  const measureSub = document.getElementById('measure-sub');
  const advanceSub = advanceBtn.querySelector('.action-sub');

  cEl.textContent = game.phase === 'classical'
    ? 'Your opponent is searching…'
    : c.pendingReshuffle
      ? 'Gem found — deck reshuffles at the start of the next turn.'
      : `Deck has ${c.deck.length - c.revealed} card(s) left before a reshuffle.`;

  const myTurn = isQuantumTurn();
  measureBtn.disabled = !myTurn;

  if(!myTurn){
    advanceBtn.disabled = true;
    advanceSub.textContent = 'Move one tile right';
  } else if(q.forcedMeasure){
    advanceBtn.disabled = true;
    advanceSub.textContent = 'Unavailable — Cosmic Ray forces a measurement';
  } else if(!canAdvance()){
    advanceBtn.disabled = true;
    advanceSub.textContent = game.board[q.tileIndex].final
      ? 'No further tiles — measure to collect'
      : 'Unavailable — next tile is covered by Decoherence';
  } else {
    advanceBtn.disabled = false;
    advanceSub.textContent = 'Move one tile right';
  }

  const tile = game.board[q.tileIndex];
  if(tile.final){
    measureSub.textContent = 'Guaranteed — no roll needed';
  } else if(game.config.showProb){
    measureSub.textContent = game.config.probMode === 'rounded'
      ? `Resolve at ${tile.label}`
      : `Resolve at ${Math.round(tile.p*100)}%`;
  } else {
    measureSub.textContent = 'Try your current odds';
  }

  if(!myTurn){
    qEl.textContent = game.phase === 'classical' ? 'Waiting for your opponent to draw…' : 'Resolving event…';
  } else if(q.forcedMeasure){
    qEl.innerHTML = `<span class="hl">Cosmic ray!</span> You must measure this turn.`;
  } else if(tile.final){
    qEl.innerHTML = `You're on the <span class="hl">final tile</span> — measure to collect your gem, guaranteed.`;
  } else {
    qEl.textContent = 'Advance the algorithm, or measure to try your luck.';
  }
}

/* ---------- Screens & setup ---------- */

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function readConfigFromSetup(){
  return {
    gemTarget: parseInt(document.getElementById('gem-target').value, 10),
    deckSize: parseInt(document.querySelector('#deck-size-group .pill.active').dataset.value, 10),
    probMode: document.querySelector('#prob-mode-group .pill.active').dataset.value,
    showProb: document.getElementById('show-prob-toggle').classList.contains('active'),
    eventsEnabled: document.getElementById('events-toggle').classList.contains('active')
  };
}

function setSoundEnabled(on){
  soundOn = on;
  SFX.setEnabled(on);
  const setupToggle = document.getElementById('sound-toggle');
  setupToggle.classList.toggle('active', on);
  setupToggle.setAttribute('aria-checked', on);
  const muteBtn = document.getElementById('mute-btn');
  muteBtn.textContent = on ? '🔊' : '🔇';
  muteBtn.setAttribute('aria-label', on ? 'Mute sound' : 'Unmute sound');
  muteBtn.title = on ? 'Mute sound' : 'Unmute sound';
}

function wireSetupScreen(){
  document.querySelectorAll('.step-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const input = document.getElementById(btn.dataset.target);
      const step = parseInt(btn.dataset.step, 10);
      const min = parseInt(input.min,10), max = parseInt(input.max,10);
      input.value = Math.min(max, Math.max(min, parseInt(input.value,10) + step));
    });
  });

  document.querySelectorAll('#deck-size-group .pill').forEach(p=>{
    p.addEventListener('click', ()=>{
      document.querySelectorAll('#deck-size-group .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
    });
  });
  document.querySelectorAll('#prob-mode-group .pill').forEach(p=>{
    p.addEventListener('click', ()=>{
      document.querySelectorAll('#prob-mode-group .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
    });
  });
  ['show-prob-toggle','events-toggle','sound-toggle'].forEach(id=>{
    const el = document.getElementById(id);
    el.addEventListener('click', ()=>{
      el.classList.toggle('active');
      el.setAttribute('aria-checked', el.classList.contains('active'));
      if(id === 'sound-toggle'){
        setSoundEnabled(el.classList.contains('active'));
      }
    });
  });

  document.getElementById('start-btn').addEventListener('click', ()=>{
    SFX.init(); // unlock audio on this user gesture
    const config = readConfigFromSetup();
    document.getElementById('deck-size-label').textContent = `N = ${config.deckSize}`;
    document.getElementById('target-label').textContent = `First to ${config.gemTarget}`;
    document.getElementById('event-card-title').textContent = 'No event yet';
    document.getElementById('event-card-desc').textContent = 'The first event card will appear here once drawn.';
    document.getElementById('event-card').classList.remove('flash');
    newGame(config);
    showScreen('game-screen');
    game.phase = 'classical';
    updateReadouts();
    setTimeout(runClassicalTurn, 400);
  });
}

function wireGameScreen(){
  document.getElementById('advance-btn').addEventListener('click', doAdvance);
  document.getElementById('measure-btn').addEventListener('click', doMeasure);
  document.getElementById('new-game-btn').addEventListener('click', ()=> showScreen('setup-screen'));
  document.getElementById('play-again-btn').addEventListener('click', ()=> showScreen('setup-screen'));
  document.getElementById('mute-btn').addEventListener('click', ()=> setSoundEnabled(!soundOn));
}

wireSetupScreen();
wireGameScreen();

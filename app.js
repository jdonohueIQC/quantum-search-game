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

/* STATE mode's decoherence model: each hit shrinks a "radius" (amplitude)
   multiplicatively by a shrink factor, never reaching exactly zero. The
   measured probability blends the ordinary (rotation-only) Grover
   probability with a uniform 1/N guess, weighted by radius² — consistent
   with a radius of 0 being exactly the maximally-mixed state (identity/N).
   theta and the rotation angle phi are unaffected by decoherence, which
   is what lets overshoot keep happening even under heavy decoherence.

   Two selectable shrink models (see README.md "Balance" for how both
   were tuned by Monte Carlo):
   - FIXED: a flat 0.8 regardless of N.
   - VARIABLE (default): a per-N value chosen so State Simulator's
     Normal-mode win rate lands within ~1 point of Board Game's
     Normal-mode win rate at that same N. Small N needs much heavier
     damping than large N to match, because Board Game's advantage over
     a random guess shrinks fast at small N while State Simulator's
     continuous-rotation peak stays disproportionately strong there. */
const STATE_SHRINK_FIXED = 0.8;
const STATE_SHRINK_VARIABLE = { 4: 0.4, 12: 0.4, 30: 0.8, 100: 0.97 };

function stateShrinkFactor(config){
  return config.decoherenceModel === 'fixed' ? STATE_SHRINK_FIXED : STATE_SHRINK_VARIABLE[config.deckSize];
}

function stateProbability(N, k, decoherenceCount, shrinkFactor){
  const theta = Math.asin(1/Math.sqrt(N));
  const phi = (2*k+1)*theta;
  const pureP = Math.pow(Math.sin(phi), 2);
  const radius = Math.pow(shrinkFactor, decoherenceCount); // amplitude-like factor
  const w = radius*radius;                          // probability-like weight
  const p = w*pureP + (1-w)/N;
  return { p, phi, radius };
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

/* ---------- Normal-mode event deck: pick ONE of the three lines below ----------
   Simulated quantum win rate at N=12 / N=30 / N=100 (first to 3 gems, 30k trials):
     Decoherence-heavy deck -> ~50% / ~87% / ~98% (current default)
       8 Decoherence, 6 QEC, 3 Extra RAM, 2 Cosmic Ray, 1 Blue Screen,
       4 Neutral (does nothing — pure misdirection, so a quiet turn
       doesn't tell you Decoherence is off the table). Decoherence
       outnumbering QEC 8-to-6 makes the shield feel earned rather than
       automatic, without hurting the balance at all — numbers land
       within noise of the older QEC-heavy tuned deck below.
     tuned deck    -> ~50% / ~86% / ~97% — QEC-heavy version (8/8/3/4/1),
       no Neutral cards, kept here for comparison.
     original deck -> ~35% / ~72% / ~92% (opponent favored throughout) —
       the very first deck used (8/5/6/4/1). It was reported as feeling
       slightly quantum-favored in actual play, but simulation puts it
       the other way; neither "Blue Screen also clears RAM" (+1-2 points,
       tested) nor "player chooses when to arm QEC" (+0-3 points, tested)
       closes that gap. Likely just limited-sample human playtesting
       rather than a hidden rule mismatch.
   Swap which line is commented to compare any of the three live. */
const EVENT_DECK_NORMAL = { DECOHERENCE:8, QEC:6, EXTRA_RAM:3, COSMIC_RAY:2, BLUE_SCREEN:1, NEUTRAL:4 }; // Decoherence-heavy deck (current default)
// const EVENT_DECK_NORMAL = { DECOHERENCE:8, QEC:8, EXTRA_RAM:3, COSMIC_RAY:4, BLUE_SCREEN:1 }; // tuned deck (QEC-heavy, no Neutral)
// const EVENT_DECK_NORMAL = { DECOHERENCE:8, QEC:5, EXTRA_RAM:6, COSMIC_RAY:4, BLUE_SCREEN:1 }; // original deck

/* ---------- Hard-mode event deck ----------
   Punishes the quantum player directly through the same 24-card event
   deck mechanic — no separate RAM-handicap stat needed. Compared to the
   normal deck, QEC is nearly removed (1 card — "harder to come by") and
   Extra RAM is roughly tripled (10 cards — "RAM is cheap"), with
   Decoherence and Cosmic Ray unchanged and Blue Screen still capped at 1.
   One flat deck works for every board size (same as normal mode):
   simulated quantum win rate is ~14% at N=4, ~20% at N=12 (opponent
   favored), ~53% at N=30 (even), ~80% at N=100 (quantum favored) —
   30k-trial Monte Carlo, first to 3 gems. See README.md "Balance". */
const EVENT_DECK_HARD = { DECOHERENCE:8, QEC:1, EXTRA_RAM:10, COSMIC_RAY:4, BLUE_SCREEN:1 };

function freshEventDeck(hardMode){
  const composition = hardMode ? EVENT_DECK_HARD : EVENT_DECK_NORMAL;
  const cards = [];
  for(const type in composition){
    for(let i=0;i<composition[type];i++) cards.push(type);
  }
  return shuffle(cards);
}

const EVENT_TEXT = {
  DECOHERENCE: { title: 'Decoherence', desc: 'The right-most open tile is covered. Progress can\u2019t pass it until you next measure.' },
  COSMIC_RAY: { title: 'Cosmic Ray', desc: 'You must measure on your next turn.' },
  BLUE_SCREEN: { title: 'Blue Screen', desc: 'Your opponent\u2019s entire deck is reshuffled from scratch (it keeps any Extra RAM).' },
  QEC: { title: 'Quantum Error Correction', desc: 'You gain a shield that cancels the next Decoherence drawn.' },
  EXTRA_RAM: { title: 'Extra RAM', desc: 'Your opponent can now flip one additional card per turn.' },
  NEUTRAL: { title: 'Neutral', desc: 'Nothing happens this round.' }
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
  const T = ROUNDED_BOARDS[config.deckSize].length; // shared "final/peak" checkpoint index, used by STATE mode too
  game = {
    config,
    board,
    quantum: {
      tileIndex: 0,
      maxReachable: board.length - 1,
      points: 0,
      qecCharges: 0,
      forcedMeasure: false,
      // STATE mode only:
      k: 0,               // current iteration count (unbounded — allows overshoot)
      decoherenceCount: 0 // STATE mode only: number of uncancelled Decoherence hits (shrinks the circle by 3/4 each time)
    },
    classical: {
      deck: freshClassicalDeck(config.deckSize),
      revealed: 0,
      lastRevealedIndex: -1,
      pendingReshuffle: false,
      points: 0,
      ram: 0 // from Extra RAM event cards — discarded when a gem is scored
    },
    eventDeck: config.eventsEnabled ? freshEventDeck(config.hardMode) : [],
    phase: 'classical', // classical -> quantum -> event -> classical... ('resolving' is transient, disables input)
    over: false,
    log: []
  };
  render();
  resetMeasureBox();
}

function finalIndex(){ return game.board.length - 1; } // TILES mode
function isStateMode(){ return game.config.boardMode === 'state'; }

function log(who, text){
  game.log.push({who, text});
  renderLog();
  updateHeaderLogEntry(who, text);
}

function updateHeaderLogEntry(who, text){
  if(game.over) return; // endGame() owns the header slot once the game is decided
  document.getElementById('header-log-dot').style.display = '';
  const el = document.getElementById('header-log-entry');
  el.className = `header-log-entry who-${who}`;
  el.textContent = text;
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
  if(isStateMode()) doAdvanceState(); else doAdvanceTiles();
}
function doMeasure(){
  if(isStateMode()) doMeasureState(); else doMeasureTiles();
}

function doAdvanceTiles(){
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

function doMeasureTiles(){
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

/* ---------- Turn logic: quantum player, STATE mode ----------
   k is an unbounded iteration counter — no forced "final" stage and no
   cap on advancing, so the real Grover probability is free to decline
   again past its peak (overshoot). Decoherence no longer touches k or
   the rotation angle at all; it only shrinks the state's "radius" (see
   stateProbability), which is a more physical model than capping tiles —
   see README.md "Balance" / "Board style" for the full rationale. */

function doAdvanceState(){
  if(!isQuantumTurn()) return;
  const q = game.quantum;
  if(q.forcedMeasure) return;

  game.phase = 'resolving';
  q.k++;
  log('q', `You run the algorithm. Iteration ${q.k}.`);
  render();
  setTimeout(proceedAfterQuantumTurn, TIMING.advancePause);
}

function doMeasureState(){
  if(!isQuantumTurn()) return;
  game.phase = 'resolving';
  updateReadouts();
  setMeasureBoxState('opening');

  setTimeout(()=>{
    const q = game.quantum;
    const N = game.config.deckSize;
    const { p } = stateProbability(N, q.k, q.decoherenceCount, stateShrinkFactor(game.config));
    const success = Math.random() < p;

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

    // Show the vector collapsing onto |GEM⟩ or |X⟩ at full radius immediately,
    // before resetting the underlying state for the next cycle.
    renderPlotCollapse(success);
    renderGems();

    if(checkWin()) return;
    setTimeout(()=>{
      // Any measurement fully restores the original state: iteration 0,
      // full-size circle, QEC and Cosmic Ray charges cleared.
      q.k = 0;
      q.decoherenceCount = 0;
      q.qecCharges = 0;
      q.forcedMeasure = false;
      render();
      proceedAfterQuantumTurn();
    }, TIMING.measureHold);
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
  if(game.eventDeck.length === 0) game.eventDeck = freshEventDeck(game.config.hardMode);
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
      } else if(isStateMode()){
        q.decoherenceCount++;
        const radius = Math.pow(stateShrinkFactor(game.config), q.decoherenceCount);
        desc = `The state's circle shrinks to ${Math.round(radius*100)}% radius (${Math.round(radius*radius*100)}% of its original weight).`;
        SFX.decoherence();
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
    case 'NEUTRAL':
      SFX.neutral();
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
  updateReadouts(); // lock the action buttons

  const panel = document.getElementById('event-card');
  const resultClass = winner === 'quantum' ? 'win' : 'lose';
  const title = winner === 'quantum' ? 'YOU WIN' : 'YOU LOSE';
  const desc = winner === 'quantum'
    ? 'Grover\u2019s algorithm found its target first.'
    : 'Classical search got lucky before you could measure it out.';

  panel.className = `event-card game-over ${resultClass}`;
  panel.innerHTML = `
    <div class="game-over-title">${title}</div>
    <div class="event-card-desc">${desc}</div>
    <button id="play-again-btn" class="primary-btn game-over-btn">Start new game</button>
  `;
  document.getElementById('play-again-btn').addEventListener('click', ()=> showScreen('setup-screen'));
  document.querySelector('#event-panel .quadrant-head').textContent = 'Result';

  const headerEntry = document.getElementById('header-log-entry');
  headerEntry.textContent = title;
  headerEntry.className = `header-log-entry ${winner === 'quantum' ? 'result-win' : 'result-lose'}`;

  const newGameBtn = document.getElementById('new-game-btn');
  newGameBtn.classList.add('result-btn', winner === 'quantum' ? 'result-btn-win' : 'result-btn-lose');
}

/* ---------- Rendering ---------- */

function render(){
  renderGems();
  if(isStateMode()) renderQuantumState(); else renderQuantumBoard();
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
  // washed-out red/white at low probability -> pure quantum red at high probability
  return mixColor('#fbe9ec', '#96172E', Math.min(p, 1));
}
function textColorFor(p){
  return p > 0.55 ? '#fdf1f2' : '#04141c';
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

const PLOT_OUTER_R = 80;

function renderQuantumState(){
  const q = game.quantum;
  const N = game.config.deckSize;
  const { p, phi, radius } = stateProbability(N, q.k, q.decoherenceCount, stateShrinkFactor(game.config));

  const square = document.getElementById('state-square');
  square.style.background = probToColor(p);

  const pctEl = document.getElementById('state-pct');
  pctEl.style.color = textColorFor(p);
  pctEl.textContent = game.config.showProb ? `${Math.round(p*100)}%` : '';

  document.getElementById('state-iteration').textContent = `Iteration ${q.k}`;

  // ---- Cartesian plot ----
  const r = PLOT_OUTER_R * radius;
  document.getElementById('plot-mask').setAttribute('r', r);
  document.getElementById('plot-unit-outline').setAttribute('r', r);

  const shield = document.getElementById('plot-shield');
  if(q.qecCharges > 0){
    shield.style.visibility = 'visible';
    shield.setAttribute('r', r + 4);
  } else {
    shield.style.visibility = 'hidden';
  }

  const svgAngle = -(phi * 180 / Math.PI); // negate: SVG's Y-down convention flips rotation sense
  document.getElementById('plot-vector-group').setAttribute('transform', `rotate(${svgAngle}) scale(${radius})`);
  const tip = document.getElementById('plot-vector-tip');
  tip.style.fill = '';
  tip.setAttribute('r', 6);
}

// Animates the vector snapping onto |GEM⟩ (success) or |X⟩ (fail) at full
// radius, and the circle back to full size — called right when a STATE
// mode measurement resolves, before the underlying state is reset.
function renderPlotCollapse(success){
  const targetSvgAngle = success ? -90 : 0;
  document.getElementById('plot-vector-group').setAttribute('transform', `rotate(${targetSvgAngle}) scale(1)`);
  const tip = document.getElementById('plot-vector-tip');
  tip.style.fill = success ? '#f2c94c' : '#e0637a';
  tip.setAttribute('r', 8);
  document.getElementById('plot-mask').setAttribute('r', PLOT_OUTER_R);
  document.getElementById('plot-unit-outline').setAttribute('r', PLOT_OUTER_R);
  document.getElementById('plot-shield').style.visibility = 'hidden';
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
    qecEl.style.visibility = 'visible';
    document.getElementById('qec-count').textContent = `×${q.qecCharges}`;
  } else {
    qecEl.style.visibility = 'hidden';
  }

  const cosmicEl = document.getElementById('cosmic-indicator');
  cosmicEl.style.visibility = q.forcedMeasure ? 'visible' : 'hidden';

  const decoEl = document.getElementById('decoherence-indicator');
  if(isStateMode() && q.decoherenceCount > 0){
    const radius = Math.pow(stateShrinkFactor(game.config), q.decoherenceCount);
    decoEl.style.visibility = 'visible';
    document.getElementById('decoherence-count').textContent = `×${q.decoherenceCount}`;
    document.getElementById('decoherence-desc').textContent = `circle at ${Math.round(radius*100)}% radius`;
  } else {
    decoEl.style.visibility = 'hidden';
  }

  const ramEl = document.getElementById('ram-indicator');
  if(c.ram > 0){
    ramEl.style.visibility = 'visible';
    document.getElementById('ram-count').textContent = c.ram;
    document.getElementById('ram-desc').textContent = `${1+c.ram} draws per turn`;
  } else {
    ramEl.style.visibility = 'hidden';
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
  measureBtn.classList.toggle('forced', myTurn && q.forcedMeasure);

  if(isStateMode()) updateReadoutsState(myTurn); else updateReadoutsTiles(myTurn);
}

function updateReadoutsTiles(myTurn){
  const q = game.quantum;
  const qEl = document.getElementById('quantum-readout');
  const advanceBtn = document.getElementById('advance-btn');
  const measureSub = document.getElementById('measure-sub');
  const advanceSub = advanceBtn.querySelector('.action-sub');

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

function updateReadoutsState(myTurn){
  const q = game.quantum;
  const qEl = document.getElementById('quantum-readout');
  const advanceBtn = document.getElementById('advance-btn');
  const measureSub = document.getElementById('measure-sub');
  const advanceSub = advanceBtn.querySelector('.action-sub');
  const N = game.config.deckSize;
  const { p } = stateProbability(N, q.k, q.decoherenceCount, stateShrinkFactor(game.config));
  const overshooting = q.k > 0 && groverProbability(N, q.k) < groverProbability(N, q.k - 1);

  if(!myTurn){
    advanceBtn.disabled = true;
    advanceSub.textContent = 'Rotate the state further';
  } else if(q.forcedMeasure){
    advanceBtn.disabled = true;
    advanceSub.textContent = 'Unavailable — Cosmic Ray forces a measurement';
  } else {
    advanceBtn.disabled = false;
    advanceSub.textContent = 'Rotate the state further';
  }

  if(game.config.showProb){
    measureSub.textContent = `Resolve at ${Math.round(p*100)}%`;
  } else {
    measureSub.textContent = 'Try your current odds';
  }

  if(!myTurn){
    qEl.textContent = game.phase === 'classical' ? 'Waiting for your opponent to draw…' : 'Resolving event…';
  } else if(q.forcedMeasure){
    qEl.innerHTML = `<span class="hl">Cosmic ray!</span> You must measure this turn.`;
  } else if(overshooting){
    qEl.textContent = "You've overshot the peak — probability is dropping again.";
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
  const mode = document.querySelector('#game-mode-group .pill.active').dataset.value;
  return {
    gemTarget: parseInt(document.getElementById('gem-target').value, 10),
    deckSize: parseInt(document.querySelector('#deck-size-group .pill.active').dataset.value, 10),
    boardMode: document.querySelector('#board-style-group .pill.active').dataset.value,
    probMode: document.querySelector('#prob-mode-group .pill.active').dataset.value,
    decoherenceModel: document.querySelector('#decoherence-model-group .pill.active').dataset.value,
    showProb: document.getElementById('show-prob-toggle').classList.contains('active'),
    eventsEnabled: mode !== 'no-events',
    hardMode: mode === 'hard',
    mode: mode
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

const GAME_MODE_DESCRIPTIONS = {
  'no-events': 'See what the quantum advantage is in a perfect world.',
  'normal': 'Deal with decoherence and other challenges for quantum computers.',
  'hard': 'Quantum error correction is harder to come by, and RAM is cheap.'
};

const BOARD_STYLE_DESCRIPTIONS = {
  'tiles': 'Mimics board-game mechanics in a race-to-the-finish.',
  'state': 'Simulates the quantum state rotations and decoherence mechanisms in real implementations of Grover\u2019s algorithm.'
};

const DECOHERENCE_MODEL_DESCRIPTIONS = {
  'fixed': 'Decoherence is an amplitude-damping channel that shrinks the amplitude by 1/5 on each instance.',
  'variable': 'The amount of decoherence varies with the database size to preserve the gameplay experience.'
};

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
  document.querySelectorAll('#board-style-group .pill').forEach(p=>{
    p.addEventListener('click', ()=>{
      document.querySelectorAll('#board-style-group .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      const isState = p.dataset.value === 'state';
      document.getElementById('prob-mode-field').style.display = isState ? 'none' : '';
      document.getElementById('board-style-note').textContent = BOARD_STYLE_DESCRIPTIONS[p.dataset.value];
      document.getElementById('decoherence-model-field').style.display = isState ? '' : 'none';
    });
  });
  document.querySelectorAll('#prob-mode-group .pill').forEach(p=>{
    p.addEventListener('click', ()=>{
      document.querySelectorAll('#prob-mode-group .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
    });
  });
  document.querySelectorAll('#decoherence-model-group .pill').forEach(p=>{
    p.addEventListener('click', ()=>{
      document.querySelectorAll('#decoherence-model-group .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      document.getElementById('decoherence-model-note').textContent = DECOHERENCE_MODEL_DESCRIPTIONS[p.dataset.value];
    });
  });
  document.querySelectorAll('#game-mode-group .pill').forEach(p=>{
    p.addEventListener('click', ()=>{
      document.querySelectorAll('#game-mode-group .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      document.getElementById('game-mode-note').textContent = GAME_MODE_DESCRIPTIONS[p.dataset.value];
    });
  });
  ['show-prob-toggle','sound-toggle'].forEach(id=>{
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
    const modeLabel = document.getElementById('game-mode-label');
    const modeText = { 'no-events': 'No Events', 'normal': 'Normal', 'hard': 'Hard Mode' };
    modeLabel.textContent = modeText[config.mode];
    modeLabel.className = `game-mode-label mode-${config.mode}`;
    document.getElementById('quantum-tiles').style.display = config.boardMode === 'state' ? 'none' : '';
    document.getElementById('quantum-state').style.display = config.boardMode === 'state' ? 'flex' : 'none';
    const headerEntry = document.getElementById('header-log-entry');
    headerEntry.textContent = '';
    headerEntry.className = 'header-log-entry';
    document.getElementById('header-log-dot').style.display = 'none';
    document.getElementById('new-game-btn').className = 'ghost-btn';
    resetEventPanel();
    newGame(config);
    showScreen('game-screen');
    game.phase = 'classical';
    updateReadouts();
    setTimeout(runClassicalTurn, 400);
  });
}

function resetEventPanel(){
  document.querySelector('#event-panel .quadrant-head').textContent = 'Latest event';
  const panel = document.getElementById('event-card');
  panel.className = 'event-card';
  panel.innerHTML = `
    <div class="event-card-title" id="event-card-title">No event yet</div>
    <div class="event-card-desc" id="event-card-desc">The first event card will appear here once drawn.</div>
  `;
}

function wireGameScreen(){
  document.getElementById('advance-btn').addEventListener('click', doAdvance);
  document.getElementById('measure-btn').addEventListener('click', doMeasure);
  document.getElementById('new-game-btn').addEventListener('click', ()=> showScreen('setup-screen'));
  document.getElementById('mute-btn').addEventListener('click', ()=> setSoundEnabled(!soundOn));
}

wireSetupScreen();
wireGameScreen();

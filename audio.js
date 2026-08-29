/* ============================================================
   Hadamard's Hoard — sound effects
   All sounds are synthesized with the Web Audio API, so there
   are no binary assets to host or load. Call SFX.init() from a
   user-gesture handler (e.g. the "Begin search" click) before
   any other SFX call, to satisfy browser autoplay policies.
   ============================================================ */

const SFX = (function(){
  let ctx = null;
  let enabled = true;

  function ensureCtx(){
    if(!ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      ctx = new AC();
    }
    if(ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, duration, type, peak){
    if(!enabled) return;
    const c = ensureCtx();
    if(!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, c.currentTime + start);
    gain.gain.setValueAtTime(0.0001, c.currentTime + start);
    gain.gain.linearRampToValueAtTime(peak || 0.15, c.currentTime + start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(c.currentTime + start);
    osc.stop(c.currentTime + start + duration + 0.03);
  }

  function sweep(freqFrom, freqTo, start, duration, type, peak){
    if(!enabled) return;
    const c = ensureCtx();
    if(!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqFrom, c.currentTime + start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), c.currentTime + start + duration);
    gain.gain.setValueAtTime(0.0001, c.currentTime + start);
    gain.gain.linearRampToValueAtTime(peak || 0.15, c.currentTime + start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(c.currentTime + start);
    osc.stop(c.currentTime + start + duration + 0.03);
  }

  function noiseBurst(start, duration, peak){
    if(!enabled) return;
    const c = ensureCtx();
    if(!c) return;
    const bufferSize = Math.floor(c.sampleRate * duration);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++){
      data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.setValueAtTime(peak || 0.12, c.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + duration);
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(c.currentTime + start);
  }

  return {
    setEnabled(v){ enabled = v; },
    init(){ ensureCtx(); },

    // A quick, dry snap — like a card being flipped onto a table.
    cardFlip(){
      noiseBurst(0, 0.05, 0.10);
      sweep(1400, 500, 0, 0.06, 'square', 0.05);
    },

    // Bright ascending chime — a successful measurement.
    win(){
      tone(523.25, 0,    0.14, 'triangle', 0.16);
      tone(659.25, 0.10, 0.14, 'triangle', 0.16);
      tone(783.99, 0.20, 0.26, 'triangle', 0.18);
    },

    // Classic descending "womp womp" — a failed measurement.
    fail(){
      sweep(300, 190, 0,    0.30, 'sawtooth', 0.14);
      sweep(260, 150, 0.32, 0.36, 'sawtooth', 0.14);
    },

    // Eerie downward glissando — Decoherence.
    decoherence(){
      sweep(600, 90, 0, 0.55, 'sawtooth', 0.11);
      tone(90, 0.5, 0.18, 'sine', 0.10);
    },

    // Sharp electronic zap — Cosmic Ray.
    cosmicRay(){
      noiseBurst(0, 0.04, 0.14);
      sweep(2400, 3200, 0, 0.05, 'square', 0.1);
      tone(2000, 0.06, 0.09, 'square', 0.12);
    },

    // Old-computer error beep — Blue Screen.
    blueScreen(){
      tone(300, 0,    0.16, 'square', 0.14);
      tone(220, 0.18, 0.22, 'square', 0.14);
    },

    // Bright two-note "shield up" chime — Quantum Error Correction.
    qec(){
      tone(700,  0,    0.10, 'sine', 0.13);
      tone(1050, 0.11, 0.16, 'sine', 0.13);
    },

    // Rising power-up arpeggio — Extra RAM.
    extraRam(){
      tone(440, 0,    0.09, 'triangle', 0.13);
      tone(660, 0.10, 0.09, 'triangle', 0.13);
      tone(880, 0.20, 0.16, 'triangle', 0.15);
    }
  };
})();

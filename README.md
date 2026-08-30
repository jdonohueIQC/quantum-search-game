# Hadamard's Hoard — Browser Simulator

A single-player digital adaptation of *Hadamard's Hoard*, the quantum-search
card/board game from the University of Waterloo's Institute for Quantum
Computing (IQC Scientific Outreach). You always play the **quantum search**;
the **classical search** is an automated dealer.

Live rules reference: the original game's facilitator instructions, turn
order, and probability table are in `Quantum-Search-Game-Boards-Pieces-v4.pdf`.

## Running it

This is a static site — no build step, no dependencies.

- **Locally**: open `index.html` in a browser, or run a tiny local server
  (`python3 -m http.server`) and visit it.
- **GitHub Pages**: push this folder to a repo, then in
  **Settings → Pages**, set the source to the branch/root containing these
  files. No workflow file needed.

## What's configurable at setup

| Setting | Options | Default |
|---|---|---|
| Gems to win | 1–10 | 3 |
| Database size (N) | 4, 12, 30, 100 | 12 |
| Board style | Tiles / State | Tiles |
| Probability model | Rounded (dice-friendly) / Real Grover formula | Rounded (Tiles only — State always uses the real formula) |
| Show probabilities | On/Off | On |
| Sound | On/Off | On |
| Game mode | No events / Normal / Hard | Normal |

## Board style: Board Game vs. State Simulator

**Board Game** is everything described above and unchanged: a fixed row
of discrete, capped checkpoints, ending in a guaranteed-win final tile.

**State Simulator** shows the actual quantum state as a rotating 2D
vector — closer to the geometric proof of Grover's algorithm — rather
than a row of tiles. The classical opponent, its deck, and the event deck
are all completely unaffected by this toggle.

Two same-sized boxes sit side by side: the probability square (as
before, same color gradient) and a new Cartesian plot. The plot draws
the unit circle with the Y-axis labeled |GEM⟩ and the X-axis labeled |X⟩
(no tick marks, per spec), and a vector starting at angle θ from the
X-axis, where `sin(θ) = 1/√N`. Each "run the algorithm" click rotates the
vector by `2θ` counter-clockwise (`φ = (2k+1)θ` after k iterations), and
the measurement probability is `sin²(φ)` — exactly Grover's formula, with
no artificial ceiling, so you can keep rotating straight through the peak
and watch probability genuinely decline again. On a measurement, the
vector visibly collapses onto |GEM⟩ (success, gold) or |X⟩ (failure,
red) at full length before the whole state resets to its starting
position for the next cycle.

**Decoherence** now damages the *state* rather than blocking a tile —
a more physical model, worked out and confirmed in conversation rather
than guessed at:

- Each uncancelled Decoherence hit multiplies a radius factor `r` by
  `3/4` (so `r = 0.75^d` after `d` hits) — visualized as the unit circle
  physically shrinking, with the space it gives up filled in solid red
  (the "lost" shell). The vector's own length shrinks by the same factor,
  so it's drawn at `r · sin(φ)` / `r · cos(φ)` rather than unit length.
- The measured probability blends the ordinary rotation-only probability
  with a uniform random guess, weighted by `r²`: `P = r²·sin²(φ) + (1−r²)/N`.
  This is the only formula consistent with two hard requirements: `r → 0`
  must give exactly `1/N` (the maximally-mixed state — a full identity
  density matrix has a uniform `1/N` chance of matching on measurement),
  and probability must relate to the drawn radius the way it relates to
  amplitude in general (i.e. via a square), which is what makes shrinking
  the circle an amplitude-damping-style operation rather than an
  arbitrary visual effect.
  `r` never reaches exactly zero, so a completely "identity" state is
  only approached in the limit, never hit outright — same as physical
  decoherence.
- A "🌀 Decoherence ×N" counter (same status-chip style as the QEC
  shield, and same TILES-mode chip element, reused) shows the current
  radius as a percentage.
- **QEC still works exactly the same as in Board Game mode** — arm a
  shield, cancel the next Decoherence outright (the radius doesn't
  shrink further that time) — visualized as a dashed blue ring around
  the current circle boundary while armed.
- Rotation itself (`φ`, and therefore overshoot) is completely
  unaffected by Decoherence — only the radius/weighting changes. That's
  what makes over-rotating still meaningful even under heavy
  decoherence, per the original design goal.
- Any measurement (success or fail) fully restores the state: iteration
  back to 0, circle back to full radius, QEC/Cosmic Ray cleared — same
  reset rule as everywhere else in the game.

If you'd rather use a linear model instead (each hit loses a fixed
fraction of *excess* probability over `1/N`, capped at zero after a fixed
number of hits, no radius-squaring) that's a straightforward swap inside
`stateProbability()` in `app.js` — the rest of the rendering code only
consumes `{ p, phi, radius }` from that one function, so changing the
formula there is enough.

## Balance

**A/B/C switch**: `app.js` has three `EVENT_DECK_NORMAL` lines right next
to each other — two commented out — so you can flip between them by
moving which line is commented, no other changes needed:

| Deck | Composition | N=12 / N=30 / N=100 |
|---|---|---|
| Decoherence-heavy (**default**) | 8 Decoherence, 6 QEC, 3 Extra RAM, 2 Cosmic Ray, 1 Blue Screen, 4 Neutral | ~50% / ~87% / ~98% |
| Tuned (QEC-heavy) | 8 Decoherence, 8 QEC, 3 Extra RAM, 4 Cosmic Ray, 1 Blue Screen | ~50% / ~86% / ~97% |
| Original | 8 Decoherence, 5 QEC, 6 Extra RAM, 4 Cosmic Ray, 1 Blue Screen | ~35% / ~72% / ~92% |

The current default swaps QEC-heavy for Decoherence-heavy (8 vs. 6, rather
than 8 vs. 8) and adds 4 "Neutral" cards that do nothing — both purely
for feel rather than balance, since the numbers land within simulation
noise of the older tuned deck: Decoherence outnumbering QEC makes a
shield feel like it's covering you against genuine risk rather than a
near-certainty, and the Neutral cards add misdirection (a quiet turn no
longer means "Decoherence wasn't in the deck this time," since it could
just as easily have been a Neutral draw).

Worth noting on the **original deck**: it was reported as feeling
slightly quantum-favored at N=12 in actual play, but simulation puts it
at ~35% (opponent favored). I checked two possible explanations — whether
Blue Screen also clearing the opponent's stacked Extra RAM would close
the gap (it doesn't: +1-2 points, tested at 25k trials), and whether
letting the quantum player choose *when* to arm Quantum Error Correction
(immediately, or deferred until their next reset, for guaranteed
full-cycle coverage instead of whatever's left of the current cycle)
would help (it's a real but modest edge: roughly +0-3 points, not enough
to flip anything). Neither explains the discrepancy; my best guess is
limited-sample human playtesting rather than a hidden rule mismatch, but
the switch is there if you want to compare them side-by-side yourself.
QEC currently always arms immediately in the actual game (delayed-arm
isn't implemented as a player choice, just measured in the simulator).

The event deck compositions were tuned against a Monte Carlo simulator
rather than by feel — 15,000–30,000 simulated full races per
configuration, with the quantum player following a near-optimal fixed
policy (always advance toward whichever tile minimizes expected
turns-per-gem, i.e. `(iterations+1) / p(iterations)`, recomputed on the
fly if Decoherence caps how far it can reach). That's worth knowing if
you ever change the board's tile probabilities or the gem target — the
tuning below is specific to the current rounded boards and a target of
3 gems, and would need re-tuning if those change.

**Why N=12 needs help but N=30/100 don't**: even with no events at all,
the quantum board's structure already gives the quantum player asymptotically
increasing odds as N grows (roughly 1.6× fewer turns-per-gem at N=12, 3.2×
at N=30, 6.7× at N=100, in the "no events" baseline) — which is the game's
whole point, but it means a single flat event deck that's fair at N=12 will
still look fair-ish at N=30 and only mildly favor the quantum player at
N=100, undercutting the "significant"/"massive" edges you asked for. It
also means a deck that's already tilted toward the opponent at N=12 tilts
even further at higher N, compounding in the wrong direction. Conveniently,
one flat 24-card composition turned out to hit all three targets at once
(see below) without needing per-size tuning for normal mode.

**Normal mode** — one 24-card deck, used at every N (the current default,
Decoherence-heavy with Neutral cards — see the A/B/C switch above for
the alternatives). Simulated quantum win rate (first to 3 gems):

| N | Quantum win rate |
|---|---|
| 4 | ~28% (opponent favored — not a design target, just how the small board falls out) |
| 12 | ~50% (balanced) |
| 30 | ~87% (significant quantum edge) |
| 100 | ~98% (massive quantum edge) |

**Hard mode** — corrected version. My first attempt at this (a permanent
RAM head start for the opponent, plus a QEC-heavy event deck to keep
N=12 from becoming a total lock) had it backwards: it made the *event
deck* friendlier to the quantum player than normal mode, which defeats
the point of a mode meant to punish the quantum player. Scrapped that
RAM-handicap mechanic entirely — hard mode is now just a second 24-card
event deck, same mechanic as normal mode, with QEC nearly removed and
Extra RAM roughly tripled:

**8 Decoherence, 1 QEC, 10 Extra RAM, 4 Cosmic Ray, 1 Blue Screen**

Decoherence and Cosmic Ray (both purely anti-quantum) are unchanged from
the normal deck; QEC (quantum's only defense) drops from 6–8 cards to 1;
Extra RAM (the opponent's only offense) goes from 3 to 10. Blue Screen
stays capped at 1. One flat deck for every board size, matching how
normal mode already worked:

| N | Quantum win rate (hard mode) |
|---|---|
| 4 | ~14% (opponent heavily favored — not a specific target) |
| 12 | ~20% (clear opponent advantage) |
| 30 | ~53% (even) |
| 100 | ~80% (quantum still favored) |

If you want it to punish harder or softer at a given N, the two levers
that matter most are QEC count (quantum's defense) and Extra RAM count
(the opponent's speed) — Decoherence and Cosmic Ray have a smaller effect
since neither directly speeds up the opponent.

If you want to re-tune any of this, a small Monte Carlo script (a plain
port of the turn loop in `app.js`, minus rendering/timing) is a much
faster way to iterate than playtesting by hand — happy to hand over that
script if useful.

## Design decisions & assumptions (please sanity-check these)

The source PDF specifies exact printed boards for N = 4, 12, and 30, and a
probability table that includes N = 100 but no printed board for it. To keep
a consistent "discrete tile, no overshoot" board for every size:

- **N = 100 board** is my own extrapolation, not in the source material. It
  rounds the table's values through the peak (1%, 9%, 23%, 42%, 62%, 80%,
  93%) to friendly fractions (1/100, 1/10, 1/4, 2/5, 5/8, 4/5, 9/10), then a
  guaranteed final tile — following the same pattern the printed N=30 board
  uses (stop at the tile just before the peak, make the peak itself free).
- **"Real Grover formula" mode** keeps the *same number of tiles* as the
  rounded board (so Decoherence/board mechanics still make sense) but computes
  each measurable tile's actual probability with
  `P(k) = sin²((2k+1)·asin(1/√N))` instead of using a rounded dice fraction.
  The final tile is still a guaranteed win in both modes, matching the
  printed rule ("if the arrow points to the final tile, you may measure to
  collect a point without rolling any dice") — this intentionally does not
  model Grover overshoot (see below).
- **Overshoot is not modelled.** The physical boards never let the quantum
  player rotate past the peak probability, so the digital board doesn't
  either, even in "real" mode. If you'd like a variant where over-rotating
  past the optimal iteration count actually reduces your odds (as true
  Grover's algorithm does — see the N=100 row in the source PDF's table,
  where iteration 8 drops back to 98%), that would need a different, non-tile
  based board and would interact awkwardly with Decoherence as written. Flag
  if you want that explored as a separate mode.
- **Event card counts** (confirmed): 24 cards total — 8 Decoherence,
  5 Quantum Error Correction, 6 Extra RAM, 4 Cosmic Ray, 1 Blue Screen. See
  `freshEventDeck()` in `app.js`.
- **Holding cards is automated per your instructions**: Quantum Error
  Correction and Extra RAM apply immediately when drawn rather than being
  held and played later.
  - QEC arms a shield that cancels the *next* Decoherence draw only; it
    cannot retroactively remove a Decoherence already in play. It's also
    discarded (used up) the moment you make any measurement, whether or not
    it ever cancelled anything.
  - Extra RAM stacks; each copy gives the dealer one more card flip per
    turn. All held RAM is discarded when the dealer scores a point (not when
    a full deck cycle passes without scoring).
- **Decoherence stacking**: each new Decoherence card covers the next
  right-most *still-open* tile (progressively squeezing the ceiling toward
  tile 1). If the arrow is sitting on the tile that just became covered, it's
  bumped back one tile immediately. Any measurement (successful or not, and
  including "arriving at the final tile" per the printed rule) clears every
  active Decoherence at once, per your instruction.
- **Multiple database sizes** are offered as independent one-off games
  (pick a size, play to the gem target, done) rather than the physical
  game's forced 4 → 12 → 30 progression — per your note that the
  progression was for pedagogical framing only.

## File overview

- `index.html` — setup screen, game screen, win screen.
- `style.css` — visual design (dark lab theme; red `#96172E` for the
  quantum panel, blue `#005D7E` for the classical/opponent panel).
- `app.js` — all game state and logic: board construction, event deck,
  opponent automation, quantum turn resolution, rendering, pacing.
- `audio.js` — sound effects, entirely synthesized with the Web Audio API
  (oscillators + a filtered noise burst) — no binary audio files to host.
  Call `SFX.init()` from a user-gesture handler before any other sound; the
  "Begin search" button already does this.
- `UW_IQC_logo_reverse.png` — the full crest + wordmark lockup, shown on
  the setup screen and in the game header. Cropped from the university's
  "black reverse" lockup file down to its actual content bounding box (the
  original file was a 2011×369px canvas with a large empty/transparent
  margin, which is what caused the oversized layout the first time around).
  The wordmark in this file is intentionally white, meant for dark
  backgrounds, so no CSS color filter is applied to it.

## Sound

All sounds are generated in code (see `audio.js`), so there's nothing to
download or license:

- **Card flip** — short filtered noise burst, on every opponent draw
  (fires once per card, so it repeats across Extra RAM draws in one turn).
- **Measurement success** — three-note ascending chime.
- **Measurement failure** — the "womp womp": two descending sawtooth notes.
- **Each event type** has a distinct sound: Decoherence (downward glissando),
  Cosmic Ray (sharp zap), Blue Screen (old-computer error beep),
  Quantum Error Correction (bright two-note "shield up"), Extra RAM (rising
  power-up arpeggio).

A Sound on/off toggle is on the setup screen (default on).

## Pacing

Actions are deliberately staggered (see the `TIMING` object at the top of
`app.js`) so each step is visible before the next begins: opponent card
draws are spaced ~0.6s apart, a found gem is held on screen before your
turn starts, and a measurement pauses briefly ("opening" the result box)
before revealing success or failure. Adjust the numbers in `TIMING` to
taste.

## Possible follow-ups not yet built

- A true "overshoot-enabled" continuous-probability mode (see above).
- Letting the player hold and manually time Extra RAM / QEC instead of
  auto-applying them.
- A "stage progression" mode that chains N=4 → 12 → 30 automatically for
  the pedagogical framing described in the original rules.

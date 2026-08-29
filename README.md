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
| Probability model | Rounded (dice-friendly) / Real Grover formula | Rounded |
| Show probabilities on tiles | On/Off | On |
| Event cards | On/Off | On |

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
- `style.css` — visual design (dark lab theme; blue `#005D7E` for the
  quantum panel, red `#96172E` for the classical/opponent panel).
- `app.js` — all game state and logic: board construction, event deck,
  opponent automation, quantum turn resolution, rendering, pacing.
- `audio.js` — sound effects, entirely synthesized with the Web Audio API
  (oscillators + a filtered noise burst) — no binary audio files to host.
  Call `SFX.init()` from a user-gesture handler before any other sound; the
  "Begin search" button already does this.
- `UW_IQC_shield_reverse.png` — the crest mark, shown on the setup screen
  and in the game header. Cropped from the university's full "black
  reverse" lockup file down to just the shield (the original file was a
  2011×369px canvas — mostly an invisible white wordmark and empty
  margin — which is what caused the oversized/broken layout when used
  directly). This version already has the correct white-fill/black-line
  treatment for a dark background, so no CSS color filter is applied to it.

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

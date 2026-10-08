# src/audio

Web Audio. Every effect is a recipe of layers (filtered noise, gliding tones, struck resonances) in `config/sounds.ts`,
rendered by pure code into a few variants and played back from buffers. Audio is presentation: it reads `state.events`
and never changes the simulation.

- `dsp.ts` renders a recipe into samples (no Web Audio); `soundBank.ts` holds every cue's variants (`AUDIO.renderRate`).
- `audioEngine.ts`: the page's one `AudioContext` (made suspended, running only while a match is played), the volume
  buses and every sound's buffers, rendered a cue at a time in the title screen's spare time. `prefetch` and `prepare`
  render the cues and loops only some maps play.
- `sfx.ts`: each match's `Sfx` builds only its own graph on the engine and disconnects it when the match goes. It keeps
  one channel per other character (an HRTF panner that follows them, then muffling by two rays, `occlusion.ts`); one-off
  world sounds get a panner of their own.
- `audioMix.ts`: buses master, effects (in-world, with the field's echo) and interface (hit tick, hit marker, whistle,
  dry), set by Settings › Audio. The limiter and ducking sit on effects only.
- `motor.ts` (an AEG winds up and down), `foley.ts` (crouch, stand and lean rustle; presentation only),
  `soundMaterials.ts` (BB impacts by block material), `whistle.ts`, `voiceLimit.ts`.
- `ambience.ts` (seeded outdoor bed and birds) and `soundscape.ts` (pure: picks a field's ambience by day or night from
  its map data and the lighting preset's night flag).
- Tuning: `config/audio.ts` (`AUDIO`, `AMBIENCES`, `AMBIENT_LOOPS`), `config/sounds.ts` (recipes, `MAP_CUE_SEEDS`). A
  field's own sounds stay within about 7 MB, and every map sound a page may keep within 12 MB.
- Tests: `audio.test.ts`, `sfx.test.ts`, `voiceLimit.test.ts`, `woodlandSound.test.ts` (pins the title cues' stream and
  samples), `citySound.test.ts`. `loopSeamSupport.ts` is test support: it measures how a loop closes where it wraps (the
  loop tests bound it by fixed percentiles of the loop's own); `loopSeamSupport.test.ts` shows it fails on a click.

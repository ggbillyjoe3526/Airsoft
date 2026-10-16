# src/audio

Web Audio. Every effect is a recipe of layers (filtered noise, gliding tones, struck resonances) in `config/sounds.ts`,
rendered by pure code into a few variants and played back from buffers. Audio is presentation: it reads `state.events`
and never changes the simulation.

- `dsp.ts` renders a recipe into samples (no Web Audio); `soundBank.ts` holds every cue's variants (`AUDIO.renderRate`).
- `audioEngine.ts`: the page's one `AudioContext` (made suspended, running only while a match is played), the volume
  buses and every sound's buffers, rendered a cue at a time in the title screen's spare time. `prefetch` and `prepare`
  render the cues and loops only some maps play.
- `sfx.ts`: each match's `Sfx` builds only its own graph on the engine and disconnects it when the match goes. It keeps
  one channel per other character (an HRTF panner that follows them, then muffling by two rays, `occlusion.ts`; each camp fire is muffled the same way within earshot, KI1); one-off
  world sounds get a panner of their own. A bot's callout keys a radio (`radioCall`, CL1): a teammate's click on the
  interface bus, panned to where they are; an enemy's from them, only within 15 m. Your ping gives a soft pip
  (`pingPlaced`, PG1), a short tone on the whistle's output (`AUDIO.pingPip`). A tossed magazine swishes from the
  thrower (`magToss`) and slaps into the catcher's hands (`magCatch`, MG1). A run into a noisy prop plays its sound from
  where it was hit (`propNoise`, NP1: `prop.<sound>`, map cues each map renders only for the props it has), and a step
  on gravel or steel plate plays louder and further (`NOISE.ground`, the ground the simulation named).
- `audioMix.ts`: buses master, effects (in-world, with the field's echo) and interface (hit tick, hit marker, whistle,
  dry), set by Settings › Audio. The limiter and ducking sit on effects only. The Ambience slider (M86) has no bus: each
  match's ambience (beds, fires, calls) plays into its world through one gain the engine holds at the slider's level
  (`AudioEngine.ambienceLevel`), so it is muffled and echoed like the rest, under Effects too.
- `motor.ts` (an AEG winds up and down), `foley.ts` (crouch, stand and lean rustle; presentation only),
  `soundMaterials.ts` (BB impacts by block material; leaves in a planter's top, FO1; what is underfoot is
  `map/underfoot.ts`, NP1), `whistle.ts`, `voiceLimit.ts`.
- `ambience.ts` (seeded outdoor bed, and the calls: each kind of a field's calls on its own seeded gaps, M86) and `soundscape.ts` (pure: picks a field's ambience by day or night from
  its map data and the lighting preset's night flag).
- Tuning: `config/audio.ts` (`AUDIO`, `AMBIENCES`, `AMBIENT_LOOPS`), `config/sounds.ts` (recipes, `MAP_CUE_SEEDS`). A
  field's own sounds stay within about 7 MB, and every map sound a page may keep within 12 MB.
- Tests: `audio.test.ts`, `sfx.test.ts`, `voiceLimit.test.ts`, `woodlandSound.test.ts` (pins the title cues' stream and
  samples), `citySound.test.ts`, `ambienceM86.test.ts`. `loopSeamSupport.ts` is test support: it measures how a loop closes where it wraps (the
  loop tests bound it by fixed percentiles of the loop's own); `loopSeamSupport.test.ts` shows it fails on a click.

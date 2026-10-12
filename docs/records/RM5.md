# RM5 · The Cyber Pistol redesign (owner's ask, 2026-10-12)

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✓ 52 s | ✗ 760 s (the records check: this record drafted with ? cells) | ✓ 1139 s | ✓ 2203 s | ✓ | ✓ | – gate failed | the record was written before the critic | ~1 h 30 min | QA 46k, changelog 30k |
| 2026-10-12 | 2 | Opus 5.5 (build thread) | – code unchanged since attempt 1 | ✓ 690 s | – code unchanged | – code unchanged | – docs only | – docs only | 8/8 Accept (Opus) | – | ~40 min | critic 17k (stopped: report head behind HEAD) + 44k |

Attempt 2 removed the early record draft (written again here, after the critic) and added the ROADMAP line; no code
changed, so only the tests gate ran again. The model was designed with the owner over two rounds of renders before the
pipeline started (v1 blockout, v2 with his three notes), in his Blender through the project's Blender connection.

## Decisions

- **The redesign follows the owner's three notes** (owner, 2026-10-12; `docs/DECISIONS.md` › Replicas): small subtle
  iron sights, the grip joined to the fixed frame, only the slide cycling on a shot (also in DECISIONS).
- **The slide kicks 1.4 cm back and is at full travel by the game's Fire peak** (0.4 of the 8-frame clip), so at
  13 BBs a second it keeps cycling between the peak and half way home. Enough travel to read, short enough to stay
  inside the rear housing and under the shroud, so nothing opens up; a static guide fills the slot under its front.
- **The sights stand 4 mm above the 3.6 cm top, aim height 4.0 cm** (`ironSight` rear [0.04, 0.0768], front
  [0.04, -0.1038], eye relief 0.33 so the gun sits where it did). The post carries a 1 mm cyan dot so it reads at night.
- **The built-in Cyber (shown while "Disable all models" is on) follows the file:** its slab top drops to 3.55 cm and
  the fin becomes the same notch and post, so one `ironSight` lines up with models on and off.
- **An optional `SlideBack` marker anchors the figures' pistol frame.** The new rear block reaches 2.3 cm further
  back than the old slab, so the body's rearmost point would sit the grip ahead of the figure's hand; the marker keeps
  the old frame (the Gas Pistol, with none, is unchanged).
- **The weapon torch moves forward** (`CYBER_TORCH` from 0.06, 4 cm long, clamp 6.4-9.2 cm): its tailcap used to sit in
  the trigger guard; its lens now ends level with the muzzle.

## Known issues left

- None.

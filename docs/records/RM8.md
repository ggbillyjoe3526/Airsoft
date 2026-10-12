# RM8 · Attachment redesigns: red dot, 2x scope, silencers, weapon torches (owner, 2026-10-12)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✓ 33 s | ✓ 403 s | ✓ 739 s | ✓ 1455 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~2 h | QA 43k, changelog 30k, critic 45k |

The models were built headless in Blender 5.0 in the thread's container (owner, 2026-10-12: "just keep rendering in
the cloud with blender") and approved from review renders before this pull request (`concepts/attachments-redesign-2026-10-12/`
in the project files). Merged main's AEG Rifle and Cyber Pistol redesigns (#189, #190) before the final gate. The
critic's one note (a long line in `replicaFiles.ts`) was fixed in the same push.

## Decisions

- **The sight line drops 2.2 cm, and a file's optic carries it** (owner's approval, 2026-10-12; `docs/DECISIONS.md` ›
  Art direction and graphics). The red dot and the 2x scope sit 3.05 cm over the rail (0.104 m above the AEG's origin,
  was 0.126). Rather than move the config's aim hold, a parts file's optic marks its own `SightLine` and the aim
  follows it, so the built-in optics, shown by default, aim exactly as before.
- **The pistol torch stacks under the laser by a marker, not a number in code.** Its `UnderLaser` empty is 1.6 cm
  below it (the Red Laser's depth); a torch without one (the built-in, or an older file) stays where it fits.
- **The parts were spliced into the parts files at the glTF level**, every other part byte for byte, with the scripts
  in the project files (`models/attachments/scripts/`: `export_game.py`, `splice.mjs`, `same_parts.mjs`). The AEG's
  file is 291,688 bytes (warn 300,000), the pistol's 89,204 (was 98,632), the Cyber's new one 21,500.
- **The pistol parts sit on the GBB Pistol's rail.** RM7 landed first with the same parts file, so the new torch and
  silencer were re-spliced onto its file (GBB rail, 87,828 bytes) after the critic; CI ran again on the merge.

## Known issues left

None.

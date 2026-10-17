# AX1 · Readability and tone: kit colours, High contrast, exit markers

**Review:** 2 attempts · 7/8 · Accept (Sonnet) · acceptance 1 answered by the owner's ruling

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 17 s | ✓ 482 s | ✓ 1003 s | ✓ 2715 s | ✗ (touches missed the paint glow's three files) | ✓ | – not run on a failed gate | touches list | ~2 h 30 min (two owner decision cards, in-game measuring) | QA 54k, changelog 20k |
| 2026-10-17 | 2 | Opus 5.5 (build thread) | ✓ 17 s | ✓ 492 s | ✓ 1056 s | ✓ 2719 s | ✓ | ✓ | 7/8 Accept (Sonnet) | – | ~1 h 20 min (the gate's perf matrix ~45 min) | performance 27k, critic 48k |

## Decisions

- **Every figure keeps its team-colour plate carrier (owner's decision card).** The task was written for the built-in figures; on the v12 Blender figure the only way to lose a carrier is a combat shirt with armbands, which rendered more military and lost the team at 30 m (`concepts/ax1-kit-colours/kit-options.jpg` in the project files). A civilian outfit is in IDEAS (also in DECISIONS).
- **The skin-tone row closes.** Neither the rigged figures nor the built-in ones show any skin: every face is masked and the hands gloved.
- **Exits take their colour set's colours (owner's decision card, replacing decision 17).** Standard keeps the green and orange cones; High Contrast's ring, wash, sign, cones, minimap door and screen marker are hi-vis yellow `#fff000`, the sign's text dark `#1d1f23` (also in DECISIONS). Against the orange team under deuteranopia: green 29–33 ΔE, yellow 42 (HUD orange) and 55 (figures); against the light blue at least 51 in every vision.
- **High Contrast's dark orange was measured, not judged by eye.** In the e2e build a Beta figure stood in Depot's five darkest walkable spots (lowest baked sky visibility at 1.1 m, at least 6 m apart), seen from about 7 m on High; its team paint's pixels (found by recolouring the paint) were compared with the frame round it without the figure. Today: ΔE 8–11 under deuteranopia and 14–19 for normal vision in the two darkest corners (the Standard orange is 12–16 there). The scripts are in the project files (`pipeline/runs/AX1/measure/`).
- **High Contrast's team paint glows at 0.3 of its colour on day fields (owner's decision card, "HC only").** It brings the darkest corners to 25–26 under deuteranopia and 37–40 for normal vision, with no new draw or per-frame work; none on Standard or at night, where lamps and torches light the figures (`dayColours`; also in DECISIONS). 0.15 reached only 14–18 for a deuteranope.
- **A lighter orange was ruled out.** Above `#c44c0e` the gap in lightness to the light blue falls under the set's bar of 25 for a deuteranope, and it adds too little lightness to matter in shade.

## Known issues left

- High Contrast's orange paint still reads poorly for a protanope in Depot's darkest corners (ΔE 16–18), and the built-in figures have no paint glow (KNOWN_ISSUES › Figures and art, can wait).

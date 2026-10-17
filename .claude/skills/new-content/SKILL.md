---
name: new-content
description: Add a new replica, part, map, mode or skin to the Airsoft FPS through the content toolkit (brief, spec sheet, build as dev, content check, report, public gate). Use when the owner asks for a new item, or to make a dev item public.
---

# Adding a new item

The rules and steps are in `docs/content/README.md`, each type's rulebook and brief in `docs/content/<type>.md`; this
is the thread's step list. The owner is not technical: plain words, numbered lists, one question at a time with a
default, and only results, blockers and decisions.

1. **Read** `docs/content/README.md` and the type's rulebook. A skin is a colour scheme in `config/schemes.ts`; a new
   mode is real code for its rules and bots, built to `modes.md` › Checks.
2. **Brief.** Ask the rulebook's brief questions with their defaults in one message (a decision card when one answer
   decides the rest); take the defaults for anything left open, and say so.
3. **Spec sheet** to `/mnt/project-files/content-reports/<name>/spec.md`: the `stats.md` row, the item beside what is in
   the game (`node pipeline/content-check.mjs all --levels spec --no-pictures`), what it is good and bad at, its look
   and sound. Attach it and wait for the owner's OK: the spec is his decision.
4. **Task.** The build is a pipeline task (`.claude/skills/pipeline/SKILL.md`) with a block in `docs/TASKS.md`.
5. **Build as `dev`:** the `pool.md` row with the next free pool ID (000021 stays free; add the ID to `pool.test.ts`'s
   pinned IDs), the `stats.md` row, its Name in one level's Unlocks in `levels.md`, the code key and config, the model
   (every part that fits, at Low and High) and the sounds. A number outside its range, a part that fits by ID or one
   better at everything goes to the owner; only with his OK into its register in `src/config/contentRules.ts`.
6. **Check:** `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium node pipeline/content-check.mjs <id> --balance` (`map:<id>`,
   `mode:<id>`, `skin:<id>`; a map's perf runs add about ten minutes). Fix every fail; re-run a figure outside within
   noise on more seeds (`--seeds 16 --maps <map>`) before acting on it.
7. **Report:** copy `pipeline/out/content/<id>/` to `/mnt/project-files/content-reports/<id>/`, attach `report.html`,
   and tell the owner the outcome, what to look at and what to try (Settings › Dev › Dev content on). The record
   quotes the outcome and the balance figures.
8. **Ship as dev** through the rest of the pipeline. The item stays `dev`.
9. **Going public** (a new task, only when the owner says so after his playtest): the check with `--public`, every
   warning to the owner, any balance override in `docs/DECISIONS.md` and `ALLOWED_STRONGER`, then Access `public` and
   the item in `PUBLIC_ITEMS` with the date and his word (`docs/content/README.md` › Going public).

Never make an item public, change a range, budget or band in `contentRules.ts`, or reuse or change an ID without the
owner's word.

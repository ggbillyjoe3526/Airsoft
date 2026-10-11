---
name: new-content
description: Add a new replica, part, map, mode or skin to the Airsoft FPS through the content toolkit (brief, spec sheet, build as dev, content check, report, public gate). Use when the owner asks for a new item, or to make a dev item public.
---

# Adding a new item

The rules and the steps are in `docs/content/README.md`, and each type's rulebook and brief in `docs/content/<type>.md`.
This is the thread's step list. The owner is not technical: plain words, numbered lists, one question at a time with
a default, and only results, blockers and decisions.

1. **Read** `docs/content/README.md` and the type's rulebook (`replicas.md`, `attachments.md`, `maps.md`, `modes.md`,
   `skins.md`). For skins, say which checks exist yet (the rulebook's Checks heading) before starting. A new mode is
   real code for its rules and its bots: the build follows `modes.md` › Checks, adding its case wherever the build
   stops on the never-check.
2. **Brief.** Ask the rulebook's brief questions, each with its default, in one message (a decision card when one
   answer decides the rest). Take the defaults for anything the owner leaves open, and say so.
3. **Spec sheet.** Write it from the answers to `/mnt/project-files/content-reports/<name>/spec.md`: the numbers (the
   `stats.md` row), the item beside what is in the game (run `node pipeline/content-check.mjs all --levels spec
   --no-pictures` for the current sheets), what it is good and bad at, its look and sound. Attach it and wait for the
   owner's OK before building: the spec is his decision.
4. **Task.** The build is a pipeline task (`.claude/skills/pipeline/SKILL.md`): a task block in `docs/TASKS.md`,
   branch from the latest `origin/main`.
5. **Build** as `dev`: the `pool.md` row with the next free pool ID (000021 is `pool.md`'s example and stays free;
   append the new ID to `pool.test.ts`'s pinned IDs), the `stats.md` row, the code key and config, the model (every
   part that fits it, at Low and High), the sounds. Note any reason for a number outside its range, a part that fits by ID, or a part better at everything, and put it to the
   owner: each goes into its register in `src/config/contentRules.ts` only with his OK.
6. **Check.** `PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium node pipeline/content-check.mjs <id> --balance` (drop the
   variable outside a cloud container; a map is `map:<id>`, and its perf runs add about ten minutes; a mode is
   `mode:<id>`). Fix every fail. Re-run any balance figure that is outside within noise on
   more seeds (`--seeds 16 --maps <map>`) before acting on it.
7. **Report.** Copy `pipeline/out/content/<id>/` to `/mnt/project-files/content-reports/<id>/` and attach
   `report.html`. Tell the owner, in a numbered list: the outcome line, each thing to look at in plain words, and what
   to try in the game (Settings › Dev › Dev content on). The item's record (`docs/records/<task>.md`) quotes the
   outcome and the balance figures.
8. **Ship as dev.** Finish the pipeline (gates, QA, critic, changelog, merge). The item stays `dev`.
9. **Going public** (only when the owner says "make it public", after his playtest): a new task. Run the check with
   `--public`, put every warning to the owner, record any balance override in `docs/DECISIONS.md` and
   `ALLOWED_STRONGER`, then set Access to `public` and add the item to `PUBLIC_ITEMS` with the date and his word
   (`docs/content/README.md` › Going public).

Never make an item public without the owner's word, never change a range, budget or band in `contentRules.ts`
without it, and never reuse or change an ID.

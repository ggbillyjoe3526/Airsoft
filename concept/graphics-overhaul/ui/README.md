# Menu and UI redesign concept

A static page that draws the redesigned menus and HUD in the v3 art direction, one screen per `?screen=`
(title, play, loadout, customise, colour, settings, look, hud, results, armory). Concept only, never in the game build.

Pictures are generated, not committed:

1. `thumbs/`: `node concept/graphics-overhaul/thumbs.mjs` with the concept server on 5199 (weapons, parts, schemes;
   add `hero-aeg-kit` and `hero-pistol` at 1280 x 800 the same way).
2. `maps/`: `bg-*.jpg` are the concept's `map`, `overview`, `woodland`, `neon`, `woodland-ingame`, `arms`,
   `characters`, `robots`, `schemes` and `schemes-real` shots at 1920 x 1080 with `&hud=0&tag=0`; `clean-ingame` is
   `ingame` the same way; the rest are copies from the v3 images (`ultra-heads`, `low-ingame`, `ultra-ingame` ...).
3. `avatars/`: head crops from `ultra-heads.jpg` and one figure from `ultra-characters.jpg`.

Then `node concept/graphics-overhaul/ui/capture.mjs <outDir> [screens]` serves this folder on port 5210 and writes
one JPEG per screen. Fonts: Barlow and Barlow Condensed (SIL Open Font License), latin subset, in `fonts/`.

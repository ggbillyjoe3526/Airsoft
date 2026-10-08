# src/settings

The player's saved settings: one versioned object in the browser, plus the Dev settings' values.

- `storage.ts`: `airsoft.settings` (`SETTINGS_VERSION`), `loadSetting`, `saveSetting`, `saveSettingSoon`,
  `flushSettings`, `migrate`. `browserStorage()` is the save system's guarded storage once it has started.
- `dev.ts`: the Dev settings' values as `dev.<id>` (a switch is `'on'` / `'off'`), read back as `DevSettings`.
  `Game.dev` holds what applies (the defaults while the Dev settings box is unticked).
- Rules: renaming a key needs a `case` in `migrate`; fields are only ever added, each read with a fallback; an object
  from a newer version is never read or overwritten. A new Dev setting goes in `config/dev.ts`, then `Game.applyDev`.
- Other stores: key bindings (`input/keyBindings.ts`), records (`stats/records.ts`), the collection
  (`pool/collection.ts`). All four are listed in `save/stores.ts`.
- Tests: `storage.test.ts`, `config/dev.test.ts`.

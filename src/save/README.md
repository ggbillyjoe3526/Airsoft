# src/save

The save system: guarded browser storage, a readable save file, migrations and a tab lock.

- `guardedStorage.ts`: the storage every store writes through. It notices writes (the Save tab's "Last saved"), keeps
  refused writes in memory for the visit and can be frozen (another tab, a newer build's save, a load about to reload).
- `tabLock.ts`: one tab plays at a time (a BroadcastChannel); a second waits behind `ui/otherTabNotice.ts`.
- `saveManager.ts`: today's restore point, the Undo slot, load and delete, used by Settings › Save
  (`ui/saveSettings.ts`, `ui/saveDialog.ts`). `main.ts` starts the guarded storage first, then the lock, then this.
- `saveFile.ts`: the file format and migrations, pure. `sha256.ts` makes its checksum. `stores.ts` lists the stores
  (settings, key bindings, records, collection). `overStored.ts`: `storedIsNewer`, so a store never overwrites a newer
  build's data. Stores keep the fields they don't know when they save.
- Tuning: `config/save.ts`. Tests: `saveFile.test.ts`, `saveManager.test.ts`, `guardedStorage.test.ts`,
  `tabLock.test.ts`, `overStored.test.ts`.
- Rules: a new store goes in `stores.ts`. A store's version bump needs `SAVE_FORMAT`, `STORES_BY_FORMAT` and a
  `MIGRATIONS` step in `saveFile.ts` (the test says so). A save from an earlier format must load; a later one is
  refused.

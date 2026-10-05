# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M56 · Data-file guards and the newer-store refusal (Audit 2 POOL-A + POOL-B: POOL-01, POOL-02, POOL-03, POOL-04, POOL-06, POOL-07)
tier: core
perf: none
touches: src/pool/pool.ts, src/pool/poolFile.ts, src/pool/supplyEvents.ts, src/pool/collection.ts, src/stats/records.ts, src/save/overStored.ts, pool.md, docs/ARCHITECTURE.md, docs/DECISIONS.md
contract: pool.md format (stricter reading of the same format: Supply event % at 0 or 10 to 1000, Difficulty multiplier at least 0.1, IDs 000001 to 000020 pinned) and the save file format ("in every store module an object from a newer version is never read or overwritten")
acceptance:
  1. A Supply event FC % or Part % between 0 and 10 (e.g. 1.25), a Difficulty multiplier under 0.1 and Odds % rising down the Rarity table are each reported with their pool.md line (owner decision 25); the bad Supply or Difficulty row is left out, and the shipped pool.md reads with no errors.
  2. A Supply events table missing a column, or with a column in the wrong case, gives exactly one error at its header line and no events.
  3. Every shipped pool ID is pinned to its asset in `pool/pool.test.ts`, and renumbering a row fails that test.
  4. `saveCollection` returns false and `saveRecords` writes nothing when the stored object's version is newer, and the stored object stays byte for byte unchanged; every existing save, collection, records and pool test passes unchanged.
status: gates
attempts: 0

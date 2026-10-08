# src/nav

Walkability for bots and walk-offs: pure data and A*, no Three.js.

- `navGrid.ts` builds a 0.2 m grid from the map's blocks (clearance = body radius + margin) and finds routes
  (8-neighbour A*, string-pulled into straight legs). It is layered: each cell holds one node per floor over it, stored
  flat (`cellStart`, `nodeCell`, `walkable`, `floorY`), and waypoints carry the floor height.
- Neighbouring nodes connect only if their floors differ by at most `maxStep` (0.15 m). Drops get the same clearance as
  walls on the floor they edge; `dropOnLine` keeps bots from walking off an open edge.
- Every query takes a height (`nodeAt`, `floorAt`, `isWalkableAt`, `nearestWalkable`, `clearLine`, `dropOnLine`) and
  picks the highest floor at most `NODE_PICK_ABOVE` above it, so a balcony and the hall under it differ.
- Used by `ai/` and by `sim/elimination.ts` (walk-off routes and distance fields).
- Tuning: `config/nav.ts`. Tests: `navGrid.test.ts`, `navGridField.test.ts`, `ai/stackHouse.nav.test.ts`.

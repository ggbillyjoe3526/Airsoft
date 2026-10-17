import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BLOCK_MATERIALS } from "../config/materials";
import { SURFACES, type SurfaceTextureId } from "../config/render";
import { DEPOT } from "../map/depot";
import type { MapData, MapSign } from "../map/mapTypes";
import { WOODLAND } from "../map/woodland";
import { OPEN_FIELD } from "../sim/testSupport";
import { vec3 } from "../sim/vec";
import { buildMapMeshes, texturesFor } from "./mapMeshes";
import { addMapSigns } from "./mapSigns";
import type { SurfaceTextures } from "./proceduralTextures";

/**
 * M34f regression pins: what the city's engine features must leave alone (Depot and Woodland build exactly as before),
 * the ricochet material of the new block kinds, and the signs' two meshes. The city's own look is in cityLook.test.ts.
 */

const stubTextures = (ids: readonly SurfaceTextureId[]): SurfaceTextures =>
  Object.fromEntries(
    ids.map((id) => [
      id,
      {
        texture: Object.assign(new THREE.Texture(), { name: id }),
        worldSize: SURFACES.worldSize[id],
      },
    ]),
  ) as unknown as SurfaceTextures;

/** FNV-1a over a float stream, each rounded to a tenth of a millimetre (or a ten-thousandth of a colour). */
function fnv(values: ArrayLike<number>): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < values.length; i++)
    h = Math.imul(h ^ Math.round(values[i]! * 10000), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** Each mesh of a built map: its name, vertices, indices and a hash of its positions, UVs and colours. */
function meshFingerprint(map: MapData, detail: boolean): string[] {
  const group = buildMapMeshes(
    map,
    stubTextures(texturesFor(map)),
    { relief: false, normalMaps: false, detail, steelSheen: false },
    null,
  );
  // G8: a map's set dressing (its junk and puddles) is pinned by its own tests; every other mesh is as before.
  return group.children
    .filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.name !== 'map-junk' && c.name !== 'map-puddles')
    .map((m) => {
      const g = m.geometry;
      const a = (n: string): ArrayLike<number> =>
        g.getAttribute(n)?.array ?? [];
      return `${m.name} v${g.getAttribute("position").count} i${g.index?.count ?? 0} ${fnv(a("position"))}/${fnv(a("uv"))}/${fnv(a("color"))}`;
    })
    .sort();
}

describe("Depot and Woodland build exactly as before the city (M34f)", () => {
  it("asks for the same textures: none of the city's", () => {
    expect([...texturesFor(DEPOT)].sort()).toEqual([...PINNED.depotTextures]);
    expect([...texturesFor(WOODLAND)].sort()).toEqual([
      ...PINNED.woodlandTextures,
    ]);
  });

  it.each([
    ["Depot", DEPOT, "depot"],
    ["Woodland", WOODLAND, "woodland"],
  ] as const)(
    "%s: every mesh has the same vertices, triangles, positions, UVs and colours, with and without map detail",
    (_n, map, key) => {
      expect(meshFingerprint(map, true)).toEqual(PINNED[`${key}Detail`]);
      expect(meshFingerprint(map, false)).toEqual(PINNED[`${key}Plain`]);
    },
  );

  it("has no city mesh: no map-paint, no city surface (but Woodland's cabin roof, MS1), and no sign at all unless the map set one", () => {
    for (const map of [DEPOT, WOODLAND]) {
      const names = meshFingerprint(map, true).map((s) => s.split(" ")[0]!);
      for (const id of [
        "plaster",
        "cladding",
        "tiles",
        "asphalt",
        "paving",
        "glass",
      ])
        expect(
          names.some((n) => n.startsWith(`map-${id}`)),
          `${map.name} ${id}`,
        ).toBe(map === WOODLAND && id === "cladding");
      for (const night of [true, false]) {
        const scene = new THREE.Scene();
        const signs = addMapSigns(scene, map, night);
        expect(
          scene.getObjectByName("map-paint"),
          `${map.name} paint`,
        ).toBeUndefined();
        expect(
          scene.getObjectByName("map-signs"),
          `${map.name} signs`,
        ).toBeUndefined();
        signs.dispose();
      }
    }
  });
});

describe("the city props keep the ricochet of the site props they replace (M34f)", () => {
  it("soaks BBs up as wood (no ricochet) for cabinets, machines, stalls, planters and booths, and rings as steel for the van", () => {
    // Neon Heights' toilets, wrapped loads, racks and crates were wood; its container was steel.
    for (const kind of [
      "cabinet",
      "vending",
      "stall",
      "planter",
      "booth",
    ] as const) {
      expect(BLOCK_MATERIALS[kind], kind).toBe("wood");
      expect(BLOCK_MATERIALS[kind], kind).toBe(BLOCK_MATERIALS.toilet);
    }
    expect(BLOCK_MATERIALS.van).toBe("metal");
    expect(BLOCK_MATERIALS.van).toBe(BLOCK_MATERIALS.container);
  });
});

describe("the signs' two meshes (M34f)", () => {
  const NEON: MapSign = {
    centre: vec3(0, 3, -5),
    width: 2,
    height: 1,
    facing: "+z",
    colour: 0xff2bd6,
    kind: "neon",
  };
  const WINDOW: MapSign = {
    centre: vec3(4, 1.75, 0),
    width: 1.6,
    height: 1.1,
    facing: "-x",
    colour: 0xffc890,
    kind: "window",
  };
  const PAINT: MapSign = {
    centre: vec3(2, 0, -3),
    width: 0.5,
    height: 2,
    facing: "+y",
    colour: 0xffffff,
    kind: "paint",
  };
  const PAINT2: MapSign = { ...PAINT, centre: vec3(-2, 0, 3) };
  const count = (scene: THREE.Scene, name: string): number =>
    (
      scene.getObjectByName(name) as THREE.Mesh | undefined
    )?.geometry.getAttribute("position").count ?? 0;

  it("keeps every flat painted marking in map-paint and every upright sign in map-signs, never one in the other", () => {
    const map: MapData = {
      ...OPEN_FIELD,
      signs: [NEON, PAINT, WINDOW, PAINT2],
    };
    for (const night of [true, false]) {
      const scene = new THREE.Scene();
      const signs = addMapSigns(scene, map, night);
      expect(count(scene, "map-paint"), `paint night ${night}`).toBe(8);
      expect(count(scene, "map-signs"), `signs night ${night}`).toBe(8);
      const normalsY = (name: string): number[] => {
        const nor = (
          scene.getObjectByName(name) as THREE.Mesh
        ).geometry.getAttribute("normal");
        return Array.from({ length: nor.count }, (_, i) => nor.getY(i));
      };
      expect(normalsY("map-paint").every((y) => y === 1)).toBe(true);
      expect(normalsY("map-signs").every((y) => y === 0)).toBe(true);
      signs.dispose();
    }
  });

  it("adds only the mesh a map needs: markings alone give no map-signs, upright signs alone give no map-paint", () => {
    const paintOnly = new THREE.Scene();
    addMapSigns(paintOnly, { ...OPEN_FIELD, signs: [PAINT] }, true);
    expect(paintOnly.getObjectByName("map-paint")).toBeDefined();
    expect(paintOnly.getObjectByName("map-signs")).toBeUndefined();
    const signsOnly = new THREE.Scene();
    addMapSigns(signsOnly, { ...OPEN_FIELD, signs: [NEON, WINDOW] }, true);
    expect(signsOnly.getObjectByName("map-signs")).toBeDefined();
    expect(signsOnly.getObjectByName("map-paint")).toBeUndefined();
  });

  it("on dispose removes both meshes from the scene and frees both geometries and both materials", () => {
    const scene = new THREE.Scene();
    const signs = addMapSigns(
      scene,
      { ...OPEN_FIELD, signs: [NEON, PAINT] },
      true,
    );
    const meshes = ["map-signs", "map-paint"].map(
      (n) => scene.getObjectByName(n) as THREE.Mesh,
    );
    expect(meshes.every((m) => m !== undefined)).toBe(true);
    expect(meshes[0]!.material).not.toBe(meshes[1]!.material);
    let freed = 0;
    for (const m of meshes) {
      m.geometry.addEventListener("dispose", () => freed++);
      (m.material as THREE.Material).addEventListener("dispose", () => freed++);
    }
    signs.dispose();
    expect(freed).toBe(4);
    expect(scene.children).toHaveLength(0);
  });
});

// Pinned from main before M34f (2026-10-05, 8b336aa): each mesh's name, vertices, indices and hashes of its positions, UVs, colours.
const PINNED = {
  depotTextures: [
    "barrier",
    "blockWall",
    "concrete",
    "corrugated",
    "crate",
    "gabion",
    "sandbag",
    "steelPlate",
  ],
  woodlandTextures: [
    "bark",
    "barrier",
    "blockWall",
    "cladding",
    "concrete",
    "corrugated",
    "crate",
    "gabion",
    "groundDetail",
    "planks",
    "sandbag",
    "steelPlate",
    "stone",
  ],
  // M102: blockWall, concrete and corrugated re-pinned for the office hall's window broken down to a low wall to vault
  // (its sill lower, its lintel gone; the wall's grime on the yard round it moves with it).
  depotDetail: [
    "map-barrier v21140 i33372 be34de09/b865b405/a0a6e726",
    "map-blockWall v6114 i17910 2c6d2af9/429d9275/420d19cd",
    "map-concrete v5534 i20388 77e174ed/53fcc127/c61be2c1",
    "map-corrugated v24024 i46782 bed07a37/6d466cf6/cb1b5a70",
    "map-crate v6584 i9888 5319f985/1f3f01e5/ebed566d",
    "map-gabion v1006 i1728 9c61cdad/08aafe6d/f8d30cd0",
    "map-sandbag v1176 i1800 2ad8ffe5/50ab9a2f/8417523d",
    "map-steelPlate v774 i1368 31fff975/43fedd56/e7e225ad",
  ],
  depotPlain: [
    "map-barrier v7048 i11100 6a606e45/f70ebed9/2a2f32fd",
    "map-blockWall v736 i1380 3e60fa45/9cc59b5d/9088be2d",
    "map-concrete v624 i936 bf4da2f5/9d354d05/95c6bcb5",
    "map-corrugated v5304 i8676 9cf8d745/38c1ceb5/50205ed5",
    "map-crate v1816 i2748 5a190465/5d040585/d81344fd",
    "map-gabion v336 i576 e9818b05/f9af1401/1532e6b5",
    "map-sandbag v288 i432 415cfe45/ef273595/28884735",
    "map-steelPlate v228 i336 64973f35/a3381b15/05c3e021",
  ],
  // M55 (audit SIM-05): bark and stone re-pinned for the log cut short of the boulder it ran into (its courses fall anew on
  // the slope) and the boulder moved off the tree; the rest as before. G9: with map detail the woods' dressing grows moss
  // on the trunks, logs and boulders, so bark's and stone's vertex colours are re-pinned (their vertices, positions and
  // UVs are untouched, and woodlandPlain, which draws no dressing, is exactly as before). M88: both re-pinned for the
  // West Rise and the lower east end (every block, tree and bush on the new ground; the logs there fall in more courses).
  // M102: both re-pinned for the cabin's west window broken down to a low wall to vault (its sill lower, its lintel gone),
  // and for a Knoll log turned across the slope (fewer courses of bark; the leaf drifts and moss around it fall anew).
  // MS1: bark for the cabin's walls (3 m, on one level), canopy and foliage for the fuller crowns and smaller, lobed
  // bushes, and the cabin's roof, Woodland's one finished block (cladding, the city's engine feature, M34f). WL2: both
  // re-pinned for the fort hut's roof (cladding), the big boulders lowered to crouch height or stacked as log piles, and
  // the lone oak's trunk and crown swapped for a boulder (bark, stone, canopy; with detail the moss falls anew).
  woodlandDetail: [
    "map-bark v26086 i60972 b5cf9615/4513d1f8/8b3e4296",
    "map-canopy v31428 i0 bd13720f/811c9dc5/c8382a34",
    "map-cladding v144 i192 5e2f3ced/3b944405/a89ee055",
    "map-foliage v16800 i0 2d3ea6ce/811c9dc5/5d0ab568",
    "map-planks v6500 i12600 27873f91/9f349b8d/5691af2a",
    "map-stone v12140 i12840 1280a1c6/b5a727ec/a0f0ccbc",
    "map-terrain v9801 i57600 4e80f9d2/006bce1d/4298d710",
  ],
  woodlandPlain: [
    "map-bark v18406 i46572 a4508e65/3c595e9e/d591b585",
    "map-canopy v31428 i0 bd13720f/811c9dc5/c8382a34",
    "map-cladding v72 i96 c231a0b9/d7bca701/3bb51a6d",
    "map-foliage v16800 i0 2d3ea6ce/811c9dc5/5d0ab568",
    "map-planks v1600 i3000 b1e0a709/eef7627d/cbf74e3d",
    "map-stone v11340 i11340 6aa34be6/6e3d4570/42bcf424",
    "map-terrain v9801 i57600 4e80f9d2/006bce1d/4298d710",
  ],
} as const;

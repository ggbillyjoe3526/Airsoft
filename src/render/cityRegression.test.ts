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

  it("has no city mesh: no map-paint, no city surface, and no sign at all unless the map set one", () => {
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
        ).toBe(false);
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
  depotDetail: [
    "map-barrier v21140 i33372 be34de09/b865b405/a0a6e726",
    "map-blockWall v6230 i18114 83b89309/b1f87539/1988b810",
    "map-concrete v5582 i20460 cfe7e0ad/1f665547/1c873578",
    "map-corrugated v24024 i46782 bed07a37/6d466cf6/a30a3534",
    "map-crate v6584 i9888 5319f985/1f3f01e5/ebed566d",
    "map-gabion v1006 i1728 9c61cdad/08aafe6d/f8d30cd0",
    "map-sandbag v1176 i1800 2ad8ffe5/50ab9a2f/8417523d",
    "map-steelPlate v774 i1368 31fff975/43fedd56/e7e225ad",
  ],
  depotPlain: [
    "map-barrier v7048 i11100 6a606e45/f70ebed9/2a2f32fd",
    "map-blockWall v768 i1440 5fcd9225/87ed5e35/00fe670d",
    "map-concrete v648 i972 7ee26e15/60069025/912a2d1d",
    "map-corrugated v5304 i8676 9cf8d745/38c1ceb5/50205ed5",
    "map-crate v1816 i2748 5a190465/5d040585/d81344fd",
    "map-gabion v336 i576 e9818b05/f9af1401/1532e6b5",
    "map-sandbag v288 i432 415cfe45/ef273595/28884735",
    "map-steelPlate v228 i336 64973f35/a3381b15/05c3e021",
  ],
  // M55 (audit SIM-05): bark and stone re-pinned for the log cut short of the boulder it ran into (its courses fall anew on
  // the slope) and the boulder moved off the tree; the rest as before.
  woodlandDetail: [
    "map-bark v24419 i57672 414f67c2/15941584/db7d17c4",
    "map-canopy v12360 i0 fdc198ad/811c9dc5/32f7476c",
    "map-foliage v16800 i0 2c532a15/811c9dc5/5d0ab568",
    "map-planks v6500 i12600 c6e31599/7bb3ff75/ed848380",
    "map-stone v12744 i13500 54817208/5d7d5f6a/eef96b0c",
    "map-terrain v9801 i57600 70aec22c/006bce1d/b7c02c31",
  ],
  woodlandPlain: [
    "map-bark v16771 i43332 3b556e6a/9d27575e/43fa778b",
    "map-canopy v12360 i0 fdc198ad/811c9dc5/32f7476c",
    "map-foliage v16800 i0 2c532a15/811c9dc5/5d0ab568",
    "map-planks v1600 i3000 f2129c69/f369fb4d/d1932a6d",
    "map-stone v11880 i11880 9c1c1344/e41badca/52eff79b",
    "map-terrain v9801 i57600 70aec22c/006bce1d/b7c02c31",
  ],
} as const;

import type * as THREE from 'three';

/**
 * A mesh's own shadow proxy (the detailed map since FA7, render/mapMeshes.ts; the figures' parts since M75,
 * render/characterModels.ts): the geometry's first `drawn` elements (indices, or vertices where it has no index) are
 * what the camera sees, the rest plain stand-ins for the same shapes, drawn into the shadow map in their place: the same
 * silhouette for a fraction of the triangles. Between shadow passes the draw range is the drawn part, so a raycast
 * reads only the shapes the camera sees.
 */
export function shadowProxy(mesh: THREE.Mesh, drawn: number): void {
  const geo = mesh.geometry;
  const total = geo.index?.count ?? geo.getAttribute('position').count;
  geo.setDrawRange(0, drawn);
  mesh.onBeforeShadow = () => geo.setDrawRange(drawn, total - drawn);
  mesh.onAfterShadow = () => geo.setDrawRange(0, drawn);
}


# Bot figure helpers: metres, Blender Z up, the figure faces -Y (glTF +Z), its left at +X.
import bpy, bmesh, math
from mathutils import Vector, Matrix

COLL_NAME = 'BotHuman'
TAU = 2 * math.pi


def coll():
    c = bpy.data.collections.get(COLL_NAME)
    if c is None:
        c = bpy.data.collections.new(COLL_NAME)
        bpy.context.scene.collection.children.link(c)
    return c


def clear():
    c = bpy.data.collections.get(COLL_NAME)
    if not c:
        return
    names = [o.name for o in c.objects if o is not None]
    for n in names:
        o = bpy.data.objects.get(n)
        if o is None:
            continue
        me = o.data if o.type == 'MESH' else None
        bpy.data.objects.remove(o, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)


def srgb(h):
    def ch(x):
        x = x / 255.0
        return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
    return (ch((h >> 16) & 255), ch((h >> 8) & 255), ch(h & 255))


def mat(name, hexcol, rough=0.8, metal=0.0, coat=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = m.node_tree.nodes.get('Principled BSDF')
    rgb = srgb(hexcol)
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if coat and 'Coat Weight' in b.inputs:
        b.inputs['Coat Weight'].default_value = coat
    m.diffuse_color = (*rgb, 1)
    m.roughness = rough
    return m


def M(name):
    return bpy.data.materials[name]


def finish(bm, name, material, smooth=True, angle=48, recalc=True):
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    coll().objects.link(o)
    if material is not None:
        me.materials.append(material if not isinstance(material, str) else M(material))
    if smooth:
        me.shade_smooth()
        try:
            me.set_sharp_from_angle(angle=math.radians(angle))
        except Exception:
            pass
    return o


def make(name, verts, faces, material, smooth=True, angle=48, recalc=True):
    bm = bmesh.new()
    vs = [bm.verts.new(Vector(v)) for v in verts]
    for f in faces:
        try:
            bm.faces.new([vs[i] for i in f])
        except ValueError:
            pass
    return finish(bm, name, material, smooth, angle, recalc)


def frac(x):
    return x - math.floor(x)


def rnd(i, j, s=0):
    return frac(math.sin(i * 12.9898 + j * 78.233 + s * 37.719) * 43758.5453)


def se(c, e):
    return math.copysign(abs(c) ** (2.0 / e), c)


def frame(T, hint):
    T = Vector(T).normalized()
    h = Vector(hint)
    F = (h - T * h.dot(T))
    if F.length < 1e-6:
        F = Vector((0, 0, 1)) - T * T.z
    F.normalize()
    S = T.cross(F).normalized()
    return T, F, S


def ring_pts(c, T, hint, rx, rf, rb, segs, e=2.0, rot=0.0, noise=0.0, idx=0, rs=None):
    T, F, S = frame(T, hint)
    pts = []
    for j in range(segs):
        a = TAU * j / segs + rot
        ca, sa = math.cos(a), math.sin(a)
        x = se(ca, e) * (rs if (rs is not None and ca < 0) else rx)
        y = se(sa, e) * (rf if sa >= 0 else rb)
        n = 1.0 + noise * (rnd(idx, j) - 0.5) * 2.0
        pts.append(Vector(c) + S * x * n + F * y * n)
    return pts


def loft(name, rings, material, segs=12, hint=(0, -1, 0), cap0=True, cap1=True, e=2.0,
         noise=0.0, smooth=True, angle=60, closed=False):
    n = len(rings)
    cs = [Vector(r['c']) for r in rings]
    bm = bmesh.new()
    rows = []
    for i, r in enumerate(rings):
        if 'T' in r:
            T = Vector(r['T'])
        elif closed:
            T = (cs[(i + 1) % n] - cs[i - 1])
        elif i == 0:
            T = cs[1] - cs[0]
        elif i == n - 1:
            T = cs[-1] - cs[-2]
        else:
            T = (cs[i + 1] - cs[i]).normalized() + (cs[i] - cs[i - 1]).normalized()
        rx = r['rx']
        rf = r.get('rf', r.get('ry', rx))
        rb = r.get('rb', rf)
        pts = ring_pts(cs[i], T, r.get('hint', hint), rx, rf, rb, segs, r.get('e', e), r.get('rot', 0.0),
                       r.get('noise', noise), i, r.get('rs'))
        rows.append([bm.verts.new(p) for p in pts])
    last = n if closed else n - 1
    for i in range(last):
        A, B = rows[i], rows[(i + 1) % n]
        for j in range(segs):
            k = (j + 1) % segs
            bm.faces.new((A[j], A[k], B[k], B[j]))
    if not closed:
        for which, ok in ((0, cap0), (n - 1, cap1)):
            if not ok:
                continue
            row = rows[which]
            d = (cs[0] - cs[1]) if which == 0 else (cs[-1] - cs[-2])
            tip = cs[which] + d.normalized() * rings[which].get('cap', 0.0)
            cv = bm.verts.new(tip)
            for j in range(segs):
                bm.faces.new((row[j], row[(j + 1) % segs], cv))
    return finish(bm, name, material, smooth, angle)


class Profile:
    def __init__(self, rings):
        self.r = sorted(rings, key=lambda q: q[0])

    def at(self, z):
        r = self.r
        if z <= r[0][0]:
            return r[0]
        if z >= r[-1][0]:
            return r[-1]
        for i in range(len(r) - 1):
            if r[i][0] <= z <= r[i + 1][0]:
                p0 = r[max(i - 1, 0)]
                p1, p2 = r[i], r[i + 1]
                p3 = r[min(i + 2, len(r) - 1)]
                t = (z - p1[0]) / (p2[0] - p1[0])
                out = [z]
                for k in range(1, len(p1)):
                    a, b, c, d = p0[k], p1[k], p2[k], p3[k]
                    v = 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)
                    out.append(v)
                return out
        return r[-1]

    def point(self, z, a, off=0.0, cx=0.0):
        z_, cy, rx, rf, rb, e = self.at(z)
        ca, sa = math.cos(a), math.sin(a)
        x = se(ca, e) * (rx + off)
        y = se(sa, e) * ((rf if sa >= 0 else rb) + off)
        return Vector((cx + x, cy - y, z))

    def normal(self, z, a):
        p0 = self.point(z, a - 0.01)
        p1 = self.point(z, a + 0.01)
        t = (p1 - p0)
        n = Vector((t.y, -t.x, 0)).normalized()
        c = self.point(z, a) - Vector((0, self.at(z)[1], z))
        if n.dot(Vector((c.x, c.y, 0))) < 0:
            n = -n
        return n

    def loft(self, name, material, z0, z1, nrings, segs, cap0=True, cap1=True, noise=0.0, cap_bulge=(0, 0), angle=60):
        rings = []
        for i in range(nrings):
            z = z0 + (z1 - z0) * i / (nrings - 1)
            q = self.at(z)
            rings.append({'c': (0, q[1], z), 'rx': q[2], 'rf': q[3], 'rb': q[4], 'e': q[5], 'T': (0, 0, 1)})
        rings[0]['cap'] = cap_bulge[0]
        rings[-1]['cap'] = cap_bulge[1]
        return loft(name, rings, material, segs=segs, hint=(0, -1, 0), cap0=cap0, cap1=cap1, noise=noise, angle=angle)


def slab(name, grid_out, grid_in, material, smooth=True, angle=40, wrap=False, inner=True):
    bm = bmesh.new()
    R, C = len(grid_out), len(grid_out[0])
    O = [[bm.verts.new(p) for p in row] for row in grid_out]
    I = [[bm.verts.new(p) for p in row] for row in grid_in]
    cols = C if wrap else C - 1
    outer = []
    for i in range(R - 1):
        for j in range(cols):
            k = (j + 1) % C
            outer.append((bm.faces.new((O[i][j], O[i][k], O[i + 1][k], O[i + 1][j])), O[i][j].co - I[i][j].co))
            if inner:
                bm.faces.new((I[i][j], I[i + 1][j], I[i + 1][k], I[i][k]))
    for j in range(cols):
        k = (j + 1) % C
        bm.faces.new((O[0][j], I[0][j], I[0][k], O[0][k]))
        bm.faces.new((O[-1][j], O[-1][k], I[-1][k], I[-1][j]))
    if not wrap:
        for i in range(R - 1):
            bm.faces.new((O[i][0], O[i + 1][0], I[i + 1][0], I[i][0]))
            bm.faces.new((O[i][-1], I[i][-1], I[i + 1][-1], O[i + 1][-1]))
    if not inner:
        # an open shell: orient it so the outer skin faces out (away from the inner grid)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
        if sum(f.normal.dot(d) for f, d in outer) < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return finish(bm, name, material, smooth, angle, recalc=inner)


def panel(name, prof, z0, z1, a0, a1, off, thick, nz, na, material, inset=0.4, wrap=False, angle=40, cx=0.0, bulge=0.0,
          inner=True):
    zf0 = z0 if callable(z0) else (lambda a, v=z0: v)
    zf1 = z1 if callable(z1) else (lambda a, v=z1: v)
    gin, gout = [], []
    for i in range(nz + 1):
        ro, ri = [], []
        tz = i / nz
        for j in range(na + (0 if wrap else 1)):
            ta = j / na
            a = a0 + (a1 - a0) * ta
            za, zb = zf0(a), zf1(a)
            z = za + (zb - za) * tz
            edge = (i == 0 or i == nz or (not wrap and (j == 0 or j == na)))
            b = bulge * math.sin(math.pi * tz) * (1 if wrap else math.sin(math.pi * ta))
            ri.append(prof.point(z, a, off, cx))
            ro.append(prof.point(z, a, off + thick * ((1 - inset) if edge else 1.0) + b, cx))
        gin.append(ri)
        gout.append(ro)
    return slab(name, gout, gin, material, angle=angle, wrap=wrap, inner=inner)


def rbox(name, center, size, material, bevel=0.006, segs=2, basis=None, taper=None, smooth=True, angle=35):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
        if taper and v.co.z > 0:
            v.co.x *= taper[0]
            v.co.y *= taper[1]
    b = min(bevel, min(size) * 0.45)
    if b > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=b, segments=segs, affect='EDGES', profile=0.5)
    m = Matrix.Identity(4)
    if basis is not None:
        X, Y, Z = basis
        m = Matrix((X, Y, Z)).transposed().to_4x4()
    m.translation = Vector(center)
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return finish(bm, name, material, smooth, angle)


def cyl(name, p0, p1, r, material, segs=12, r1=None, caps=True, hint=(0, 0, 1), e=2.0):
    return loft(name, [{'c': p0, 'rx': r, 'e': e}, {'c': p1, 'rx': r if r1 is None else r1, 'e': e}], material,
                segs=segs, hint=hint, cap0=caps, cap1=caps, angle=40)


def surface_basis(prof, z, a):
    n = prof.normal(z, a)
    up = Vector((0, 0, 1))
    t = up.cross(n).normalized()
    return (t, n, up)


def on_surface(name, prof, z, a, off, size, material, bevel=0.006, taper=None, tilt=0.0, cx=0.0):
    t, n, up = surface_basis(prof, z, a)
    if tilt:
        up = (up * math.cos(tilt) + n * math.sin(tilt)).normalized()
        n2 = up.cross(t).normalized()
        n = n2 if n2.dot(n) > 0 else -n2
    p = prof.point(z, a, off, cx) + n * (size[1] * 0.5)
    return rbox(name, p, size, material, bevel=bevel, basis=(t, n, up), taper=taper)


def join(name, objs):
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


def mirror_x(o, name):
    me = o.data.copy()
    me.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
    me.flip_normals()
    m2 = bpy.data.objects.new(name, me)
    coll().objects.link(m2)
    me.name = name
    return m2


def tris(objs=None):
    total = 0
    out = {}
    for o in (objs or coll().objects):
        if o.type != 'MESH':
            continue
        n = sum(len(p.vertices) - 2 for p in o.data.polygons)
        out[o.name] = n
        total += n
    return total, out

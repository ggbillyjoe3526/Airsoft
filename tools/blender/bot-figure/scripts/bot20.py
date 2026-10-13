# --- v12 (Dev 6, owner 2026-10-13): the realistic human, from his reference photos ---------------------------------
# A modern airsoft player: a high-cut helmet with side rails, a front shroud, loop panels and shock cords; electronic
# ear defenders with a boom mic; wrap-round shooting glasses; a steel mesh lower-face mask over a balaclava; a combat
# shirt with camouflage sleeves, shoulder pockets and elbow pads; camouflage combat trousers with cargo pockets and hard
# knee pads; a plate carrier with a cummerbund, three open-top rifle magazine pouches, an admin pouch, a radio and a
# zip-on pack; a padded belt with the holster. Team colour shows the airsoft way: an armband on each arm, an ID patch
# on the chest, the back and the helmet.
#
# Same skeleton, scale and clips as v11: finalise() still measures the v11 parts for the scale, so every bone, clip,
# hand fit and the hit volume's legs stay exactly where they were; only what is drawn changes. The gloves (fitted to
# the replicas), the boots (fitted to the floor check) and the neck gaiter are v11's, re-dressed.
#
# Everything is built in build space (bot_body's SHOULDER, HIP, ...; final = build x 1.0039 + 4 mm up). Each part keeps
# a name the skin rules (bot10 RULES) know, so weight_all skins it; its material is a source surface (S_*) that dress_v12
# bakes into one texture atlas.
import bpy, bmesh, math
from mathutils import Vector, Matrix

B = bpy.app.driver_namespace['bot']

V12 = True


# --- small geometry kit -------------------------------------------------------------------------------------------
def _num_normal(F, u, v, du=1e-3, dv=1e-3):
    a = F(min(u + du, 1.0), v) - F(max(u - du, 0.0), v)
    b = F(u, min(v + dv, 1.0)) - F(u, max(v - dv, 0.0))
    n = a.cross(b)
    return n.normalized() if n.length > 1e-12 else Vector((0, 0, 1))


def detail_uv(o, params):
    """A second UV map, 'Detail': each vertex's own surface coordinates in metres (params[i] for vertex i), which the
    source surfaces draw their stitching, webbing and mesh by. Removed before export (only the atlas ships)."""
    me = o.data
    uvl = me.uv_layers.get('Detail') or me.uv_layers.new(name='Detail')
    for li, lp in enumerate(me.loops):
        uvl.data[li].uv = params[lp.vertex_index]
    return o


def _arclen(pts):
    out = [0.0]
    for i in range(1, len(pts)):
        out.append(out[-1] + (pts[i] - pts[i - 1]).length)
    return out


def sheet(name, F, nu, nv, material, wrap=False, thick=0.0, out_from=None, smooth=True, angle=50,
          pole0=False, pole1=False, us=None, vs=None, mats=None, skirt=0.0):
    """A grid surface F(u, v) (u, v in 0..1; u round the wrap when `wrap`). `thick` > 0 makes a closed slab that far
    in along the surface normal (oriented away from `out_from` when given). `skirt` > 0 (not wrapped) instead turns
    only the border that far in: a raised moulding on a surface, without the hidden back face. `us`/`vs` override the
    sample spacing. `mats(i, j)` may pick a material index per face (materials are `material` plus any appended
    later)."""
    us = us or [i / (nu if wrap else nu - 1) for i in range(nu)]
    vs = vs or [j / (nv - 1) for j in range(nv)]
    cols = len(us)
    bm = bmesh.new()
    P = [[F(u, v) for u in us] for v in vs]
    N = [[_num_normal(F, u, v) for u in us] for v in vs]
    if out_from is not None:
        c = Vector(out_from)
        s = sum((N[j][i].dot(P[j][i] - c)) for j in range(len(vs)) for i in range(cols))
        if s < 0:
            N = [[-n for n in row] for row in N]
    # surface coordinates in metres: along u by the middle row's length, along v by the middle column's
    mid = P[len(vs) // 2] + ([P[len(vs) // 2][0]] if wrap else [])
    su = _arclen(mid)
    sv = _arclen([P[j][cols // 2] for j in range(len(vs))])
    par = []
    A = []
    for j, row in enumerate(P):
        A.append([bm.verts.new(p) for p in row])
        par += [(su[i], sv[j]) for i in range(cols)]
    rng = range(cols if wrap else cols - 1)
    for j in range(len(vs) - 1):
        for i in rng:
            k = (i + 1) % cols
            f = bm.faces.new((A[j][i], A[j][k], A[j + 1][k], A[j + 1][i]))
            if mats:
                f.material_index = mats(i, j)
    if thick:
        Bv = []
        for j in range(len(vs)):
            Bv.append([bm.verts.new(P[j][i] - N[j][i] * thick) for i in range(cols)])
            par += [(su[i], sv[j]) for i in range(cols)]
        for j in range(len(vs) - 1):
            for i in rng:
                k = (i + 1) % cols
                bm.faces.new((Bv[j][i], Bv[j + 1][i], Bv[j + 1][k], Bv[j][k]))
        for j in (0, len(vs) - 1):
            for i in rng:
                k = (i + 1) % cols
                f = (A[j][i], Bv[j][i], Bv[j][k], A[j][k]) if j == 0 else (A[j][i], A[j][k], Bv[j][k], Bv[j][i])
                bm.faces.new(f)
        if not wrap:
            for j in range(len(vs) - 1):
                bm.faces.new((A[j][0], A[j + 1][0], Bv[j + 1][0], Bv[j][0]))
                bm.faces.new((A[j][-1], Bv[j][-1], Bv[j + 1][-1], A[j + 1][-1]))
    if skirt and not thick and not wrap:
        rows = len(vs)
        ring = ([(0, i) for i in range(cols)] + [(j, cols - 1) for j in range(1, rows)] +
                [(rows - 1, i) for i in range(cols - 2, -1, -1)] + [(j, 0) for j in range(rows - 2, 0, -1)])
        inner = []
        for j, i in ring:
            inner.append(bm.verts.new(P[j][i] - N[j][i] * skirt))
            par.append((su[i], sv[j] - skirt))
        for q in range(len(ring)):
            (j0, i0), (j1, i1) = ring[q], ring[(q + 1) % len(ring)]
            bm.faces.new((A[j0][i0], inner[q], inner[(q + 1) % len(ring)], A[j1][i1]))
    for flag, row in ((pole0, 0), (pole1, len(vs) - 1)):
        if flag and wrap:
            c = sum((p for p in P[row]), Vector()) / cols
            pv = bm.verts.new(c)
            par.append((su[cols // 2], sv[row]))
            for i in range(cols):
                bm.faces.new((A[row][i], A[row][(i + 1) % cols], pv))
    o = finish(bm, name, material, smooth, angle, recalc=True)
    if out_from is not None:
        _orient_out(o, Vector(out_from))
    return detail_uv(o, par)


def _orient_out(o, c):
    me = o.data
    s = sum(p.normal.dot(p.center - c) * p.area for p in me.polygons)
    if s < 0:
        me.flip_normals()


def strip(name, pts, ups, w, t, material, closed=False, smooth=True, angle=60, out=None, sides=4):
    """A band along `pts` (w across along `ups`, t thick along the side normal): straps, rails, binding. sides=2 is a
    bare ribbon (its outer face and one edge face: for straps lying on a surface)."""
    bm = bmesh.new()
    n = len(pts)
    rows = []
    along = _arclen(pts + ([pts[0]] if closed else []))
    par = []
    for i, p in enumerate(pts):
        T = (pts[(i + 1) % n] - pts[i - 1]) if closed else (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)])
        T.normalize()
        U = Vector(ups[i])
        U = (U - T * U.dot(T)).normalized()
        Sd = T.cross(U).normalized()
        if out is not None and Sd.dot(p - Vector(out)) < 0:
            Sd = -Sd
        h = w * 0.5
        rows.append([bm.verts.new(p + U * h), bm.verts.new(p + U * h + Sd * t), bm.verts.new(p - U * h + Sd * t),
                     bm.verts.new(p - U * h)])
        par += [(along[i], h), (along[i], h), (along[i], -h), (along[i], -h)]
    last = n if closed else n - 1
    ks = range(4) if sides == 4 else (1,)
    for i in range(last):
        a, b = rows[i], rows[(i + 1) % n]
        for k in ks:
            q = (k + 1) % 4
            bm.faces.new((a[k], a[q], b[q], b[k]))
    if not closed and sides == 4:
        bm.faces.new(rows[0][::-1])
        bm.faces.new(rows[-1])
    o = finish(bm, name, material, smooth, angle, recalc=True)
    if out is not None:
        _orient_out(o, Vector(out))
    bm2 = None
    # drop the verts a bare ribbon doesn't use
    if sides != 4:
        bm2 = bmesh.new()
        bm2.from_mesh(o.data)
        bmesh.ops.delete(bm2, geom=[v for v in bm2.verts if not v.link_faces], context='VERTS')
        keep = [i for i in range(len(par)) if i % 4 in (1, 2)]
        bm2.to_mesh(o.data)
        bm2.free()
        par = [par[i] for i in keep]
    return detail_uv(o, par)


def cord(name, pts, r, material, segs=6, smooth=True, caps=True):
    """A round cord along `pts` (shock cords, cables, the mic boom)."""
    rings = [{'c': tuple(p), 'rx': r} for p in pts]
    return loft(name, rings, material, segs=segs, hint=(0, 0, 1), cap0=caps, cap1=caps, angle=80)


def catmull(pts, n):
    pts = [Vector(p) for p in pts]
    out = []
    K = len(pts)
    for s in range(n):
        u = (K - 1) * s / (n - 1)
        i = min(int(u), K - 2)
        t = u - i
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, K - 1)]
        out.append(cr(p0, p1, p2, p3, t))
    return out


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def keyed(keys, x, period=None):
    """Piecewise-smooth interpolation through (x, y) keys (sorted)."""
    ks = list(keys)
    if x <= ks[0][0]:
        return ks[0][1]
    if x >= ks[-1][0]:
        return ks[-1][1]
    for i in range(len(ks) - 1):
        if ks[i][0] <= x <= ks[i + 1][0]:
            p0 = ks[max(i - 1, 0)][1]
            p3 = ks[min(i + 2, len(ks) - 1)][1]
            t = (x - ks[i][0]) / (ks[i + 1][0] - ks[i][0])
            return cr(p0, ks[i][1], ks[i + 1][1], p3, t)
    return ks[-1][1]


def onto(tree, pts, centre, off, axis=None):
    """Each point moved onto the surface in `tree` along the ray from `centre` (or from its own height on `axis`
    when given: a vertical line through centre), then `off` out along that ray."""
    out = []
    for p in pts:
        c = Vector(centre)
        if axis == 'z':
            c = Vector((c.x, c.y, p.z))
        d = (p - c)
        if d.length < 1e-9:
            out.append(p)
            continue
        d.normalize()
        hit, n, i, dist = tree.ray_cast(c, d)
        out.append((hit + d * off) if hit is not None else p)
    return out


def box(name, center, size, material, basis=None, bevel=0.0):
    """A plain (or once-bevelled) box: 12 triangles, or 44 with a bevel."""
    return rbox(name, center, size, material, bevel=bevel, segs=1, basis=basis, angle=30)


# --- source surfaces (baked into the atlas by dress_v12; their look is set in bot21) --------------------------------
SURFACES = ('Camo', 'Jersey', 'Nylon', 'Webbing', 'Loop', 'Polymer', 'Rubber', 'Metal', 'Mesh', 'Knit', 'Elastic',
            'Leather', 'Suede', 'Sole', 'Glove', 'GlovePalm', 'Pad', 'Team', 'Lens', 'Cable', 'Mag')
SURF_COL = {'Camo': 0x8a7f62, 'Jersey': 0x7d7258, 'Nylon': 0x6f5d43, 'Webbing': 0x6a593f, 'Loop': 0x5e5240,
            'Polymer': 0x6b5d45, 'Rubber': 0x26241f, 'Metal': 0x3a3a38, 'Mesh': 0x6e5d43, 'Knit': 0x2a2b26,
            'Elastic': 0x3b3a30, 'Leather': 0x6e5a42, 'Suede': 0x7a6347, 'Sole': 0x2a2622, 'Glove': 0x2a2a28,
            'GlovePalm': 0x9c8662, 'Pad': 0x2f2f2b, 'Team': 0xe8e8e8, 'Lens': 0x1a2026, 'Cable': 0x141414,
            'Mag': 0x1e1e1f}


def S(name):
    """The source surface material `S_<name>` (a plain stand-in until bot21 gives it its procedural look)."""
    n = 'S_' + name
    m = bpy.data.materials.get(n)
    if m is None or not m.get('surface'):
        m = mat(n, SURF_COL[name], rough=0.8)
    return m


# --- the head (rigid to Head) ---------------------------------------------------------------------------------------
HC = Vector((0.0, 0.012, 1.597))        # the helmet shell's centre
HA = (0.1065, 0.1285, 0.1265)           # its half sizes: across, front to back, up
HE = 2.25                               # a little squarer than an ellipsoid round the sides
HEAD_IN = Vector((0.0, 0.006, 1.575))   # inside the head: rays out from here find the balaclava
# the rim's height (build space) by azimuth (degrees from the front towards the figure's left): the brim over the
# brow, cut high over the ear, down over the nape
RIM = [(0, 1.629), (28, 1.627), (52, 1.613), (68, 1.622), (88, 1.634), (108, 1.622), (126, 1.598), (150, 1.577),
       (180, 1.569)]


def rim_z(th):
    a = abs(((math.degrees(th) + 180) % 360) - 180)
    return keyed(RIM, a)


def shell_pt(th, ph, off=0.0):
    """The shell at azimuth th (0 front, +pi/2 the figure's left) and polar angle ph from the crown, `off` outward."""
    s, c = math.sin(ph), math.cos(ph)
    hx = math.copysign(abs(math.sin(th)) ** (2.0 / HE), math.sin(th))
    hy = math.copysign(abs(math.cos(th)) ** (2.0 / HE), math.cos(th))
    return Vector((HC.x + (HA[0] + off) * s * hx, HC.y - (HA[1] + off) * s * hy, HC.z + (HA[2] + off) * c))


def rim_ph(th):
    return math.acos(max(-0.99, min(0.99, (rim_z(th) - HC.z) / HA[2])))


def shell_normal(th, ph):
    return (shell_pt(th, ph, 0.01) - shell_pt(th, ph, 0.0)).normalized()


def shell_basis(th, ph):
    n = shell_normal(th, ph)
    up = (shell_pt(th, ph - 0.03) - shell_pt(th, ph + 0.03)).normalized()
    side = up.cross(n).normalized()
    return side, n, n.cross(side).normalized()


def helmet_shell():
    """The shell from the crown to the cut, its last two rows the rubber edge trim turned in under the rim."""
    cols = 24

    def F(u, v):
        th = u * TAU
        if v <= 0.9:
            return shell_pt(th, rim_ph(th) * (0.06 + 0.94 * v / 0.9))
        ph = rim_ph(th)
        t = (v - 0.9) / 0.1                        # round the edge: out, under and in
        a = math.pi * t
        n = shell_normal(th, ph)
        down = (shell_pt(th, ph + 0.02) - shell_pt(th, ph)).normalized()
        return shell_pt(th, ph) + n * (0.0035 * math.sin(a) - 0.008 * t) + down * 0.004 * math.sin(a)
    rows = [0.0, 0.18, 0.34, 0.48, 0.61, 0.72, 0.81, 0.87, 0.9, 0.95, 1.0]
    sh = sheet('HelmetShell', F, cols, 0, S('Polymer'), wrap=True, out_from=HC, pole0=True, vs=rows,
               mats=lambda i, j: 1 if j >= len(rows) - 4 else 0)
    sh.data.materials.append(S('Rubber'))
    return [sh]


def _patch(name, th0, th1, ph0, ph1, off, material, nu=4, nv=3):
    """A loop panel lying on the shell: a thin raised pad, its top and its edges (no underside)."""
    def F(u, v):
        return shell_pt(th0 + (th1 - th0) * u, ph0 + (ph1 - ph0) * v, off)
    o = sheet(name, F, nu + 1, nv + 1, material, thick=off - 0.0005, out_from=HC, angle=35)
    # drop the underside (it lies on the shell)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    under = [f for f in bm.faces if f.normal.dot((f.calc_center_median() - HC).normalized()) < -0.8]
    bmesh.ops.delete(bm, geom=under, context='FACES_ONLY')
    bm.to_mesh(o.data)
    bm.free()
    return o


def helmet_kit():
    d = math.radians
    parts = []
    # loop panels on the crown and either side above the rail; the back one is the team ID patch
    parts.append(_patch('HelmetLoopTop', d(-24), d(24), d(8), d(42), 0.0035, S('Loop')))
    parts.append(_patch('HelmetTeamBack', d(152), d(208), d(54), d(80), 0.0035, S('Team')))
    for sd, sg in (('L', 1), ('R', -1)):
        a0, a1 = (d(62), d(104)) if sg > 0 else (d(-104), d(-62))
        parts.append(_patch('HelmetLoop_' + sd, a0, a1, d(36), d(55), 0.0035, S('Loop')))
    # side rails: a bar along the cut from the temple to behind the ear, and the clamp of each ear defender's arm
    for sd, sg in (('L', 1), ('R', -1)):
        pts, ups = [], []
        for k in range(8):
            th = sg * d(44 + 84 * k / 7)
            ph = rim_ph(th) - 0.13 - 0.03 * math.sin(math.pi * k / 7)
            pts.append(shell_pt(th, ph, 0.0005))
            ups.append((shell_pt(th, ph - 0.02) - shell_pt(th, ph + 0.02)).normalized())
        parts.append(strip('HelmetRail_' + sd, pts, ups, 0.019, 0.0085, S('Polymer'), out=HC, angle=35))
    # the front shroud and its mount
    side, n, up = shell_basis(0.0, d(50))
    p = shell_pt(0.0, d(50), 0.0)
    parts.append(rbox('HelmetShroud', p + n * 0.003, (0.060, 0.007, 0.034), S('Polymer'), bevel=0.0025, segs=1,
                      basis=(side, n, up), taper=(0.76, 1.0), angle=30))
    parts.append(box('HelmetShroudMount', p + n * 0.0095 - up * 0.004, (0.024, 0.008, 0.017), S('Metal'),
                     basis=(side, n, up), bevel=0.0015))
    # shock cords from beside the shroud back over the shell to the rails
    for sd, sg in (('L', 1), ('R', -1)):
        pts = []
        for k in range(5):
            t = k / 4
            th = sg * d(12 + 66 * t)
            ph = d(44) + (rim_ph(th) - 0.17 - d(44)) * t * t + d(6) * math.sin(math.pi * t)
            pts.append(shell_pt(th, ph, 0.0062))
        parts.append(cord('HelmetCord_' + sd, pts, 0.0021, S('Elastic'), segs=3, caps=False))
    # the counterweight pouch under the ID patch
    side, n, up = shell_basis(math.pi, d(92))
    parts.append(pillow('HelmetPouch', shell_pt(math.pi, d(92), 0.011), (0.066, 0.02, 0.032), S('Nylon'),
                        basis=(side, n, up), bevel=0.007, segs=1, bulge=0.003))
    return parts


def chin_straps(tree):
    """The harness: a strap from in front of each ear down along the jaw to the chin cup."""
    parts = []
    d = math.radians
    for sd, sg in (('L', 1), ('R', -1)):
        th = sg * d(70)
        top = shell_pt(th, rim_ph(th) - 0.03, -0.010)
        guide = [top, Vector((sg * 0.086, -0.022, 1.565)), Vector((sg * 0.080, -0.030, 1.522)),
                 Vector((sg * 0.058, -0.064, 1.478)), Vector((sg * 0.022, -0.086, 1.458)), Vector((0.0, -0.090, 1.454))]
        pts = onto(tree, catmull(guide, 9), HEAD_IN, 0.0045)
        pts[0] = top
        ups = []
        for i, p in enumerate(pts):
            T = (pts[min(i + 1, 8)] - pts[max(i - 1, 0)]).normalized()
            o = (p - HEAD_IN).normalized()
            ups.append(T.cross(o))
        parts.append(strip('HelmetStrap_' + sd, pts, ups, 0.012, 0.0022, S('Webbing'), out=HEAD_IN, sides=2))
    return parts


# electronic ear defenders on rail adapters, with the boom mic on the left
CUP_C = Vector((0.0, 0.006, 1.574))


def ear_cup(sd):
    sg = 1 if sd == 'L' else -1
    x0 = 0.075
    keys = [(0.000, 0.039, 0.048, 2.3), (0.008, 0.043, 0.053, 2.3), (0.014, 0.041, 0.051, 2.7), (0.029, 0.041, 0.051, 2.7),
            (0.039, 0.034, 0.042, 2.5), (0.043, 0.020, 0.026, 2.2)]
    rings = []
    for dx, ry, rz, e in keys:
        rings.append({'c': (sg * (x0 + dx), CUP_C.y, CUP_C.z), 'rx': rz, 'rf': ry, 'rb': ry, 'e': e,
                      'T': (sg, 0, 0), 'hint': (0, -1, 0)})
    rings[-1]['cap'] = 0.003
    cup = loft('EarCup_' + sd, rings[1:], S('Polymer'), segs=14, hint=(0, -1, 0), cap0=False, cap1=True, angle=50)
    cush = loft('EarCushion_' + sd, rings[:2], S('Leather'), segs=14, hint=(0, -1, 0), cap0=True, cap1=False, angle=60)
    parts = [cup, cush]
    parts.append(cyl('EarKnob_' + sd, Vector((sg * (x0 + 0.033), CUP_C.y - 0.026, CUP_C.z - 0.027)),
                     Vector((sg * (x0 + 0.041), CUP_C.y - 0.026, CUP_C.z - 0.027)), 0.0072, S('Rubber'), segs=6,
                     hint=(0, 0, 1)))
    # the rail adapter: an arm from the cup's top up to its clamp on the rail
    top = Vector((sg * (x0 + 0.028), CUP_C.y + 0.004, CUP_C.z + 0.045))
    th = sg * math.radians(92)
    rail = shell_pt(th, rim_ph(th) - 0.13, 0.0095)
    up = (rail - top).normalized()
    fwd = Vector((0, -1, 0))
    side = up.cross(fwd).normalized()
    fwd = side.cross(up).normalized()
    parts.append(box('EarArm_' + sd, (top + rail) / 2, (0.009, 0.015, (rail - top).length + 0.01), S('Polymer'),
                     basis=(side, fwd, up), bevel=0.002))
    parts.append(box('EarClamp_' + sd, rail + side * 0.002, (0.011, 0.028, 0.015), S('Polymer'),
                     basis=(side, fwd, up), bevel=0.002))
    return parts


def boom_mic():
    p0 = Vector((0.106, CUP_C.y - 0.034, CUP_C.z - 0.024))
    pts = catmull([p0, Vector((0.103, -0.062, 1.538)), Vector((0.080, -0.106, 1.511)), Vector((0.040, -0.140, 1.505))], 7)
    return [cord('MicBoom', pts, 0.0026, S('Cable'), segs=5),
            loft('MicFoam', [{'c': (0.035, -0.142, 1.5048), 'rx': 0.0072}, {'c': (0.025, -0.145, 1.5044), 'rx': 0.0079},
                             {'c': (0.016, -0.145, 1.504), 'rx': 0.0066}], S('Knit'), segs=6, hint=(0, 0, 1),
                 cap0=True, cap1=True)]


# shooting glasses: a single wrap lens, a thin brow bar and arms back under the ear cups
GL_C = Vector((0.0, 0.004, 1.600))


def lens_pt(u, v, off=0.0):
    a = math.radians(-76 + 152 * u)
    x = (0.0905 + off) * math.sin(a)
    c = math.cos(a)
    y = GL_C.y - (0.1245 + off) * (c ** 0.9)
    top = 1.6215 - 0.004 * (math.sin(a) ** 2)
    bot = 1.5835 + 0.0045 * (math.sin(a) ** 2) + 0.010 * math.exp(-(a / 0.16) ** 2)
    return Vector((x, y, bot + (top - bot) * v))


def glasses(tree):
    lens = sheet('GlassLens', lens_pt, 15, 3, S('Lens'), out_from=GL_C + Vector((0, 0.05, 0)), angle=70)
    bar = [lens_pt(k / 8, 1.0) + Vector((0, 0, 0.0012)) for k in range(9)]
    parts = [lens, strip('GlassFrame', bar, [Vector((0, 0, 1))] * 9, 0.0042, 0.0045, S('Rubber'), out=GL_C)]
    for sd, sg in (('L', 1), ('R', -1)):
        a = lens_pt(1.0 if sg > 0 else 0.0, 0.85)
        pts = onto(tree, catmull([a, Vector((sg * 0.09, 0.0, 1.6155)), Vector((sg * 0.087, 0.040, 1.611)),
                                  Vector((sg * 0.080, 0.062, 1.598))], 6), HEAD_IN, 0.0025, axis='z')
        pts[0] = a
        parts.append(strip('GlassArm_' + sd, pts, [Vector((0, 0, 1))] * 6, 0.0045, 0.0022, S('Rubber'), out=HEAD_IN))
    return parts


# the lower-face mask: coyote-painted steel mesh in a bound edge, held by two elastic straps round the head
MASK_ROWS = [  # z, half width across, front distance (from y = 0.012), its squareness
    (1.4640, 0.040, 0.088, 2.0), (1.4770, 0.061, 0.108, 2.1), (1.4960, 0.073, 0.122, 2.2), (1.5200, 0.080, 0.131, 2.2),
    (1.5450, 0.083, 0.135, 2.2), (1.5650, 0.084, 0.135, 2.2), (1.5800, 0.084, 0.132, 2.1)]


def mask_pt(u, v, off=0.0):
    z, rx, ry, e = (keyed([(k, r[i]) for k, r in enumerate(MASK_ROWS)], v * (len(MASK_ROWS) - 1)) for i in range(4))
    a = math.radians(-96 + 192 * u)
    x = se(math.sin(a), e) * (rx + off)
    c = math.cos(a)
    y = 0.012 - se(c, e) * (ry + off) if c > 0 else 0.012 - c * 0.02
    return Vector((x, y, z))


MASK_STANDOFF = (0.010, 0.006)          # clear of the balaclava: in front of the mouth, at the jaw's sides


def mesh_mask(tree):
    nu, nv = 13, 6
    # the outer ring of faces is the fabric binding: material 1
    us = [0.0, 0.035] + [0.035 + 0.93 * k / (nu - 4) for k in range(1, nu - 3)] + [0.965, 1.0]
    vs = [0.0, 0.07] + [0.07 + 0.86 * k / (nv - 3) for k in range(1, nv - 2)] + [0.93, 1.0]

    def F(u, v):
        p = mask_pt(u, v)
        c = Vector((0.0, 0.006, p.z))
        d = p - c
        L = d.length
        d.normalize()
        hit, n, i, dist = tree.ray_cast(c, d)
        if hit is None:
            return p
        need = (hit - c).length + MASK_STANDOFF[1] + (MASK_STANDOFF[0] - MASK_STANDOFF[1]) * max(0.0, -d.y)
        return c + d * max(L, need)
    ring = lambda i, j: 1 if (i == 0 or j == 0 or i == len(us) - 2 or j == len(vs) - 2) else 0
    m = sheet('MeshMask', F, 0, 0, S('Mesh'), out_from=Vector((0, 0.03, 1.52)), angle=70, us=us, vs=vs, mats=ring)
    m.data.materials.append(S('Nylon'))
    parts = [m]
    for nm, z, w in (('MaskStrapTop', 1.586, 0.014), ('MaskStrapLow', 1.523, 0.014)):
        guide = []
        for k in range(13):
            a = math.radians(-96 + 192 * k / 12) + math.pi
            guide.append(Vector((0.085 * math.sin(a), 0.006 - 0.12 * math.cos(a), z + 0.008 * math.cos(a))))
        pts = onto(tree, guide, HEAD_IN, 0.0015, axis='z')
        parts.append(strip(nm, pts, [Vector((0, 0, 1))] * len(pts), w, 0.0018, S('Elastic'), out=HEAD_IN, sides=2))
    return parts


def head_v12(old_head, extra=()):
    """The head: v11's balaclava, then the helmet, ear defenders, glasses and mask. `extra` (the neck gaiter) only
    keeps the mask's lower edge clear of it."""
    bal = [o for o in old_head if o.name.startswith('Balaclava')]
    for o in old_head:
        if o not in bal:
            bpy.data.objects.remove(o, do_unlink=True)
    for o in bal:
        o.data.materials.clear()
        o.data.materials.append(S('Knit'))
    tree = bvh(bal)
    mask = mesh_mask(bvh(bal + list(extra)))
    parts = bal + helmet_shell() + helmet_kit() + chin_straps(bvh(bal + mask[:1]))
    for sd in 'LR':
        parts += ear_cup(sd)
    parts += boom_mic() + glasses(tree) + mask
    return parts


B['head_v12'] = head_v12


# --- the body (v11's shapes, fitted to the rig and the replicas; new pads and pockets sewn on) ----------------------
def limb_patch(name, tree, a, b, e1, t0, t1, a0, a1, nu, nv, lift, material, edge=0.2, dome=0.25, tuck=0.002,
               mats=None, rounded=0.0):
    """A pad, pocket or flap lying on a limb's surface (in `tree`): it spans t0..t1 along the axis a -> b and a0..a1
    degrees round it (0 towards e1), stands `lift` off the surface with rounded edges, and its rim tucks `tuck` into
    the cloth so no gap shows under it. `rounded` > 0 rounds its outline's corners (a knee cap's oval)."""
    a, b = Vector(a), Vector(b)
    ax = (b - a).normalized()
    e1 = Vector(e1)
    e1 = (e1 - ax * e1.dot(ax)).normalized()
    e2 = ax.cross(e1)

    def base(u, v):
        if rounded:
            w = 1.0 - rounded * (1.0 - math.sqrt(max(0.0, 1.0 - (2 * v - 1) ** 2)))
            u = 0.5 + (u - 0.5) * w
        t = t0 + (t1 - t0) * v
        ang = math.radians(a0 + (a1 - a0) * u)
        c = a + (b - a) * t
        d = e1 * math.cos(ang) + e2 * math.sin(ang)
        hit, n, i, dist = tree.ray_cast(c, d)
        return (hit if hit is not None else c + d * 0.05), d

    def h(x):
        if x <= 1e-6 or x >= 1 - 1e-6:
            return -tuck
        r = min(x, 1 - x) / edge
        return lift * (0.55 + 0.45 * smoothstep(0.0, 1.0, r))

    def F(u, v):
        p, d = base(u, v)
        hh = min(h(u), h(v))
        if hh > 0:
            hh += lift * dome * math.sin(math.pi * u) * math.sin(math.pi * v)
        return p + d * hh
    ring = lambda n: [0.0, 0.035] + [edge + (1 - 2 * edge) * k / (n - 1) for k in range(n)] + [0.965, 1.0]
    mid = a + (b - a) * (0.5 * (t0 + t1))
    return sheet(name, F, 0, 0, material, us=ring(nu), vs=ring(nv), out_from=mid, angle=40, mats=mats)


def _bones():
    return {n: (Vector(h), Vector(t)) for n, par, h, t, z in skeleton_points()}


REMAT = (('Shirt', 'Jersey'), ('Gaiter', 'Knit'), ('Sleeve', 'Camo'), ('Armband', 'Team'), ('Knuckle', 'Rubber'),
         ('Glove', 'Glove'), ('CuffStrap', 'Elastic'), ('Trousers', 'Camo'), ('Boot', 'Suede'), ('Sole', 'Sole'),
         ('Lugs', 'Sole'), ('Laces', 'Cable'), ('KneeStrap', 'Elastic'))


def remat(objs, table):
    for o in objs:
        for pre, surf in table:
            if o.name.startswith(pre):
                o.data.materials.clear()
                o.data.materials.append(S(surf))
                break


def shirt_collar(gaiter):
    """The combat shirt's stand-up collar round the gaiter, open at the throat."""
    tree = bvh([gaiter])
    z0, z1 = 1.430, 1.484
    c = Vector((0.0, 0.010, 0.0))

    def F(u, v):
        a = math.radians(26 + 308 * u)                 # 0 is the throat (-y), round by the figure's left
        d = Vector((math.sin(a), -math.cos(a), 0.0))
        z = z0 + (z1 - z0) * v
        o = Vector((c.x, c.y, z))
        hit, n, i, dist = tree.ray_cast(o, d)
        r = (hit - o).length if hit is not None else 0.065
        return o + d * (r + 0.004 + 0.005 * v)
    return sheet('ShirtCollar', F, 15, 3, S('Camo'), thick=0.0025, out_from=Vector((0, 0.01, 1.46)), angle=50)


def arm_kit(sd, sleeve, bones):
    """A shoulder pocket with a loop-panel flap on the upper arm, and the shirt's built-in elbow pad."""
    sg = 1 if sd == 'L' else -1
    tree = bvh([sleeve])
    ua0, ua1 = bones['UpperArm_' + sd]
    fa0, fa1 = bones['Forearm_' + sd]
    out = Vector((sg, 0.0, 0.0))
    parts = []
    L = (ua1 - ua0).length
    t = lambda m: m / L
    # pocket: 2.5 to 10.5 cm down the upper arm, centred a little forward of the outside of the arm
    a0, a1 = (-38, 62) if sg > 0 else (-62, 38)        # positive angles run forward on the left arm, back on the right
    parts.append(limb_patch('SleevePocket_' + sd, tree, ua0, ua1, out, t(0.028), t(0.108), a0, a1, 4, 4, 0.0075,
                            S('Camo'), edge=0.18, dome=0.35))
    loop = lambda i, j: 1 if (1 <= i <= 4 and 1 <= j <= 3) else 0
    flap = limb_patch('SleeveFlap_' + sd, tree, ua0, ua1, out, t(0.022), t(0.062), a0 - 4, a1 + 4, 4, 2, 0.0108,
                      S('Camo'), edge=0.16, dome=0.25, mats=loop)
    flap.data.materials.append(S('Loop'))
    parts.append(flap)
    # elbow pad: on the back of the elbow, a little over each bone
    e = fa0
    back = Vector((0.0, 1.0, 0.0))
    parts.append(limb_patch('SleeveElbow_' + sd, tree, e - (ua1 - ua0).normalized() * 0.075,
                            e + (fa1 - fa0).normalized() * 0.075, back, 0.05, 0.95, -58, 58, 4, 4, 0.0065,
                            S('Camo'), edge=0.22, dome=0.35, rounded=0.45))
    return parts


def leg_kit(sd, trousers, bones):
    """Hard-shell knee pad over a padded body, and a cargo pocket with its flap on the outside of the thigh."""
    sg = 1 if sd == 'L' else -1
    tree = bvh([trousers])
    th0, th1 = bones['Thigh_' + sd]
    sh0, sh1 = bones['Shin_' + sd]
    k = sh0
    front = Vector((0.0, -1.0, 0.0))
    a = k - (th1 - th0).normalized() * 0.085
    b = k + (sh1 - sh0).normalized() * 0.095
    parts = [limb_patch('KneePad_' + sd, tree, a, b, front, 0.0, 1.0, -74, 74, 5, 5, 0.0105, S('Nylon'),
                        edge=0.16, dome=0.15, rounded=0.3)]
    parts.append(limb_patch('KneePadCap_' + sd, tree, a, b, front, 0.1, 0.9, -52, 52, 4, 5, 0.0215, S('Polymer'),
                            edge=0.22, dome=0.32, tuck=-0.006, rounded=0.6))
    # its two elastic straps round the back of the leg, above and below the knee
    for nm, t in (('KneeStrapTop_', 0.2), ('KneeStrapLow_', 0.8)):
        c = a + (b - a) * t
        ax = (b - a).normalized()
        e1 = (front - ax * front.dot(ax)).normalized()
        e2 = ax.cross(e1)
        ring = [c + (e1 * math.cos(math.radians(g)) + e2 * math.sin(math.radians(g))) * 0.2
                for g in range(66, 295, 12)]
        pts = onto(tree, ring, c, 0.0028)
        parts.append(strip(nm + sd, pts, [ax] * len(pts), 0.024, 0.0016, S('Elastic'), out=c, sides=2))
    # the cargo pocket: on the outside of the thigh, its front edge a little forward
    out = Vector((sg, 0.0, 0.0))
    L = (th1 - th0).length
    p0, p1 = (-34, 48) if sg > 0 else (-48, 34)        # positive angles run forward on the left leg, back on the right
    parts.append(limb_patch('Cargo_' + sd, tree, th0, th1, out, 0.30, 0.62, p0, p1, 4, 5, 0.017, S('Camo'),
                            edge=0.16, dome=0.45))
    parts.append(limb_patch('CargoFlap_' + sd, tree, th0, th1, out, 0.285, 0.385, p0 - 3, p1 + 3, 4, 2, 0.0215,
                            S('Camo'), edge=0.2, dome=0.3))
    return parts




# --- the hands (owner's references, 2026-10-13): a tactical glove over an anatomical hand ----------------------------
# Each finger is its own tube along its three bones: knuckles that stand proud at the joints, slimmer shafts between,
# fleshy pads on the palm side, a rounded tip. The palm is a loft from the wrist to the knuckle line with the thumb's
# ball (thenar) on its index side; a short cuff over the sleeve with a strap; a moulded knuckle guard. The fingers keep
# v11's thicknesses (measured off its glove), which the replica grips were solved with.
# Their skin is written here, not by the rules: each finger follows only its own bones (half and half at each joint),
# so a finger never drags its neighbour when one points along the frame and the others curl round the grip.
FINGER_R = {'Index': (0.0118, 0.0106, 0.0096), 'Middle': (0.0122, 0.0108, 0.0098),
            'Ring': (0.0115, 0.0104, 0.0093), 'Pinky': (0.0102, 0.0093, 0.0082), 'Thumb': (0.0124, 0.0114, 0.0102)}
FINGER_RINGS = [  # (bone 1-3, t along it, half width, back, palm side: shares of its radius[, drawn in: below])
    (1, -0.4, 0.8, 0.66, 0.7, 0.25), (1, 0.0, 1.06, 1.03, 0.94), (1, 0.5, 0.93, 0.83, 0.96),
    (2, -0.13, 1.06, 1.12, 0.84), (2, 0.13, 1.05, 1.08, 0.84), (2, 0.55, 0.92, 0.80, 0.95),
    (3, -0.14, 1.03, 1.0, 0.85), (3, 0.14, 1.01, 0.94, 0.86), (3, 0.5, 0.98, 0.76, 0.99), (3, 0.8, 0.92, 0.68, 0.92),
    (3, 0.97, 0.62, 0.46, 0.64)]
JOINT_SPAN = 0.2     # rings this close to a finger joint (share of the bone) are shared with the bone before it
# (the pair stands proud on the back, as a glove bunches over a knuckle: blended skin cuts a bent joint's corner, and a
# curled finger round a grip would otherwise read as a sharp V)
# each root ring is drawn in towards the palm's middle (6th value: share of the way) and slimmed, so every tube starts
# inside the palm: the thumb's bone starts beside the palm, the index and pinky at its edges, and their open ends showed
THUMB_RINGS = [(1, -0.3, 0.8, 0.76, 0.76, 0.45), (1, 0.2, 1.0, 0.9, 0.98), (1, 0.65, 0.95, 0.86, 0.95)] + FINGER_RINGS[3:]
PALM_RINGS = [  # (share of wrist -> knuckle line, half width, back, palm side, shift towards the index side)
    (0.0, 0.0290, 0.0160, 0.0172, 0.0), (0.3, 0.0370, 0.0150, 0.0200, 0.002), (0.62, 0.0420, 0.0140, 0.0190, 0.001),
    (0.86, 0.0440, 0.0135, 0.0160, 0.0), (1.0, 0.0432, 0.0124, 0.0134, 0.0), (1.1, 0.0350, 0.0080, 0.0090, 0.0)]
HAND_SIDES = 12
PALM_SIDES = 16


def _xsect(c, D, L, w, hd, hp, n, e=2.3, bulge=None):
    """n points round a finger or palm section: D up the back, L across; returns (points, how far each faces the
    back: +1 back, -1 palm)."""
    pts, dors = [], []
    for i in range(n):
        a = TAU * i / n
        ca, sa = math.cos(a), math.sin(a)
        h = hd if ca > 0 else hp
        p = c + D * (h * se(ca, e)) + L * (w * se(sa, e))
        if bulge:
            p = p + bulge(ca, sa)
        pts.append(p)
        dors.append(ca)
    return pts, dors


def _tube_mesh(name, rings, material, pole=None, cap0=False):
    """rings: [(points, dors, {bone: weight}, seg)]; a closed tube through them, ending in `pole` (a point, its
    weights and seg) or open. Writes the skin, and the 'Dors' and 'Seg' data the glove's surface is drawn by."""
    bm = bmesh.new()
    vs, meta = [], []
    for pts, dors, ws, seg in rings:
        row = [bm.verts.new(p) for p in pts]
        vs.append(row)
        meta += [(ws, seg, d) for d in dors]
    n = len(vs[0])
    for j in range(len(vs) - 1):
        for i in range(n):
            k = (i + 1) % n
            bm.faces.new((vs[j][i], vs[j][k], vs[j + 1][k], vs[j + 1][i]))
    if pole is not None:
        pp, pws, pseg = pole
        pv = bm.verts.new(pp)
        meta.append((pws, pseg, 0.0))
        for i in range(n):
            bm.faces.new((vs[-1][i], vs[-1][(i + 1) % n], pv))
    if cap0:
        bm.faces.new(vs[0][::-1])
    o = finish(bm, name, material, True, 70, recalc=True)
    me = o.data
    groups = {}
    for v in me.vertices:
        ws, seg, d = meta[v.index]
        for bn, w in ws.items():
            if w <= 0:
                continue
            g = groups.get(bn) or o.vertex_groups.new(name=bn)
            groups[bn] = g
            g.add([v.index], w, 'REPLACE')
    for nm, idx in (('Dors', 2), ('Seg', 1)):
        a = me.attributes.get(nm) or me.attributes.new(nm, 'FLOAT', 'POINT')
        for v in me.vertices:
            a.data[v.index].value = meta[v.index][idx]
    o['own_weights'] = True
    return o


def _h12_frame(sd, bones):
    W = bones['Hand_' + sd][0]
    heads = [bones['%s1_%s' % (f, sd)][0] for f in FINGER_NAMES]
    K = sum(heads, Vector()) / 4
    A = K - W
    z = next(Vector(z) for n, par, h, t, z in skeleton_points() if n == 'Hand_' + sd)   # the back of the hand
    D = (z - A.normalized() * z.dot(A.normalized())).normalized()
    Lt = heads[0] - heads[3]
    Lt = (Lt - A.normalized() * Lt.dot(A.normalized()) - D * Lt.dot(D)).normalized()
    return W, K, A, D, Lt


def _finger(name, sd, finger, bones, D0, rings=FINGER_RINGS):
    R = FINGER_R[finger]
    segs = [bones['%s%d_%s' % (finger, k, sd)] for k in (1, 2, 3)]
    out = []
    for k, t, fw, fd, fp, *inward in rings:
        a, c = segs[k - 1]
        ax = (c - a).normalized()
        D = (D0 - ax * D0.dot(ax)).normalized()
        L = ax.cross(D)
        r = R[k - 1]
        p = a + (c - a) * t
        if inward:
            W, K, A, _, _ = _h12_frame(sd, bones)
            p = p.lerp(W + A * max(0.0, min(1.0, (p - W).dot(A) / A.length_squared)), inward[0])
        bn = '%s%d_%s' % (finger, k, sd)
        if t < 0.0 and k == 1:                       # inside the palm: mostly the hand
            f = max(0.0, 1.0 + t / 0.34)
            ws = {'Hand_' + sd: 1.0 - 0.5 * f, bn: 0.5 * f}
        elif t == 0.0 and k == 1:                    # the knuckle: half the hand, half the finger
            ws = {'Hand_' + sd: 0.5, bn: 0.5}
        elif k > 1 and abs(t) < JOINT_SPAN:          # a pair of rings either side of a joint: graded, so it rounds
            w = 0.5 + 0.5 * t / JOINT_SPAN
            ws = {'%s%d_%s' % (finger, k - 1, sd): 1.0 - w, bn: w}
        else:
            ws = {bn: 1.0}
        pts, dors = _xsect(p, D, L, r * fw, r * fd, r * fp, HAND_SIDES)
        out.append((pts, dors, ws, k + t))
    a, c = segs[2]
    ax = (c - a).normalized()
    D = (D0 - ax * D0.dot(ax)).normalized()
    tip = a + (c - a) * 1.06 - D * R[2] * 0.18
    return _tube_mesh(name, out, S('Glove'), pole=(tip, {'%s3_%s' % (finger, sd): 1.0}, 4.0))


def _palm(name, sd, bones):
    W, K, A, D, Lt = _h12_frame(sd, bones)
    rings = []
    for s, w, hd, hp, sh in PALM_RINGS:
        c = W + A * s + Lt * sh
        th = math.exp(-((s - 0.4) / 0.24) ** 2)      # the ball of the thumb, on the palm's index side

        def bulge(ca, sa, th=th):
            return (Lt * 0.55 - D * 0.8) * (0.015 * th * max(0.0, -ca) * max(0.0, sa) ** 1.2)
        pts, dors = _xsect(c, D, Lt, w, hd, hp, PALM_SIDES, e=2.4, bulge=bulge)
        ws = {'Hand_' + sd: 0.6, 'Forearm_' + sd: 0.4} if s == 0.0 else {'Hand_' + sd: 1.0}
        rings.append((pts, dors, ws, 0.0))
    tip = W + A * 1.13
    return _tube_mesh(name, rings, S('Glove'), pole=(tip, {'Hand_' + sd: 1.0}, 0.0))


def _cuff(sd, bones, sleeve, palm):
    """The glove's cuff over the sleeve's end, its turned edge, and the wrist strap with its pull tab."""
    W, K, A, D, Lt = _h12_frame(sd, bones)
    fa0, fa1 = bones['Forearm_' + sd]
    back = (fa0 - fa1).normalized()
    Dc = (D - back * D.dot(back)).normalized()
    Lc = back.cross(Dc)
    tree = bvh([sleeve])
    ptree = bvh([palm])
    rings = []
    for u, extra in ((-0.006, 0.0022), (0.016, 0.0030), (0.038, 0.0036), (0.058, 0.0046)):
        c = W + back * u
        pts = []
        for i in range(PALM_SIDES):
            a = TAU * i / PALM_SIDES
            d = Dc * math.cos(a) + Lc * math.sin(a)
            r = 0.0
            for t in (tree, ptree):
                hit, n, fi, dist = t.ray_cast(c, d)
                if hit is not None:
                    r = max(r, (hit - c).length)
            r = max(r, 0.024) + extra
            pts.append(c + d * r)
        ws = {'Hand_' + sd: 0.5, 'Forearm_' + sd: 0.5} if u < 0 else {'Forearm_' + sd: 1.0}
        rings.append((pts, [math.cos(TAU * i / PALM_SIDES) for i in range(PALM_SIDES)], ws, -1.0))
    # the edge turned in 2.5 mm
    last = rings[-1][0]
    c = W + back * 0.058
    inner = [c + (p - c) * (1 - 0.0025 / (p - c).length) - back * 0.004 for p in last]
    rings.append((inner, rings[-1][1], rings[-1][2], -1.0))
    cuff = _tube_mesh('GloveCuff_' + sd, rings, S('Glove'))
    # the strap round the wrist, 2 mm proud of the cuff, and its tab on the back of the wrist
    ring = rings[1][0]
    c = W + back * 0.016
    pts = [c + (p - c) * (1 + 0.002 / (p - c).length) for p in ring]
    strap = strip('CuffStrap_' + sd, pts, [back] * len(pts), 0.019, 0.0025, S('Elastic'), closed=True, out=c, sides=2)
    tab = box('CuffStrapTab_' + sd, pts[0] + Dc * 0.003 + Lc * 0.006, (0.026, 0.005, 0.02), S('Elastic'),
              basis=(Lc, Dc, back))
    for o in (strap, tab):
        g = o.vertex_groups.new(name='Forearm_' + sd)
        g.add([v.index for v in o.data.vertices], 1.0, 'REPLACE')
        o['own_weights'] = True
    return [cuff, strap, tab]


def _knuckle_guard(sd, bones, under):
    """A moulded guard over the knuckles: a raised ridge over each, on a plate across the back of the hand."""
    W, K, A, D, Lt = _h12_frame(sd, bones)
    tree = bvh(under)
    xs = [(bones['%s1_%s' % (f, sd)][0] - K).dot(Lt) for f in FINGER_NAMES]
    L = A.length

    def F(u, v):
        a = math.radians(-66 + 132 * u)
        s = 0.82 + 0.23 * v
        c = W + A * s
        d = D * math.cos(a) + Lt * math.sin(a)
        hit, n, i, dist = tree.ray_cast(c + d * 0.08, -d)     # from outside in: the outermost surface
        base = hit if hit is not None else c + d * 0.013
        x = (base - c).dot(Lt)
        ridge = sum(math.exp(-((x - k) / 0.0058) ** 2) for k in xs) * math.exp(-(((s - 1.0) * L) / 0.007) ** 2)
        edge = smoothstep(0.0, 0.15, u) * smoothstep(1.0, 0.85, u) * smoothstep(0.0, 0.25, v) * smoothstep(1.0, 0.75, v)
        return base + d * (0.0012 + 0.0020 * edge + 0.0058 * ridge * edge)
    o = sheet('Knuckle_' + sd, F, 13, 5, S('Rubber'), skirt=0.0030, out_from=W + A * 0.9 - D * 0.05, angle=50)
    g = o.vertex_groups.new(name='Hand_' + sd)
    g.add([v.index for v in o.data.vertices], 1.0, 'REPLACE')
    o['own_weights'] = True
    return o


def hand_v12(sd, bones, sleeve):
    W, K, A, D, Lt = _h12_frame(sd, bones)
    palm = _palm('GlovePalm_' + sd, sd, bones)
    fingers = [_finger('GloveFinger%d_%s' % (i, sd), sd, f, bones, D) for i, f in enumerate(FINGER_NAMES)]
    Dt = (D * 0.45 + Lt * 0.9).normalized()           # the thumb's nail faces out from the index side
    thumb = _finger('GloveThumb_' + sd, sd, 'Thumb', bones, Dt, rings=THUMB_RINGS)
    parts = [palm] + fingers + [thumb]
    parts += _cuff(sd, bones, sleeve, palm)
    parts.append(_knuckle_guard(sd, bones, [palm] + fingers))
    return parts


# glove parts carry their own skin (above); the rules skin everything else
if not getattr(weight_part, 'v12', False):
    _weight_part_v11 = weight_part


def weight_part(o, bones, kind):
    if o.get('own_weights'):
        return
    return _weight_part_v11(o, bones, kind)


weight_part.v12 = True
B['hand_v12'] = hand_v12


def body_v12(body):
    """v11's body re-dressed: its knee pads and cargo pockets replaced, the collar, pockets and elbow pads added."""
    O = bpy.data.objects
    drop = [o for o in body if o.name.startswith(('KneePad_', 'KneeStrap', 'Cargo_', 'CargoFlap_', 'Glove_',
                                                   'Knuckle_', 'CuffStrap_'))]
    keep = [o for o in body if o not in drop]
    for o in drop:
        bpy.data.objects.remove(o, do_unlink=True)
    remat(keep, REMAT)
    bones = _bones()
    new = [shirt_collar(O['Gaiter'])]
    for sd in 'LR':
        new += arm_kit(sd, O['Sleeve_' + sd], bones)
        new += leg_kit(sd, O['Trousers'], bones)
        new += hand_v12(sd, bones, O['Sleeve_' + sd])
    return keep + new


B['body_v12'] = body_v12
print('bot20 ready')

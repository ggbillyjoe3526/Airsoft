# Bot figure v3: fixes from review 2. Boots sealed into cupped soles with laces on the boot, a soft padded plate
# carrier, a belt holster on a belt loop resting against the hip, and a last pass (declip) that lifts every outer
# layer clear of what it covers. Run after bot2.py: it replaces boot_left, vest and belt; build_all calls declip().
from mathutils.bvhtree import BVHTree
from mathutils.geometry import convex_hull_2d


def bvh(objs):
    if isinstance(objs, bpy.types.Object):
        objs = [objs]
    verts, polys = [], []
    for o in objs:
        base = len(verts)
        verts += [v.co.copy() for v in o.data.vertices]
        polys += [tuple(base + i for i in p.vertices) for p in o.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


def clearance(objs, inners, depth=0.05):
    """Smallest signed distance of objs' vertices above the inner surfaces (negative = inside them)."""
    t = bvh(inners)
    lo = 1.0
    for o in (objs if isinstance(objs, list) else [objs]):
        for v in o.data.vertices:
            loc, n, i, d = t.find_nearest(v.co)
            if loc is not None:
                s = (v.co - loc).dot(n)
                if s > -depth:
                    lo = min(lo, s)
    return lo


def push_out(outer, inners, margin=0.002, depth=0.03, zr=None, keep=None, near=None):
    """Lift outer's vertices that sit inside (or closer than margin to) the inner surfaces out to margin."""
    t = bvh(inners)
    moved = 0
    for v in outer.data.vertices:
        if zr and not (zr[0] <= v.co.z <= zr[1]):
            continue
        if keep and not keep(v.co):
            continue
        loc, n, i, d = t.find_nearest(v.co)
        if loc is None or (near and d > near):
            continue
        s = (v.co - loc).dot(n)
        if -depth < s < margin:
            v.co = v.co + n * (margin - s)
            moved += 1
    outer.data.update()
    return moved


def smooth01(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def boot_left():
    a = ANKLE
    x = a.x
    y0 = a.y
    to = 0.012   # toes turned out a little
    # centre line from the shaft top, down the ankle, bending forward to the toe
    keys = [
        {'c': (x, y0 + 0.006, 0.200), 'rx': 0.047, 'rs': 0.049, 'rf': 0.049, 'rb': 0.052, 'hint': (0, -1, 0)},
        {'c': (x, y0 + 0.006, 0.170), 'rx': 0.046, 'rs': 0.048, 'rf': 0.049, 'rb': 0.053, 'hint': (0, -1, 0)},
        {'c': (x, y0 + 0.004, 0.120), 'rx': 0.044, 'rs': 0.047, 'rf': 0.050, 'rb': 0.056, 'hint': (0, -1, 0)},
        {'c': (x + 0.001, y0 - 0.010, 0.078), 'rx': 0.047, 'rs': 0.049, 'rf': 0.058, 'rb': 0.070, 'hint': (0, -1, 0.5)},
        {'c': (x + 0.003, y0 - 0.050, 0.052), 'rx': 0.050, 'rs': 0.048, 'rf': 0.046, 'rb': 0.036, 'hint': (0, -0.3, 1)},
        {'c': (x + to * 0.55, y0 - 0.100, 0.044), 'rx': 0.052, 'rs': 0.047, 'rf': 0.036, 'rb': 0.028, 'hint': (0, 0, 1)},
        {'c': (x + to * 0.80, y0 - 0.150, 0.040), 'rx': 0.049, 'rs': 0.045, 'rf': 0.030, 'rb': 0.026, 'hint': (0, 0, 1)},
        {'c': (x + to, y0 - 0.188, 0.037), 'rx': 0.040, 'rs': 0.038, 'rf': 0.025, 'rb': 0.024, 'hint': (0, 0, 1)},
    ]

    def boot_dr(t, a2):
        d = 0.003 * gauss(t, 0.05)                                          # padded collar
        d += 0.012 * gauss(t - 0.40, 0.10) * gauss(angd(a2, BACK), 0.55)    # heel counter
        d += creases(t, a2, 0.42, 0.62, 2.0, 0.002, seed=0.4, focus=FRONT, spread=0.8)   # flex creases over the toes
        return d

    boot = tube('Boot_L', keys, 'Gear', segs=16, n=18, dr=boot_dr, cap0=0.0, cap1=0.016, cap_rings=2)
    # The tube's bend rounds the heel off well above the ground. Stretch the back of the boot down into the sole so
    # the heel is square and every part of the upper reaches the sole.
    me = boot.data
    BIN = 0.004
    low = {}
    for v in me.vertices:
        k = int(math.floor((v.co.y - y0) / BIN))
        low[k] = min(low.get(k, 9.0), v.co.z)
    ZR, FLOOR, P = 0.10, 0.013, 1.7
    for v in me.vertices:
        w = smooth01((v.co.y - (y0 - 0.075)) / 0.04)
        if w <= 0.0 or v.co.z >= ZR:
            continue
        k = int(math.floor((v.co.y - y0) / BIN))
        zmin = min(low.get(k + d, 9.0) for d in (-1, 0, 1))
        if zmin >= ZR:
            continue
        u = max(0.0, (v.co.z - zmin) / (ZR - zmin))
        zn = FLOOR + (ZR - FLOOR) * u ** P
        v.co.z += w * (zn - v.co.z)
    me.update()

    # Cupped sole traced round the upper just above the ground, a few millimetres proud of it, with a rounded edge.
    pts = [Vector((v.co.x, v.co.y)) for v in me.vertices if 0.004 < v.co.z < 0.045]
    for e in me.edges:   # the stretched heel has long faces: also take where its edges cross a few heights
        p, q = me.vertices[e.vertices[0]].co, me.vertices[e.vertices[1]].co
        for zc in (0.005, 0.009, 0.014, 0.024, 0.036):
            if (p.z - zc) * (q.z - zc) < 0:
                c = p.lerp(q, (zc - p.z) / (q.z - p.z))
                pts.append(Vector((c.x, c.y)))
    hull = [pts[i] for i in convex_hull_2d(pts)]
    per = [0.0]
    for i in range(len(hull)):
        per.append(per[-1] + (hull[(i + 1) % len(hull)] - hull[i]).length)
    N = 40
    outline = []
    for s in range(N):
        target = per[-1] * s / N
        i = 0
        while per[i + 1] < target:
            i += 1
        f = (target - per[i]) / max(per[i + 1] - per[i], 1e-9)
        outline.append(hull[i].lerp(hull[(i + 1) % len(hull)], f))
    for _ in range(2):   # round the hull's corners a little
        outline = [outline[i] * 0.5 + (outline[i - 1] + outline[(i + 1) % N]) * 0.25 for i in range(N)]
    cen = sum(outline, Vector((0, 0))) / N
    nrm = []
    for i in range(N):
        tg = outline[(i + 1) % N] - outline[i - 1]
        nn = Vector((tg.y, -tg.x)).normalized()
        if nn.dot(outline[i] - cen) < 0:
            nn = -nn
        nrm.append(nn)

    def ztop(y):
        return 0.026 + 0.009 * smooth01((y - (y0 - 0.10)) / 0.08)

    rows, cents = [], []
    for zf, off in ((lambda y: 0.0, -0.001), (lambda y: 0.004, 0.0045), (lambda y: 0.011, 0.0065),
                    (lambda y: ztop(y) - 0.004, 0.0065), (lambda y: ztop(y), 0.003)):
        row = []
        for p, nn in zip(outline, nrm):
            q = p + nn * off
            row.append(Vector((q.x, q.y, zf(p.y))))
        rows.append(row)
        cents.append(Vector((cen.x, cen.y, sum(r.z for r in row) / N)))
    sole = skin('Sole_L', rows, 'Hard', cents, Vector((cen.x, cen.y, 0.0)),
                Vector((cen.x, cen.y, cents[-1].z)), angle=50)

    lugs = []
    for i, y in enumerate([0.05, 0.02, -0.075, -0.105, -0.135, -0.165]):
        # tread blocks sized to the sole's width at that point, kept inside its edge
        xs = [p.x for p in outline if abs(p.y - (y0 + y)) < 0.012]
        lugs.append(rbox('Lug_L%d' % i, ((min(xs) + max(xs)) / 2, y0 + y, -0.0015),
                         (max(xs) - min(xs) - 0.016, 0.014, 0.005), 'Hard', bevel=0.0))
    lugs = join('Lugs_L', lugs)

    # laces criss-crossing up the front of the boot, sitting on its surface
    tr = bvh(boot)
    laces = []
    for i, z in enumerate((0.088, 0.106, 0.124, 0.142)):
        hit, n, idx, d = tr.ray_cast(Vector((x, y0 - 0.4, z)), Vector((0, 1, 0)))
        if hit is None:
            continue
        side = Vector((1, 0, 0))
        side = (side - n * side.dot(n)).normalized()
        up2 = n.cross(side).normalized()
        for s in (1, -1):
            ang = math.radians(28) * s
            bx = side * math.cos(ang) + up2 * math.sin(ang)
            bz = n.cross(bx).normalized()
            laces.append(rbox('Lace_L%d%d' % (i, s), hit + n * 0.0012, (0.026, 0.005, 0.004), 'Hard', bevel=0.0,
                              basis=(bx, n, bz)))
    laces = join('Laces_L', laces)
    return [boot, sole, lugs, laces]


def soft_panel(name, prof, z0, z1, a0, a1, off, thick, nz, na, material, rz=0.09, ra=0.07, edge=0.25, bulge=0.0,
               wrap=False):
    """A padded panel on a profile: rows packed towards the edges and a rolled, rounded edge instead of a chamfer."""
    zf0 = z0 if callable(z0) else (lambda a, v=z0: v)
    zf1 = z1 if callable(z1) else (lambda a, v=z1: v)

    def cosd(n):
        return [0.5 - 0.5 * math.cos(math.pi * i / n) for i in range(n + 1)]

    def roll(f, r):
        d = min(f, 1 - f)
        if d >= r:
            return 1.0
        q = 1 - d / r
        return math.sqrt(max(0.0, 1 - q * q))

    us = cosd(nz)
    vs = [j / na for j in range(na)] if wrap else cosd(na)
    gin, gout = [], []
    for tz in us:
        ri, ro = [], []
        for ta in vs:
            a = a0 + (a1 - a0) * ta
            za, zb = zf0(a), zf1(a)
            z = za + (zb - za) * tz
            k = roll(tz, rz) * (1.0 if wrap else roll(ta, ra))
            b = bulge * math.sin(math.pi * tz) * (1 if wrap else math.sin(math.pi * ta))
            ri.append(prof.point(z, a, off))
            ro.append(prof.point(z, a, off + thick * (edge + (1 - edge) * k) + b))
        gin.append(ri)
        gout.append(ro)
    return slab(name, gout, gin, material, angle=70, wrap=wrap, inner=False)


def plate_bottom(a, centre, z0, rc=0.018, frac=0.14):
    # rounded bottom corners
    u = abs((a - centre) / PLATE_HALF)
    q = max(0.0, (u - (1 - frac)) / frac)
    return z0 + rc * (1 - math.sqrt(max(0.0, 1 - q * q)))


def vest():
    parts = []
    ztop_f = lambda a: plate_top(a, 1.348, 0.06)
    zbot_f = lambda a: plate_bottom(a, FRONT, 1.045)
    parts.append(soft_panel('PlateFront', TORSO, zbot_f, ztop_f, FRONT - PLATE_HALF, FRONT + PLATE_HALF, 0.010, 0.034,
                            10, 16, 'TeamColour', rz=0.09, ra=0.075, bulge=0.005))
    ztop_b = lambda a: plate_top(a, 1.375, 0.045, back=True)
    zbot_b = lambda a: plate_bottom(a, BACK, 1.04)
    parts.append(soft_panel('PlateBack', TORSO, zbot_b, ztop_b, BACK - PLATE_HALF, BACK + PLATE_HALF, 0.010, 0.034,
                            10, 16, 'TeamColour', rz=0.09, ra=0.075, bulge=0.005))
    parts.append(soft_panel('Cummer_L', TORSO, 1.06, 1.20, BACK + PLATE_HALF - 0.1 - TAU, FRONT - PLATE_HALF + 0.1,
                            0.012, 0.018, 4, 8, 'TeamColour', rz=0.2, ra=0.07, edge=0.35))
    parts.append(soft_panel('Cummer_R', TORSO, 1.06, 1.20, FRONT + PLATE_HALF - 0.1, BACK - PLATE_HALF + 0.1, 0.012,
                            0.018, 4, 8, 'TeamColour', rz=0.2, ra=0.07, edge=0.35))
    for sx, nm in ((1, 'Strap_L'), (-1, 'Strap_R')):
        x = 0.098 * sx
        pf = TORSO.point(1.345, FRONT - 0.62 * sx, 0.026)
        pb = TORSO.point(1.385, BACK + 0.62 * sx, 0.026)
        path = [
            (Vector((pf.x, pf.y + 0.004, 1.335)), (0, -1, 0.15)),
            (Vector((x * 1.02, pf.y + 0.022, 1.385)), (0, -1, 0.6)),
            (Vector((x * 1.04, -0.032, 1.428)), (0, -0.5, 1)),
            (Vector((x * 1.05, 0.010, 1.446)), (0, 0, 1)),
            (Vector((x * 1.04, 0.052, 1.432)), (0, 0.5, 1)),
            (Vector((x * 1.02, pb.y - 0.018, 1.40)), (0, 1, 0.6)),
            (Vector((pb.x, pb.y - 0.006, 1.36)), (0, 1, 0.15)),
        ]
        rings = [{'c': p, 'rx': 0.030, 'rf': 0.010, 'rb': 0.006, 'e': 2.8, 'hint': h} for p, h in path]
        parts.append(loft(nm, rings, 'TeamColour', segs=10, angle=60))
    return parts


def holster_right(inners):
    """Belt holster on the right hip: a loop over the belt, a pistol-shaped holster hanging from it with the grip
    showing, swung out just enough to rest on the hip and leg without passing into them."""
    a = math.pi + 0.10
    zb = 1.010
    t, n, up = surface_basis(TORSO, zb, a)
    fwd = -t if (-t).y < 0 else t
    piv = TORSO.point(zb, a, 0.022)
    parts = [rbox('HolsterLoop', piv + n * 0.004, (0.046, 0.008, 0.066), 'Hard', bevel=0.003, segs=1,
                  basis=(fwd, n, up))]
    hang = []
    hang.append(pillow('Holster', piv + n * 0.028 - up * 0.080 + fwd * 0.006, (0.054, 0.040, 0.185), 'Hard',
                       basis=(fwd, n, up), bevel=0.012, segs=3, taper=(1.12, 1.0), bulge=0.004))
    hang.append(pillow('HolsterGuard', piv + n * 0.028 - up * 0.030 + fwd * 0.036, (0.036, 0.034, 0.05), 'Hard',
                       basis=(fwd, n, up), bevel=0.012, segs=2))
    g_up = (up - fwd * 0.28).normalized()
    g_f = (fwd + up * 0.28).normalized()
    hang.append(rbox('PistolGrip', piv + n * 0.028 + up * 0.040 - fwd * 0.010, (0.030, 0.026, 0.072), 'Hard',
                     bevel=0.008, segs=1, basis=(g_f, n, g_up)))
    pivot = piv + n * 0.008
    sign = 1.0
    if (Matrix.Rotation(0.1, 3, fwd) @ (-up)).dot(n) < 0:
        sign = -1.0
    best = None
    for deg in range(0, 31):
        m = (Matrix.Translation(pivot) @ Matrix.Rotation(sign * math.radians(deg), 4, fwd) @
             Matrix.Translation(-pivot))
        for o in hang:
            o.data.transform(m)
        c = clearance(hang, inners)
        mi = m.inverted()
        if c >= 0.002:
            best = deg
            break
        for o in hang:
            o.data.transform(mi)
    if best is None:
        c = clearance(hang, inners)
        for o in hang:
            o.data.transform(Matrix.Translation(n * (0.002 - c)))
    print('holster swing', best)
    return parts + hang


def belt():
    parts = []
    parts.append(panel('Belt', TORSO, 0.985, 1.035, 0.0, TAU, 0.006, 0.016, 2, 30, 'Gear', inset=0.3, wrap=True))
    t, n, up = surface_basis(TORSO, 1.01, FRONT)
    parts.append(rbox('Buckle', TORSO.point(1.01, FRONT, 0.022) + n * 0.004, (0.06, 0.012, 0.045), 'Hard', bevel=0.004,
                      segs=1, basis=(t, n, up)))
    O = bpy.data.objects
    inners = [O[nm] for nm in ('Trousers_R', 'Cargo_R', 'CargoFlap_R', 'Shirt') if nm in O]
    parts += holster_right(inners)
    a = BACK + 0.55 - TAU
    parts.append(pillow_on('DumpPouch', TORSO, 0.95, a, 0.024, (0.12, 0.045, 0.13), 'Gear', bevel=0.018, bulge=0.012,
                           taper=(1.0, 1.2), sag=0.01))
    return parts


def declip():
    """Lift outer layers clear of what they cover, so nothing underneath shows through."""
    O = bpy.data.objects
    log = []
    for s in ('L', 'R'):
        log.append(push_out(O['Trousers_' + s], O['Boot_' + s], 0.004, depth=0.03, zr=(0.0, 0.24)))
        # outer hips: the leg runs smoothly over the pelvis instead of crossing it in a ragged line
        log.append(push_out(O['Trousers_' + s], O['Shirt'], 0.005, depth=0.02, zr=(0.84, 0.99),
                            keep=lambda c: abs(c.x) > 0.11))
        for nm in ('KneeStrapTop_', 'KneeStrapLow_'):
            log.append(push_out(O[nm + s], O['Trousers_' + s], 0.0015))
        log.append(push_out(O['Armband_' + s], O['Sleeve_' + s], 0.0015))
        log.append(push_out(O['Glove_' + s], O['Sleeve_' + s], 0.0025, near=0.012))
        log.append(push_out(O['CuffStrap_' + s], O['Glove_' + s], 0.0012))
    log.append(push_out(O['Gaiter'], O['Balaclava'], 0.0025, zr=(1.43, 1.56)))
    log.append(push_out(O['Gaiter'], O['Shirt'], 0.002, zr=(1.40, 1.47)))
    log.append(push_out(O['Webbing'], [O['PlateBack'], O['Cummer_L'], O['Cummer_R']], 0.0008, depth=0.02))
    print('declip moved', log)


# --- v3.1: one continuous glove from the cuff over the sleeve, in at the wrist, out into the palm ---
if not getattr(arm_left, 'v3', False):
    _arm_left_v2 = arm_left


def glove_left():
    u, f = arm_dirs()
    elbow, wrist = arm_points()
    base = wrist + f * 0.010
    L = f.normalized()
    N = (Vector((-1, 0, 0)) - L * L.dot(Vector((-1, 0, 0)))).normalized()
    W = N.cross(L).normalized()
    if W.y > 0:
        W = -W

    def P(l, w, n):
        return base + L * l + W * w + N * n

    keys = [
        {'c': P(-0.088, 0, 0), 'rx': 0.0392, 'rs': 0.0398, 'rf': 0.0380, 'rb': 0.0388},          # rolled cuff edge
        {'c': P(-0.080, 0, 0), 'rx': 0.0412, 'rs': 0.0420, 'rf': 0.0402, 'rb': 0.0408},
        {'c': P(-0.060, 0, 0), 'rx': 0.0392, 'rs': 0.0400, 'rf': 0.0370, 'rb': 0.0378},
        {'c': P(-0.035, 0, 0.001), 'rx': 0.0345, 'rs': 0.0350, 'rf': 0.0300, 'rb': 0.0305, 'e': 2.1},
        {'c': P(-0.012, 0, 0.001), 'rx': 0.0295, 'rs': 0.0295, 'rf': 0.0220, 'rb': 0.0210, 'e': 2.3},   # wrist
        {'c': P(0.008, 0.001, 0.002), 'rx': 0.0340, 'rs': 0.0340, 'rf': 0.0200, 'rb': 0.0180, 'e': 2.5},
        {'c': P(0.032, 0.002, 0.002), 'rx': 0.0410, 'rs': 0.0400, 'rf': 0.0210, 'rb': 0.0170, 'e': 2.8},
        {'c': P(0.058, 0.001, 0.003), 'rx': 0.0425, 'rs': 0.0420, 'rf': 0.0185, 'rb': 0.0160, 'e': 3.0},
        {'c': P(0.080, 0.0, 0.003), 'rx': 0.0410, 'rs': 0.0405, 'rf': 0.0135, 'rb': 0.0130, 'e': 2.8},   # knuckles
    ]
    span = 0.080 + 0.088

    def tt(l):
        return (l + 0.088) / span

    def glove_dr(t, a):
        d = bump(t, a, tt(0.022), math.radians(135), 0.11, 0.7, 0.011)         # thumb pad, joining the thumb
        d += bump(t, a, tt(0.035), math.radians(50), 0.12, 0.5, 0.004)         # heel of the hand
        d += creases(t, a, tt(-0.020), tt(-0.004), 1.5, 0.0012, seed=3.0)      # wrist creases
        d += creases(t, a, tt(-0.075), tt(-0.050), 2.0, 0.0015, seed=1.7)      # cuff folds
        return d

    glove = tube('Glove_L', keys, 'Gear', segs=28, n=10, hint=N, dr=glove_dr, angle=70)
    grow_fingers(glove, L, W, N)
    strap = tube('CuffStrap_L', [{'c': P(-0.056, 0, 0), 'rx': 0.0405, 'rs': 0.0412, 'rf': 0.0382, 'rb': 0.0390},
                                 {'c': P(-0.043, 0, 0.0005), 'rx': 0.0378, 'rs': 0.0384, 'rf': 0.0345, 'rb': 0.0352}],
                 'Hard', segs=14, n=2, hint=N, cap0=0.0, cap1=0.0, cap_rings=1, angle=40)
    return [glove, strap]



def grow_fingers(glove, L, W, N, m=3):
    """Grow the four fingers out of the glove's knuckle ring as one surface: each finger takes a quarter of the ring,
    neighbours share the web between them, so the hand shades as one piece."""
    me = glove.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    segs = 8 * m + 4
    ring = [bm.verts[i] for i in range(len(bm.verts) - segs, len(bm.verts))]
    h = segs // 2
    top = sorted(ring[h + 1:], key=lambda v: -v.co.dot(W))          # back of the hand, index side first
    bot = sorted(ring[1:h], key=lambda v: -v.co.dot(W))             # palm side
    ends = sorted([ring[0], ring[h]], key=lambda v: -v.co.dot(W))
    cols = len(top) - 1                                             # m columns per finger
    side = {0: ends[0], cols: ends[1]}
    # knuckles: the back rises over each finger and dips between them, so the fingers start round, not flat
    for c in range(cols + 1):
        u = (c % m) / m                                              # 0 at a web column, 0.5 mid-finger
        rise = math.sin(math.pi * u)
        if 0 < c < cols:
            top[c].co += -N * (0.0018 * rise - 0.0022 * (1 - rise)) + L * 0.003 * (1 - rise)
            bot[c].co += N * (0.0008 * rise) - N * 0.0012 * (1 - rise) + L * 0.003 * (1 - rise)
    fingers = [(0.082, 1.0), (0.090, 1.0), (0.085, 0.97), (0.070, 0.9)]
    sgn = 1.0 if (Matrix.Rotation(0.1, 3, W) @ L).dot(N) > 0 else -1.0
    # the fingers stay joined for a little way past the knuckles: one more ring for the whole hand, with a valley
    # between each pair of fingers, so each finger starts from a rounded lobe instead of a flat edge
    Ld = (Matrix.Rotation(sgn * math.radians(8), 3, W) @ L).normalized()
    cen = sum((v.co for v in ring), Vector()) / len(ring)
    ring2 = []
    for v in ring:
        p = v.co + Ld * 0.016
        q = p - cen
        ring2.append(bm.verts.new(cen + Ld * 0.016 + q - W * (q.dot(W) * 0.03)))
    for j in range(segs):
        bm.faces.new((ring[j], ring[(j + 1) % segs], ring2[(j + 1) % segs], ring2[j]))
    ring = ring2
    top = sorted(ring[h + 1:], key=lambda v: -v.co.dot(W))
    bot = sorted(ring[1:h], key=lambda v: -v.co.dot(W))
    ends = sorted([ring[0], ring[h]], key=lambda v: -v.co.dot(W))
    side = {0: ends[0], cols: ends[1]}
    for c in range(1, cols):
        u = (c % m) / m
        rise = math.sin(math.pi * u)
        top[c].co += -N * (0.0012 * rise - 0.0042 * (1 - rise))
        bot[c].co += N * (0.0006 * rise - 0.0030 * (1 - rise))
    for c in range(m, cols, m):                                     # webs between the fingers
        side[c] = bm.verts.new((top[c].co + bot[c].co) / 2 + Ld * 0.004 + N * 0.002)
    new_faces = []
    for k, (ln, sc) in enumerate(fingers):
        c0 = m * k
        base = top[c0:c0 + m + 1] + [side[c0 + m]] + bot[c0:c0 + m + 1][::-1] + [side[c0]]
        b0 = sum((v.co for v in base), Vector()) / len(base)
        curl = [math.radians(14 + k * 3), math.radians(24 + k * 3), math.radians(16)]
        seg = [ln * 0.42 - 0.012, ln * 0.32, ln * 0.26]
        d = L.copy()
        cum = 0.0
        pts, dirs, nors = [b0], [], []
        for sl, cv in zip(seg, curl):
            d = (Matrix.Rotation(sgn * cv, 3, W) @ d).normalized()
            cum += cv
            pts.append(pts[-1] + d * sl)
            dirs.append(d.copy())
            nors.append((Matrix.Rotation(sgn * cum, 3, W) @ N).normalized())
        r = 0.0105 * sc
        rings = []
        for i in range(3):
            rings.append((pts[i].lerp(pts[i + 1], 0.5), dirs[i], nors[i], r * (1.0 - 0.13 * (i + 0.5) / 3) * 0.95))
            if i < 2:
                rings.append((pts[i + 1], (dirs[i] + dirs[i + 1]).normalized(), (nors[i] + nors[i + 1]).normalized(),
                              r * (1.0 - 0.13 * (i + 1) / 3) * 1.06))
        rt = r * 0.86
        tip = pts[3] - dirs[2] * (rt * 0.6)
        rings.append((tip, dirs[2], nors[2], rt))

        def basis(t, nv):
            f = (nv - t * nv.dot(t)).normalized()
            return f, t.cross(f).normalized()

        F0, S0 = basis(dirs[0], nors[0])
        angs = [math.atan2((v.co - b0).dot(F0), (v.co - b0).dot(S0)) for v in base]
        rows = [base]
        first = None
        for c, t, nv, rr in rings:
            f, sv = basis(t, nv)
            pts_r = [c + sv * (math.cos(a) * rr) + f * (math.sin(a) * rr * 0.92) for a in angs]
            if first is None:
                first = pts_r
                # a short blend ring right after the knuckles that rounds the finger off quickly
                cb = b0.lerp(c, 0.32)
                fb, sb = basis(dirs[0], nors[0])
                rb_ = rr * 1.06
                blend = []
                for v, q, a in zip(base, pts_r, angs):
                    lin = v.co.lerp(q, 0.32)
                    rnd = cb + sb * (math.cos(a) * rb_) + fb * (math.sin(a) * rb_ * 0.92)
                    blend.append(bm.verts.new(lin.lerp(rnd, 0.6)))
                rows.append(blend)
            rows.append([bm.verts.new(p) for p in pts_r])
        c, t, nv, rr = rings[-1]
        f, sv = basis(t, nv)
        cap_len = rt * 0.95
        last = rows[-1]
        for q in (1, 2):
            ang = (math.pi / 2) * q / 3
            cc = c + t * (cap_len * math.sin(ang))
            rows.append([bm.verts.new(cc + (v.co - c) * math.cos(ang)) for v in last])
        pole = bm.verts.new(c + t * cap_len)
        n = len(base)
        for A, Bv in zip(rows[:-1], rows[1:]):
            for j in range(n):
                new_faces.append(bm.faces.new((A[j], A[(j + 1) % n], Bv[(j + 1) % n], Bv[j])))
        for j in range(n):
            new_faces.append(bm.faces.new((rows[-1][j], rows[-1][(j + 1) % n], pole)))
    # one consistent winding, facing out
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    cen = sum((v.co for v in ring), Vector()) / len(ring)
    score = sum(f.normal.dot(f.calc_center_median() - cen) for f in new_faces[:8])
    if score < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    try:
        me.set_sharp_from_angle(angle=math.radians(70))
    except Exception:
        pass
    me.update()
    return glove

def arm_left():
    parts = []
    for o in _arm_left_v2():
        if o.name in ('Cuff_L', 'CuffStrap_L', 'Palm_L') or o.name.startswith('Finger_L'):
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            parts.append(o)
    g = glove_left()
    # drape the knuckle guard over the curved back of the hand instead of a flat bar sunk into it
    kn = next((o for o in parts if o.name.startswith('Knuckle_L')), None)
    if kn is not None:
        u, f = arm_dirs()
        L = f.normalized()
        N = (Vector((-1, 0, 0)) - L * L.dot(Vector((-1, 0, 0)))).normalized()
        kn.data.transform(Matrix.Translation(-L * 0.016))
        vs = kn.data.vertices
        c = sum((v.co for v in vs), Vector()) / len(vs)
        inner = max(v.co.dot(N) for v in vs)            # the face towards the palm
        tr = bvh(g[0])
        for v in vs:
            hgt = inner - v.co.dot(N)                    # height above that face
            hit, nn, i, d = tr.ray_cast(v.co - N * 0.08, N)
            if hit is not None:
                v.co = v.co + N * ((hit.dot(N) - 0.0006) - hgt - v.co.dot(N))
        kn.data.update()
    return parts + g


arm_left.v3 = True

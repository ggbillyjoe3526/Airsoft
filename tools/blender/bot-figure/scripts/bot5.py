# --- v4 polish: one seamless pair of trousers (seat, crotch and both legs as one surface) ---
# The legs used to stop at the hips and the bottom of the shirt made the seat, which read as a nappy-shaped pouch with
# a hard line where the legs met it. Now each trouser leg rises to the waist and is shaped as half of the seat; the
# halves are pressed flat against the middle, the hidden inner faces are removed and the two halves are welded along
# the centre seam (fly at the front, seat seam at the back). Below the crotch the legs part naturally.
SHIRT_HEM = 0.990           # the shirt ends under the belt (belt spans 0.985-1.035); the trousers cover the rest
SEAM_EPS = 1e-5


def pants():
    O = bpy.data.objects
    halves = [O['Trousers_L'], O['Trousers_R']]
    for o, side in zip(halves, (1.0, -1.0)):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        for v in bm.verts:
            if v.co.x * side < 0.0:
                v.co.x = 0.0
        flat = [f for f in bm.faces if all(abs(v.co.x) < SEAM_EPS for v in f.verts)]
        bmesh.ops.delete(bm, geom=flat, context='FACES')
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
        bm.to_mesh(o.data)
        bm.free()
    t = join('Trousers', halves)
    bm = bmesh.new()
    bm.from_mesh(t.data)
    seam = [v for v in bm.verts if abs(v.co.x) < SEAM_EPS]
    bmesh.ops.remove_doubles(bm, verts=seam, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(t.data)
    bm.free()
    t.data.shade_smooth()
    shirt = O['Shirt']
    bm = bmesh.new()
    bm.from_mesh(shirt.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z < SHIRT_HEM], context='FACES')
    bm.to_mesh(shirt.data)
    bm.free()
    return t


if not getattr(declip, 'v5', False):
    _declip_v3 = declip


def declip():
    _declip_v3()
    t = pants()
    O = bpy.data.objects
    log = [push_out(O['Belt'], t, 0.002)]
    for n in ('Buckle', 'HolsterLoop', 'DumpPouch'):
        if n in O:
            log.append(push_out(O[n], [t, O['Belt']], 0.001))
    print('pants', sum(len(p.vertices) - 2 for p in t.data.polygons), 'declip v5', log)


declip.v5 = True


if not getattr(build_all, 'v5', False):
    _build_all_v3 = build_all


def _alive(o):
    try:
        o.name
        return True
    except ReferenceError:
        return False


def build_all():
    b, k, h = _build_all_v3()
    b = [o for o in b if _alive(o)]
    t = bpy.data.objects.get('Trousers')
    if t is not None and t not in b:
        b.append(t)
    return b, k, h


build_all.v5 = True


# --- v4 polish: a moulded belt holster with a raked pistol grip and a retention hood ---
def holster_right(inners):
    """Belt holster on the right hip: a belt loop, a moulded holster shaped round the pistol it carries (the bulge of
    the trigger guard at the top front, the slide running straight down the back), a rounded raked grip standing out
    of it and a retention hood over the back of the slide. Swung out just enough to rest on the hip and leg."""
    a = math.pi + 0.10
    zb = 1.010
    t, n, up = surface_basis(TORSO, zb, a)
    fwd = -t if (-t).y < 0 else t
    piv = TORSO.point(zb, a, 0.022)
    parts = [rbox('HolsterLoop', piv + n * 0.004, (0.046, 0.008, 0.066), 'Hard', bevel=0.003, segs=1,
                  basis=(fwd, n, up))]
    o = piv + n * 0.030 - up * 0.022

    def H(f, u, nn=0.0):
        return o + fwd * f + up * u + n * nn

    body = [(0.010, 0.008, 0.030, 0.019, 0.016),       # (u, centre f, half width, outer, inner): the mouth
            (-0.015, 0.010, 0.031, 0.020, 0.016),      # round the trigger guard
            (-0.045, 0.006, 0.027, 0.019, 0.016),
            (-0.068, -0.002, 0.019, 0.017, 0.015),     # steps in to the slide
            (-0.120, -0.003, 0.018, 0.016, 0.014),
            (-0.158, -0.003, 0.017, 0.015, 0.013)]     # muzzle end
    keys = [{'c': H(f, u), 'rx': w, 'rs': w, 'rf': ro, 'rb': ri, 'e': 2.6} for u, f, w, ro, ri in body]
    hang = [tube('Holster', keys, 'Hard', segs=12, n=8, hint=n, cap0=0.004, cap1=0.010, cap_rings=2, angle=55)]
    g_up = (up - fwd * 0.30).normalized()
    g0 = H(-0.004, 0.006)
    grip = [(0.000, 0.0160, 0.0150), (0.030, 0.0152, 0.0140), (0.060, 0.0158, 0.0145), (0.070, 0.0172, 0.0158),
            (0.077, 0.0168, 0.0154)]
    hang.append(tube('PistolGrip', [{'c': g0 + g_up * s, 'rx': w, 'rs': w, 'rf': d, 'rb': d, 'e': 2.3}
                                    for s, w, d in grip], 'Hard', segs=10, n=6, hint=n, cap0=0.0, cap1=0.006,
                     cap_rings=1, angle=55))
    hood = [H(-0.019, 0.004, 0.021), H(-0.026, 0.026, 0.012), H(-0.028, 0.034, 0.0), H(-0.026, 0.026, -0.012),
            H(-0.019, 0.004, -0.019)]
    hang.append(tube('HolsterGuard', [{'c': p, 'rx': 0.009, 'rs': 0.009, 'rf': 0.0035, 'rb': 0.0035} for p in hood],
                     'Hard', segs=6, n=6, hint=fwd, cap0=0.003, cap1=0.003, cap_rings=1, angle=55))
    pivot = piv + n * 0.008
    sign = 1.0
    if (Matrix.Rotation(0.1, 3, fwd) @ (-up)).dot(n) < 0:
        sign = -1.0
    best = None
    for deg in range(0, 31):
        m = (Matrix.Translation(pivot) @ Matrix.Rotation(sign * math.radians(deg), 4, fwd) @
             Matrix.Translation(-pivot))
        for ob in hang:
            ob.data.transform(m)
        c = clearance(hang, inners)
        if c >= 0.002:
            best = deg
            break
        mi = m.inverted()
        for ob in hang:
            ob.data.transform(mi)
    if best is None:
        c = clearance(hang, inners)
        for ob in hang:
            ob.data.transform(Matrix.Translation(n * (0.002 - c)))
    print('holster swing', best)
    return parts + hang


# --- v4 polish: the knuckle guard as a moulded plate with rounded corners (it is draped over the hand later) ---
def guard_plate(name, center, size, material, basis, corner=0.0065, bevel=0.0012, arc=4):
    sx, th, sz = size
    hx, hz = sx / 2, sz / 2
    outline = []
    for cx, cz, a0 in ((hx - corner, hz - corner, 0), (-hx + corner, hz - corner, 90),
                       (-hx + corner, -hz + corner, 180), (hx - corner, -hz + corner, 270)):
        for i in range(arc):
            a = math.radians(a0 + 90.0 * i / (arc - 1))
            outline.append((cx + corner * math.cos(a), cz + corner * math.sin(a)))
        if a0 in (0, 180):          # two extra points along each long edge so the plate can bend round the hand
            x0 = cx + corner * math.cos(math.radians(a0 + 90))
            sgn = -1 if a0 == 0 else 1
            for f in (1 / 3, 2 / 3):
                outline.append((x0 + sgn * (sx - 2 * corner) * f, cz + corner * math.sin(math.radians(a0 + 90))))
    X, Y, Z = basis
    c = Vector(center)
    verts, faces = [], []
    rings = []
    for y, shrink in ((-th / 2, 0.0), (th / 2 - bevel, 0.0), (th / 2, bevel)):
        ring = []
        for x, z in outline:
            px, pz = x * (1 - shrink / hx), z * (1 - shrink / hz)
            verts.append(c + X * px + Y * y + Z * pz)
            ring.append(len(verts) - 1)
        rings.append(ring)
    n = len(outline)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            faces.append([a[i], a[j], b[j], b[i]])
    faces.append(list(reversed(rings[0])))
    faces.append(list(rings[2]))
    return make(name, verts, faces, material, smooth=True, angle=40)

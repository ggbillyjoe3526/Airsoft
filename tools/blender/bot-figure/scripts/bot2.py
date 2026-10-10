
# Bot figure v2: smooth anatomical forms. Run after bot_helpers.py, bot_body.py and bot_kit.py (it replaces their
# body, torso, head and pouch builders; the plate carrier panels and helpers are reused).


def cr(p0, p1, p2, p3, t):
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)


def angd(a, b):
    return (a - b + math.pi) % TAU - math.pi


def gauss(x, s):
    return math.exp(-(x / s) ** 2)


def bump(t, a, t0, a0, st, sa, amp):
    return amp * gauss(t - t0, st) * gauss(angd(a, a0), sa)


def creases(t, a, t0, t1, n, amp, seed=0.0, focus=None, spread=1.0):
    if t <= t0 or t >= t1:
        return 0.0
    u = (t - t0) / (t1 - t0)
    env = math.sin(math.pi * u)
    if focus is not None:
        env *= gauss(angd(a, focus), spread)
    ph = 1.7 * math.sin(2 * a + seed) + 1.0 * math.sin(3 * a + 1.7 * seed) + 0.6 * math.sin(5 * a + 0.3 * seed)
    return amp * env * math.sin(TAU * n * u + ph)


def skin(name, rows, material, centres, pole0=None, pole1=None, angle=80):
    bm = bmesh.new()
    R = [[bm.verts.new(p) for p in row] for row in rows]
    n = len(rows[0])
    for i in range(len(R) - 1):
        A, B = R[i], R[i + 1]
        for j in range(n):
            k = (j + 1) % n
            bm.faces.new((A[j], A[k], B[k], B[j]))
    for pole, row in ((pole0, R[0]), (pole1, R[-1])):
        if pole is None:
            continue
        pv = bm.verts.new(pole)
        for j in range(n):
            bm.faces.new((row[j], row[(j + 1) % n], pv))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    s = 0.0
    for i in range(len(R) - 1):
        for face in R[i][0].link_faces:
            s += face.normal.dot(R[i][0].co - Vector(centres[i]))
    if s < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return finish(bm, name, material, True, angle, recalc=False)


def _ring(c, S, F, rx, rf, rb, rs, e, segs, dr=None, t=0.0):
    pts = []
    for j in range(segs):
        a = TAU * j / segs
        ca, sa = math.cos(a), math.sin(a)
        x = se(ca, e) * (rs if ca < 0 else rx)
        y = se(sa, e) * (rf if sa >= 0 else rb)
        if dr is not None:
            L = math.hypot(x, y)
            if L > 1e-9:
                k = (L + dr(t, a)) / L
                x *= k
                y *= k
        pts.append(c + S * x + F * y)
    return pts


def _cap_rows(row, c, d, length, n):
    rows, cents = [], []
    for k in range(1, n + 1):
        ang = (math.pi / 2) * k / (n + 1)
        cc = c + d * (length * math.sin(ang))
        rows.append([cc + (p - c) * math.cos(ang) for p in row])
        cents.append(cc)
    return rows, cents, c + d * length


def tube(name, keys, material, segs=16, n=20, hint=(0, -1, 0), dr=None, cap0=None, cap1=None, cap_rings=3, angle=80):
    K = len(keys)
    ks = []
    for k in keys:
        rx = k['rx']
        rf = k.get('rf', rx)
        ks.append({'c': Vector(k['c']), 'rx': rx, 'rf': rf, 'rb': k.get('rb', rf), 'rs': k.get('rs', rx),
                   'e': k.get('e', 2.0), 'hint': Vector(k.get('hint', hint))})

    def at(u):
        i = min(int(u), K - 2)
        t = u - i
        i0, i3 = max(i - 1, 0), min(i + 2, K - 1)
        c = cr(ks[i0]['c'], ks[i]['c'], ks[i + 1]['c'], ks[i3]['c'], t)
        v = {q: cr(ks[i0][q], ks[i][q], ks[i + 1][q], ks[i3][q], t) for q in ('rx', 'rf', 'rb', 'rs', 'e')}
        h = ks[i]['hint'].lerp(ks[i + 1]['hint'], t)
        return c, v, h

    dense = [at((K - 1) * s / 200.0)[0] for s in range(201)]
    cum = [0.0]
    for s in range(1, 201):
        cum.append(cum[-1] + (dense[s] - dense[s - 1]).length)
    total = cum[-1]
    us = []
    for i in range(n):
        target = total * i / (n - 1)
        s = 1
        while s < 200 and cum[s] < target:
            s += 1
        f = (target - cum[s - 1]) / max(cum[s] - cum[s - 1], 1e-9)
        us.append((K - 1) * (s - 1 + f) / 200.0)
    rows, cents, tans = [], [], []
    for i, u in enumerate(us):
        c, v, h = at(u)
        e1 = at(min(u + 0.01, K - 1))[0]
        e0 = at(max(u - 0.01, 0))[0]
        T = (e1 - e0).normalized()
        T, F, S = frame(T, h)
        rows.append(_ring(c, S, F, v['rx'], v['rf'], v['rb'], v['rs'], v['e'], segs, dr, i / (n - 1)))
        cents.append(c)
        tans.append(T)
    pole0 = pole1 = None
    if cap0 is not None:
        r, cc, pole0 = _cap_rows(rows[0], cents[0], -tans[0], cap0, cap_rings)
        rows = list(reversed(r)) + rows
        cents = list(reversed(cc)) + cents
    if cap1 is not None:
        r, cc, pole1 = _cap_rows(rows[-1], cents[-1], tans[-1], cap1, cap_rings)
        rows = rows + r
        cents = cents + cc
    return skin(name, rows, material, cents, pole0, pole1, angle)


class Profile2(Profile):
    def __init__(self, rings, dr=None, scale=1.0):
        Profile.__init__(self, rings)
        self.dr = dr
        self.scale = scale

    def view(self, scale):
        return Profile2(self.r, self.dr, scale)

    def point(self, z, a, off=0.0, cx=0.0):
        z_, cy, rx, rf, rb, e = self.at(z)
        ca, sa = math.cos(a), math.sin(a)
        x = se(ca, e) * (rx + off)
        y = se(sa, e) * ((rf if sa >= 0 else rb) + off)
        if self.dr is not None and self.scale:
            L = math.hypot(x, y)
            if L > 1e-9:
                k = (L + self.dr(z, a) * self.scale) / L
                x *= k
                y *= k
        return Vector((cx + x, cy - y, z))

    def loft(self, name, material, z0, z1, nrings, segs, cap0=True, cap1=True, noise=0.0, cap_bulge=(0, 0), angle=80,
             zs=None):
        zs = zs or [z0 + (z1 - z0) * i / (nrings - 1) for i in range(nrings)]
        rows, cents = [], []
        for z in zs:
            rows.append([self.point(z, TAU * j / segs) for j in range(segs)])
            cents.append(Vector((0, self.at(z)[1], z)))
        p0 = (cents[0] - Vector((0, 0, cap_bulge[0]))) if cap0 else None
        p1 = (cents[-1] + Vector((0, 0, cap_bulge[1]))) if cap1 else None
        return skin(name, rows, material, cents, p0, p1, angle)


def pillow(name, center, size, material, basis=None, bevel=0.01, segs=2, bulge=0.0, taper=None, angle=40, sag=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    b = min(bevel, min(size) * 0.45)
    if b > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=b, segments=segs, affect='EDGES', profile=0.5)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if e.calc_length() > max(sx, sz) * 0.45], cuts=1,
                              use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co
        ux = max(0.0, 1 - (2 * x / sx) ** 2)
        uz = max(0.0, 1 - (2 * z / sz) ** 2)
        if y > 0:
            v.co.y += bulge * ux * uz * (y / (sy / 2))
        if taper and z > 0:
            f = z / (sz / 2)
            v.co.x *= 1 + (taper[0] - 1) * f
            v.co.y *= 1 + (taper[1] - 1) * f
        if sag and z < 0:
            v.co.y += sag * (-z / (sz / 2)) ** 2 * ux
    m = Matrix.Identity(4)
    if basis is not None:
        X, Y, Z = basis
        m = Matrix((X, Y, Z)).transposed().to_4x4()
    m.translation = Vector(center)
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return finish(bm, name, material, True, angle)


def pillow_on(name, prof, z, a, off, size, material, bevel=0.01, bulge=0.008, taper=None, sag=0.0, segs=2):
    t, n, up = surface_basis(prof, z, a)
    p = prof.point(z, a, off) + n * (size[1] * 0.5)
    return pillow(name, p, size, material, basis=(t, n, up), bevel=bevel, bulge=bulge, taper=taper, sag=sag,
                  segs=segs)


def torso_dr(z, a):
    d = 0.0
    d += bump(z, a, 0.905, BACK - 0.42, 0.055, 0.42, 0.013) + bump(z, a, 0.905, BACK + 0.42, 0.055, 0.42, 0.013)
    d += bump(z, a, 1.29, BACK - 0.5, 0.06, 0.35, 0.006) + bump(z, a, 1.29, BACK + 0.5, 0.06, 0.35, 0.006)
    d += bump(z, a, 1.22, 0.15, 0.07, 0.35, 0.005) + bump(z, a, 1.22, math.pi - 0.15, 0.07, 0.35, 0.005)
    d += bump(z, a, 0.865, FRONT, 0.03, 0.18, 0.005)
    d += bump(z, a, 1.27, FRONT - 0.45, 0.05, 0.4, 0.006) + bump(z, a, 1.27, FRONT + 0.45, 0.05, 0.4, 0.006)
    d += creases(z, a, 1.035, 1.075, 1.5, 0.004, seed=1.0)
    d += creases(z, a, 0.93, 0.985, 1.5, 0.003, seed=2.0)
    return d


TORSO = Profile2([
    (0.79, 0.004, 0.070, 0.055, 0.065, 2.0),
    (0.83, 0.006, 0.140, 0.072, 0.095, 2.1),
    (0.89, 0.010, 0.176, 0.088, 0.112, 2.2),
    (0.95, 0.010, 0.178, 0.098, 0.110, 2.2),
    (1.01, 0.006, 0.164, 0.098, 0.100, 2.2),
    (1.09, 0.002, 0.160, 0.104, 0.098, 2.2),
    (1.17, 0.000, 0.168, 0.112, 0.100, 2.3),
    (1.25, 0.000, 0.178, 0.118, 0.104, 2.3),
    (1.31, 0.002, 0.188, 0.112, 0.104, 2.4),
    (1.36, 0.006, 0.186, 0.096, 0.096, 2.5),
    (1.40, 0.010, 0.160, 0.080, 0.088, 2.3),
    (1.428, 0.012, 0.096, 0.064, 0.072, 2.1),
    (1.455, 0.012, 0.064, 0.056, 0.062, 2.0),
], torso_dr)


def head_dr(z, a):
    d = 0.0
    d += bump(z, a, 1.548, FRONT, 0.022, 0.16, 0.016)
    d += bump(z, a, 1.582, FRONT, 0.014, 0.10, 0.007)
    d += bump(z, a, 1.613, FRONT, 0.008, 0.55, 0.005)
    d -= bump(z, a, 1.592, FRONT - 0.36, 0.010, 0.16, 0.006)
    d -= bump(z, a, 1.592, FRONT + 0.36, 0.010, 0.16, 0.006)
    d += bump(z, a, 1.563, FRONT - 0.78, 0.018, 0.25, 0.006)
    d += bump(z, a, 1.563, FRONT + 0.78, 0.018, 0.25, 0.006)
    d += bump(z, a, 1.486, FRONT, 0.012, 0.30, 0.007)
    d += bump(z, a, 1.507, FRONT, 0.008, 0.25, 0.004)
    d += bump(z, a, 1.598, BACK, 0.040, 0.60, 0.008)
    d += bump(z, a, 1.505, 0.25, 0.015, 0.20, 0.004) + bump(z, a, 1.505, math.pi - 0.25, 0.015, 0.20, 0.004)
    return d


HEAD = Profile2([
    (1.468, -0.030, 0.030, 0.030, 0.030, 2.0),
    (1.485, -0.022, 0.050, 0.058, 0.040, 2.0),
    (1.505, -0.014, 0.060, 0.080, 0.055, 2.0),
    (1.530, -0.008, 0.066, 0.090, 0.070, 2.0),
    (1.560, -0.002, 0.071, 0.094, 0.088, 2.0),
    (1.590, 0.002, 0.075, 0.096, 0.098, 2.05),
    (1.615, 0.004, 0.077, 0.096, 0.103, 2.1),
    (1.645, 0.006, 0.076, 0.091, 0.102, 2.1),
    (1.670, 0.008, 0.070, 0.080, 0.094, 2.1),
    (1.690, 0.009, 0.058, 0.064, 0.078, 2.0),
    (1.702, 0.009, 0.040, 0.044, 0.054, 2.0),
    (1.708, 0.009, 0.020, 0.022, 0.026, 2.0),
], head_dr)
HEAD_SMOOTH = HEAD.view(0.45)


def arm_left():
    u, f = arm_dirs()
    elbow, wrist = arm_points()
    S0 = SHOULDER
    keys = [
        {'c': S0 - u * 0.062, 'rx': 0.026, 'rf': 0.026, 'rb': 0.026, 'rs': 0.026},
        {'c': S0 - u * 0.038, 'rx': 0.046, 'rf': 0.046, 'rb': 0.047, 'rs': 0.048},
        {'c': S0 - u * 0.005, 'rx': 0.055, 'rf': 0.057, 'rb': 0.058, 'rs': 0.062},
        {'c': S0 + u * 0.05, 'rx': 0.054, 'rf': 0.057, 'rb': 0.057, 'rs': 0.063},
        {'c': S0 + u * 0.11, 'rx': 0.050, 'rf': 0.056, 'rb': 0.054, 'rs': 0.055},
        {'c': S0 + u * 0.18, 'rx': 0.046, 'rf': 0.051, 'rb': 0.050, 'rs': 0.049},
        {'c': S0 + u * 0.245, 'rx': 0.045, 'rf': 0.046, 'rb': 0.049, 'rs': 0.047},
        {'c': elbow, 'rx': 0.046, 'rf': 0.045, 'rb': 0.051, 'rs': 0.048},
        {'c': elbow + f * 0.045, 'rx': 0.047, 'rf': 0.046, 'rb': 0.046, 'rs': 0.050},
        {'c': elbow + f * 0.10, 'rx': 0.044, 'rf': 0.042, 'rb': 0.042, 'rs': 0.046},
        {'c': elbow + f * 0.155, 'rx': 0.038, 'rf': 0.036, 'rb': 0.037, 'rs': 0.040},
        {'c': elbow + f * 0.205, 'rx': 0.035, 'rf': 0.033, 'rb': 0.034, 'rs': 0.036},
    ]
    te = 0.62

    def dr(t, a):
        d = creases(t, a, te - 0.10, te + 0.06, 2.5, 0.0045, seed=0.5, focus=FRONT, spread=0.9)
        d += creases(t, a, te + 0.05, 0.98, 2.0, 0.0025, seed=1.3)
        d += creases(t, a, 0.20, te - 0.08, 1.5, 0.0018, seed=2.1)
        return d

    sleeve = tube('Sleeve_L', keys, 'Fabric', segs=16, n=24, dr=dr, cap0=0.012, cap_rings=2)
    cuff = tube('Cuff_L', [{'c': elbow + f * 0.192, 'rx': 0.041, 'rf': 0.037, 'rb': 0.038},
                           {'c': elbow + f * 0.215, 'rx': 0.042, 'rf': 0.038, 'rb': 0.039},
                           {'c': elbow + f * 0.238, 'rx': 0.038, 'rf': 0.031, 'rb': 0.033},
                           {'c': wrist + f * 0.016, 'rx': 0.032, 'rf': 0.023, 'rb': 0.025}],
                'Gear', segs=14, n=6, cap0=0.004)
    strap = tube('CuffStrap_L', [{'c': elbow + f * 0.212, 'rx': 0.0435, 'rf': 0.0395, 'rb': 0.0405},
                                 {'c': elbow + f * 0.226, 'rx': 0.0425, 'rf': 0.037, 'rb': 0.038}],
                 'Hard', segs=14, n=2, cap0=0.0, cap1=0.0, cap_rings=1, angle=40)
    band = tube('Armband_L', [{'c': S0 + u * 0.115, 'rx': 0.0545, 'rf': 0.0605, 'rb': 0.0585, 'rs': 0.0605},
                              {'c': S0 + u * 0.165, 'rx': 0.0515, 'rf': 0.0565, 'rb': 0.0555, 'rs': 0.0565}],
                'TeamColour', segs=18, n=2, cap0=0.0, cap1=0.0, cap_rings=1, angle=40)
    hand = hand_left(wrist + f * 0.010, f)
    return [sleeve, cuff, strap, band] + hand


def hand_left(base, L):
    L = L.normalized()
    N = (Vector((-1, 0, 0)) - L * L.dot(Vector((-1, 0, 0)))).normalized()
    W = N.cross(L).normalized()
    if W.y > 0:
        W = -W

    def P(l, w, n):
        return base + L * l + W * w + N * n

    parts = []

    def palm_dr(t, a):
        return bump(t, a, 0.35, math.radians(60), 0.25, 0.6, 0.006) + bump(t, a, 0.92, math.radians(270), 0.08, 0.9,
                                                                            0.002)

    palm = tube('Palm_L', [
        {'c': P(0.0, 0.0, 0.0), 'rx': 0.031, 'rs': 0.031, 'rf': 0.018, 'rb': 0.017, 'e': 2.4, 'hint': N},
        {'c': P(0.03, 0.002, 0.002), 'rx': 0.041, 'rs': 0.040, 'rf': 0.021, 'rb': 0.017, 'e': 2.8, 'hint': N},
        {'c': P(0.065, 0.002, 0.003), 'rx': 0.045, 'rs': 0.044, 'rf': 0.019, 'rb': 0.016, 'e': 3.0, 'hint': N},
        {'c': P(0.092, 0.0, 0.004), 'rx': 0.044, 'rs': 0.043, 'rf': 0.015, 'rb': 0.015, 'e': 2.8, 'hint': N},
    ], 'Gear', segs=12, n=6, hint=N, dr=palm_dr, cap1=0.008, cap_rings=2)
    parts.append(palm)
    parts.append(guard_plate('Knuckle_L', P(0.08, 0.0, -0.016), (0.054, 0.0040, 0.022), 'Hard', basis=(W, -N, L)))
    fingers = [(0.0285, 0.082, 1.0), (0.0095, 0.090, 1.0), (-0.0095, 0.085, 0.97), (-0.0275, 0.070, 0.9)]
    sgn = 1.0 if (Matrix.Rotation(0.1, 3, W) @ L).dot(N) > 0 else -1.0
    for k, (w, ln, sc) in enumerate(fingers):
        d = L.copy()
        pts = [P(0.070, w, 0.003)]
        seg = [ln * 0.42 + 0.014, ln * 0.32, ln * 0.26]
        curl = [math.radians(14 + k * 3), math.radians(24 + k * 3), math.radians(16)]
        for s, c in zip(seg, curl):
            d = (Matrix.Rotation(sgn * c, 3, W) @ d).normalized()
            pts.append(pts[-1] + d * s)
        r = 0.0105 * sc
        keys = []
        for i, p in enumerate(pts):
            rr = r * (1.0 - 0.13 * i / 3)
            kn = 1.08 if 0 < i < 3 else 1.0
            keys.append({'c': p, 'rx': rr * kn, 'rs': rr * kn, 'rf': rr * 0.95, 'rb': rr * 0.98 * kn})
            if i < 3:
                q = p.lerp(pts[i + 1], 0.5)
                keys.append({'c': q, 'rx': rr * 0.95, 'rs': rr * 0.95, 'rf': rr * 0.9, 'rb': rr * 0.92})
        parts.append(tube('Finger_L%d' % k, keys, 'Gear', segs=7, n=7, hint=N, cap0=0.004, cap1=r * 0.85,
                          cap_rings=2))
    t0 = P(0.002, 0.016, 0.001)
    td = (L * 0.78 + W * 0.20 + N * 0.55).normalized()
    pts = [t0, t0 + td * 0.036]
    td2 = (L * 0.70 - W * 0.30 + N * 0.62).normalized()
    pts.append(pts[-1] + td2 * 0.026)
    td3 = (L * 0.70 - W * 0.55 + N * 0.42).normalized()
    pts.append(pts[-1] + td3 * 0.021)
    keys = [{'c': p, 'rx': (0.0190, 0.0150, 0.0124, 0.0110)[i], 'rs': (0.0190, 0.0150, 0.0124, 0.0110)[i],
             'rf': (0.0165, 0.0128, 0.0110, 0.0098)[i], 'rb': (0.0165, 0.0128, 0.0110, 0.0098)[i]}
            for i, p in enumerate(pts)]
    parts.append(tube('Thumb_L', keys, 'Gear', segs=7, n=7, hint=N, cap0=0.004, cap1=0.009, cap_rings=2))
    return parts


def leg_left():
    th = (KNEE - HIP).normalized()
    sh = (ANKLE - KNEE).normalized()
    keys = [
        {'c': Vector((0.085, 0.007, 1.005)), 'rx': 0.25, 'rf': 0.101, 'rb': 0.104, 'rs': 0.086, 'e': 2.2},  # waist
        {'c': HIP - th * 0.03, 'rx': 0.20, 'rf': 0.101, 'rb': 0.113, 'rs': 0.094},                          # seat
        {'c': HIP + th * 0.06, 'rx': 0.13, 'rf': 0.104, 'rb': 0.117, 'rs': 0.100},
        {'c': HIP + th * 0.16, 'rx': 0.087, 'rf': 0.095, 'rb': 0.098, 'rs': 0.094},
        {'c': HIP + th * 0.27, 'rx': 0.075, 'rf': 0.082, 'rb': 0.081, 'rs': 0.084},
        {'c': HIP + th * 0.36, 'rx': 0.065, 'rf': 0.072, 'rb': 0.069, 'rs': 0.070},
        {'c': KNEE, 'rx': 0.059, 'rf': 0.068, 'rb': 0.061, 'rs': 0.061},
        {'c': KNEE + sh * 0.06, 'rx': 0.060, 'rf': 0.063, 'rb': 0.067, 'rs': 0.061},
        {'c': KNEE + sh * 0.13, 'rx': 0.066, 'rf': 0.061, 'rb': 0.075, 'rs': 0.064},
        {'c': KNEE + sh * 0.22, 'rx': 0.060, 'rf': 0.057, 'rb': 0.065, 'rs': 0.058},
        {'c': KNEE + sh * 0.29, 'rx': 0.064, 'rf': 0.064, 'rb': 0.068, 'rs': 0.064},
        {'c': KNEE + sh * 0.345, 'rx': 0.058, 'rf': 0.058, 'rb': 0.060, 'rs': 0.058},
    ]
    lt = (0.42 + 0.08)
    total = 0.08 + (KNEE - HIP).length + 0.335
    tk = lt / total

    def dr(t, a):
        d = creases(t, a, tk - 0.06, tk + 0.06, 2.5, 0.006, seed=0.3, focus=BACK, spread=0.8)
        d += creases(t, a, tk - 0.05, tk + 0.04, 1.5, 0.003, seed=1.1, focus=FRONT, spread=0.7)
        d += creases(t, a, 0.80, 0.97, 2.5, 0.004, seed=2.2)
        d += creases(t, a, 0.12, 0.40, 2.0, 0.0025, seed=0.9)
        d += 0.0025 * math.sin(5 * a + 0.7) * gauss(t - 0.25, 0.15)
        return d

    trousers = tube('Trousers_L', keys, 'Fabric', segs=16, n=28, dr=dr, cap0=0.02, cap_rings=2)
    parts = [trousers]
    parts += boot_left()
    kc = KNEE + Vector((0.0, -0.064, 0.008))

    def pad_dr(t, a):
        return -0.0025 * gauss(t - 0.42, 0.05) * gauss(angd(a, FRONT), 0.9)

    parts.append(tube('KneePad_L', [
        {'c': kc + Vector((0, 0.022, 0.078)), 'rx': 0.030, 'rf': 0.010, 'rb': 0.008},
        {'c': kc + Vector((0, 0.006, 0.050)), 'rx': 0.050, 'rf': 0.020, 'rb': 0.012},
        {'c': kc + Vector((0, 0.000, 0.005)), 'rx': 0.056, 'rf': 0.024, 'rb': 0.014},
        {'c': kc + Vector((0, 0.004, -0.045)), 'rx': 0.052, 'rf': 0.020, 'rb': 0.012},
        {'c': kc + Vector((0, 0.018, -0.075)), 'rx': 0.034, 'rf': 0.012, 'rb': 0.008},
    ], 'Hard', segs=14, n=7, dr=pad_dr, cap0=0.008, cap1=0.008, cap_rings=2, angle=70))
    for dz, name, q in ((0.062, 'KneeStrapTop_L', 0.0725), (-0.058, 'KneeStrapLow_L', 0.069)):
        c = KNEE + Vector((0, 0.002, dz))
        parts.append(tube(name, [{'c': c + Vector((0, 0, 0.011)), 'rx': q, 'rf': q, 'rb': q + 0.002},
                                 {'c': c - Vector((0, 0, 0.011)), 'rx': q, 'rf': q, 'rb': q + 0.002}],
                          'Gear', segs=16, n=2, cap0=0.0, cap1=0.0, cap_rings=1, angle=40))
    pc = HIP + th * 0.25
    out = Vector((1, 0, 0))
    up = -th
    fwd = out.cross(up).normalized()
    basis = (fwd, out, up)
    parts.append(pillow('Cargo_L', pc + out * 0.082, (0.13, 0.026, 0.165), 'Fabric', basis=basis, bevel=0.012,
                        bulge=0.010, sag=0.004))
    parts.append(pillow('CargoFlap_L', pc + out * 0.100 + up * 0.07, (0.136, 0.014, 0.05), 'Fabric', basis=basis,
                        bevel=0.006, bulge=0.003, segs=2))
    return parts


def boot_left():
    a = ANKLE
    x = a.x
    y0 = a.y
    to = 0.012   # toes turned out a little
    # centre line from the shaft top, down the ankle, bending forward to the toe. Ring front axis: the shin, turning
    # into the top of the foot; ring back axis: the calf, turning into the sole side (so the heel is the bend's back).
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
    # sole: heel block, raised arch, rounded edges, a little wider than the upper
    fk = [(0.062, 0.040, 0.040, True), (0.035, 0.046, 0.045, True), (-0.010, 0.040, 0.042, False),
          (-0.060, 0.050, 0.048, False), (-0.100, 0.056, 0.051, False), (-0.150, 0.053, 0.049, False),
          (-0.185, 0.044, 0.041, False), (-0.204, 0.030, 0.028, False)]
    sk = []
    for y, rin, rout, heel in fk:
        t = (0.062 - y) / 0.27
        arch = -0.03 < y <= 0.02
        sk.append({'c': (x + to * min(1.0, max(0.0, (-y - 0.02) / 0.17)), y0 + y, 0.016 if heel else (0.018 if arch else 0.012)),
                   'rx': rin, 'rs': rout, 'rf': 0.010, 'rb': 0.016 if heel else (0.008 if arch else 0.012),
                   'e': 3.6, 'hint': (0, 0, 1)})
    sole = tube('Sole_L', sk, 'Hard', segs=12, n=10, hint=(0, 0, 1), cap0=0.010, cap1=0.008, cap_rings=2, angle=50)
    lugs = []
    for i, y in enumerate([0.05, 0.02, -0.075, -0.105, -0.135, -0.165]):
        w = 0.078 if -0.15 < y < 0.06 else 0.064
        lugs.append(rbox('Lug_L%d' % i, (x + to * min(1.0, max(0.0, (-y - 0.02) / 0.17)), y0 + y, 0.002),
                         (w, 0.014, 0.005), 'Hard', bevel=0.0))
    lugs = join('Lugs_L', lugs)
    laces = []
    for i in range(5):
        z = 0.095 + i * 0.027
        yy = y0 - (0.047 + max(0.0, 0.12 - z) * 0.55)
        for s in (1, -1):
            ang = math.radians(28) * s
            bx = Vector((math.cos(ang), 0, math.sin(ang)))
            laces.append(rbox('Lace_L%d%d' % (i, s), (x, yy, z), (0.034, 0.006, 0.005), 'Hard', bevel=0.0,
                              basis=(bx, Vector((0, 1, 0)), bx.cross(Vector((0, 1, 0))).normalized() * -1)))
    laces = join('Laces_L', laces)
    return [boot, sole, lugs, laces]


def torso():
    zs = [0.79, 0.805, 0.825, 0.85, 0.875, 0.90, 0.93, 0.96, 0.99, 1.02, 1.05, 1.08, 1.12, 1.17, 1.22, 1.27, 1.31,
          1.34, 1.365, 1.385, 1.405, 1.42, 1.435, 1.455]
    shirt = TORSO.loft('Shirt', 'Fabric', 0, 0, 0, 30, cap0=True, cap1=False, cap_bulge=(0.008, 0), zs=zs)

    def neck_dr(t, a):
        return creases(t, a, 0.15, 0.9, 2.5, 0.0035, seed=0.6) + bump(t, a, 0.4, FRONT - 0.5, 0.3, 0.3, 0.003) + \
            bump(t, a, 0.4, FRONT + 0.5, 0.3, 0.3, 0.003)

    neck = tube('Gaiter', [
        {'c': (0, 0.014, 1.418), 'rx': 0.076, 'rf': 0.064, 'rb': 0.072},
        {'c': (0, 0.010, 1.445), 'rx': 0.062, 'rf': 0.056, 'rb': 0.064},
        {'c': (0, 0.004, 1.470), 'rx': 0.059, 'rf': 0.057, 'rb': 0.061},
        {'c': (0, -0.002, 1.492), 'rx': 0.061, 'rf': 0.064, 'rb': 0.060},
        {'c': (0, -0.008, 1.512), 'rx': 0.064, 'rf': 0.076, 'rb': 0.060},
    ], 'Fabric', segs=24, n=9, hint=(0, -1, 0), dr=neck_dr)
    return [shirt, neck]


def body():
    materials()
    parts = torso()
    left = arm_left() + leg_left()
    right = [mirror_x(o, o.name.replace('_L', '_R')) for o in left]
    return parts + left + right


def pouches():
    parts = []
    for i, da in enumerate((-0.40, 0.0, 0.40)):
        a = FRONT + da
        z = 1.115
        parts.append(pillow_on('MagPouch%d' % i, TORSO, z, a, 0.040, (0.078, 0.034, 0.115), 'Gear', bevel=0.009,
                               bulge=0.004))
        t, n, up = surface_basis(TORSO, z, a)
        base = TORSO.point(z, a, 0.040) + n * 0.018
        parts.append(rbox('Mag%d' % i, base + up * 0.075, (0.064, 0.024, 0.06), 'Hard', bevel=0.004, segs=1,
                          basis=(t, n, up)))
        parts.append(rbox('MagTab%d' % i, base + up * 0.107 + n * 0.004, (0.028, 0.03, 0.007), 'Gear', basis=(t, n, up),
                          bevel=0.0))
    a, z = FRONT, 1.272
    parts.append(pillow_on('AdminPouch', TORSO, z, a, 0.040, (0.17, 0.026, 0.074), 'Gear', bevel=0.01, bulge=0.008))
    t, n, up = surface_basis(TORSO, z, a)
    parts.append(rbox('TeamPatch', TORSO.point(z + 0.005, a, 0.040) + n * 0.035, (0.075, 0.005, 0.045), 'TeamColour',
                      bevel=0.003, segs=1, basis=(t, n, up)))
    a, z = BACK + PLATE_HALF + 0.02 - TAU, 1.14
    parts.append(pillow_on('RadioPouch', TORSO, z, a, 0.028, (0.065, 0.04, 0.12), 'Gear', bevel=0.01, bulge=0.004))
    t, n, up = surface_basis(TORSO, z, a)
    rp = TORSO.point(z, a, 0.028) + n * 0.02
    parts.append(rbox('Radio', rp + up * 0.072, (0.055, 0.032, 0.04), 'Hard', bevel=0.005, segs=1, basis=(t, n, up)))
    parts.append(cyl('Antenna', rp + up * 0.09 + t * 0.012, rp + up * 0.30 + t * 0.012 + Vector((0, 0.02, 0)), 0.005,
                     'Hard', segs=6, r1=0.0035))
    parts.append(panel('Hydration', TORSO, 1.085, 1.345, BACK - 0.40, BACK + 0.40, 0.040, 0.016, 5, 10, 'Gear',
                       inset=0.6, bulge=0.022))
    t, n, up = surface_basis(TORSO, 1.37, BACK)
    parts.append(pillow('DragHandle', TORSO.point(1.37, BACK, 0.040) + n * 0.008, (0.07, 0.014, 0.022), 'Gear',
                        basis=(t, n, up), bevel=0.005, segs=2))
    rows = []
    for k, z in enumerate((1.085, 1.125, 1.165)):
        for nm, a0, a1 in (('L', -0.62, 0.55), ('R', math.pi - 0.55, math.pi + 0.62)):
            rows.append(panel('Web%s%d' % (nm, k), TORSO, z, z + 0.022, a0, a1, 0.027, 0.003, 1, 6, 'Gear', inset=0.0,
                              inner=False))
        for nm, a0, a1 in (('BL', BACK + 0.40, BACK + 0.72), ('BR', BACK - 0.72, BACK - 0.40)):
            rows.append(panel('Web%s%d' % (nm, k), TORSO, z, z + 0.022, a0, a1, 0.0425, 0.003, 1, 3, 'Gear',
                              inset=0.0, inner=False))
    parts.append(join('Webbing', rows))
    return parts


def belt():
    parts = []
    parts.append(panel('Belt', TORSO, 0.985, 1.035, 0.0, TAU, 0.006, 0.016, 2, 30, 'Gear', inset=0.3, wrap=True))
    t, n, up = surface_basis(TORSO, 1.01, FRONT)
    parts.append(rbox('Buckle', TORSO.point(1.01, FRONT, 0.022) + n * 0.004, (0.06, 0.012, 0.045), 'Hard', bevel=0.004,
                      segs=1, basis=(t, n, up)))
    a = math.pi + 0.15
    t, n, up = surface_basis(TORSO, 0.97, a)
    hp = TORSO.point(0.97, a, 0.024) + n * 0.03
    parts.append(pillow('Holster', hp - up * 0.05, (0.05, 0.05, 0.17), 'Hard', basis=(t, n, up), bevel=0.012, segs=3,
                        taper=(1.25, 1.0), bulge=0.004))
    parts.append(rbox('PistolGrip', hp + up * 0.055 - t * 0.012, (0.03, 0.03, 0.07), 'Hard', bevel=0.007, segs=1,
                      basis=(t, n, (up + t * 0.25).normalized())))
    a = BACK + 0.55 - TAU
    parts.append(pillow_on('DumpPouch', TORSO, 0.95, a, 0.024, (0.12, 0.045, 0.13), 'Gear', bevel=0.018, bulge=0.012,
                           taper=(1.0, 1.2), sag=0.01))
    return parts


def head():
    parts = []
    zs = [1.468, 1.476, 1.487, 1.5, 1.514, 1.53, 1.546, 1.562, 1.578, 1.596, 1.62, 1.645]
    parts.append(HEAD.loft('Balaclava', 'Fabric', 0, 0, 0, 16, cap0=False, cap1=True, cap_bulge=(0, 0.03), zs=zs))
    zb = lambda a: 1.6075 + 0.0325 * math.sin(a) + 0.0175 * math.cos(a) ** 2 + (-0.006 if math.sin(a) < 0 else 0.0)
    top = 1.706
    H = HEAD.view(0.0)
    parts.append(panel('Helmet', H, zb, top, 0.0, TAU, 0.014, 0.011, 6, 24, 'TeamColour', inset=0.0, wrap=True,
                       angle=60, inner=False))
    c = H.at(top)
    parts.append(tube('HelmetCrown', [{'c': (0, c[1], top), 'rx': c[2] + 0.025, 'rf': c[3] + 0.025, 'rb': c[4] + 0.025},
                                      {'c': (0, c[1], top + 0.004), 'rx': c[2] + 0.022, 'rf': c[3] + 0.022,
                                       'rb': c[4] + 0.022}],
                      'TeamColour', segs=24, n=2, hint=(0, -1, 0), cap1=0.010, cap_rings=1, angle=60))
    parts.append(panel('HelmetRim', H, lambda a: zb(a) - 0.002, lambda a: zb(a) + 0.008, 0.0, TAU, 0.012, 0.016, 1,
                       24, 'Hard', inset=0.3, wrap=True, inner=False))
    for nm, a0, a1 in (('Rail_L', -0.75, 0.55), ('Rail_R', math.pi - 0.55, math.pi + 0.75)):
        parts.append(panel(nm, H, lambda a: zb(a) + 0.008, lambda a: zb(a) + 0.024, a0, a1, 0.024, 0.009, 1, 8,
                           'Hard', inset=0.25, inner=False))
    t, n, up = surface_basis(H, 1.665, FRONT)
    parts.append(rbox('Shroud', H.point(1.665, FRONT, 0.026) + n * 0.004, (0.05, 0.012, 0.03), 'Hard', bevel=0.004,
                      segs=1, basis=(t, n, up)))
    parts.append(panel('Counterweight', H, 1.592, 1.640, BACK - 0.45, BACK + 0.45, 0.025, 0.018, 2, 8, 'Gear',
                       inset=0.5, inner=False, bulge=0.004))
    parts.append(panel('Velcro', H, 1.668, 1.697, FRONT - 0.5, FRONT + 0.5, 0.0255, 0.003, 1, 6, 'Gear', inset=0.2,
                       inner=False))
    for sx, nm in ((1, 'EarCup_L'), (-1, 'EarCup_R')):
        p = Vector((sx * 0.080, 0.008, 1.585))
        parts.append(tube(nm, [{'c': p, 'rx': 0.038}, {'c': p + Vector((sx * 0.024, 0, 0)), 'rx': 0.037},
                               {'c': p + Vector((sx * 0.032, 0, 0)), 'rx': 0.032}], 'Hard', segs=12, n=3,
                          hint=(0, -1, 0), cap0=0.0, cap1=0.006, cap_rings=1, angle=50))
    parts.append(tube('Mic', [{'c': (0.098, -0.03, 1.565), 'rx': 0.004}, {'c': (0.092, -0.07, 1.545), 'rx': 0.004},
                              {'c': (0.06, -0.108, 1.535), 'rx': 0.004}, {'c': (0.035, -0.116, 1.535), 'rx': 0.007}],
                      'Hard', segs=4, n=6, hint=(0, 0, 1), cap1=0.006, cap_rings=1))
    G = HEAD_SMOOTH
    gz0, gz1 = 1.583, 1.628
    ga0, ga1 = FRONT - 1.0, FRONT + 1.0
    parts.append(panel('GoggleFrame', G, gz0, gz1, ga0, ga1, 0.012, 0.018, 3, 14, 'Hard', inset=0.35, bulge=0.004,
                       inner=False))
    parts.append(panel('GoggleLens', G, gz0 + 0.005, gz1 - 0.004, ga0 + 0.08, ga1 - 0.08, 0.028, 0.008, 2, 16, 'Lens',
                       inset=0.3, bulge=0.005, inner=False))
    parts.append(panel('GoggleStrap', H, 1.598, 1.618, ga1 - 0.05, ga0 + TAU + 0.05, 0.026, 0.004, 1, 16, 'Gear',
                       inset=0.0, inner=False))
    mz0, mz1 = 1.476, 1.580
    ma0, ma1 = FRONT - 1.15, FRONT + 1.15
    parts.append(panel('MeshMask', G, mz0, mz1, ma0, ma1, 0.012, 0.006, 5, 12, 'Hard', inset=0.0, inner=False))
    parts.append(panel('MaskEdgeTop', G, mz1 - 0.008, mz1 + 0.002, ma0, ma1, 0.012, 0.010, 1, 14, 'Gear', inset=0.35,
                       inner=False))
    parts.append(panel('MaskEdgeLow', G, mz0 - 0.002, mz0 + 0.008, ma0, ma1, 0.012, 0.010, 1, 14, 'Gear', inset=0.35,
                       inner=False))
    bars = []
    for i in range(3):
        z = mz0 + 0.026 + i * 0.024
        bars.append(panel('MaskBar%d' % i, G, z - 0.0015, z + 0.0015, ma0 + 0.12, ma1 - 0.12, 0.0175, 0.0018, 1, 8,
                          'Hard', inset=0.0, inner=False))
    parts.append(join('MaskBars', bars))
    return parts

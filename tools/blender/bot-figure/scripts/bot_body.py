
# Bot figure build: the human body (combat shirt, trousers, boots, gloves). Run after bot_helpers.py.
# Figure faces -Y, its left at +X, feet at z=0, helmet top at 1.73 m.

def materials():
    mat('Fabric', 0x565b45, rough=0.92)
    mat('Gear', 0x7a6a50, rough=0.85)
    mat('Hard', 0x1f2022, rough=0.45)
    mat('Lens', 0x5a7088, rough=0.05, metal=0.9)
    mat('TeamColour', 0x3d8bff, rough=0.7)


TORSO = Profile([
    (0.79, 0.004, 0.070, 0.055, 0.065, 2.0),
    (0.83, 0.006, 0.140, 0.080, 0.095, 2.1),
    (0.89, 0.010, 0.176, 0.094, 0.118, 2.2),
    (0.95, 0.010, 0.178, 0.098, 0.116, 2.2),
    (1.01, 0.006, 0.164, 0.098, 0.100, 2.2),
    (1.09, 0.002, 0.160, 0.104, 0.098, 2.2),
    (1.17, 0.000, 0.168, 0.112, 0.100, 2.3),
    (1.25, 0.000, 0.178, 0.118, 0.104, 2.3),
    (1.31, 0.002, 0.188, 0.112, 0.104, 2.4),
    (1.36, 0.006, 0.186, 0.096, 0.096, 2.5),
    (1.40, 0.010, 0.160, 0.080, 0.088, 2.3),
    (1.428, 0.012, 0.096, 0.064, 0.072, 2.1),
    (1.455, 0.012, 0.064, 0.056, 0.062, 2.0),
])

HEAD = Profile([
    (1.470, -0.018, 0.040, 0.045, 0.045, 2.0),
    (1.500, -0.014, 0.058, 0.074, 0.052, 2.0),
    (1.540, -0.008, 0.069, 0.088, 0.074, 2.0),
    (1.580, 0.000, 0.075, 0.094, 0.094, 2.1),
    (1.620, 0.003, 0.078, 0.095, 0.100, 2.1),
    (1.660, 0.006, 0.073, 0.083, 0.094, 2.1),
    (1.690, 0.008, 0.054, 0.060, 0.070, 2.0),
    (1.705, 0.008, 0.024, 0.026, 0.030, 2.0),
])

SHOULDER = Vector((0.180, 0.004, 1.382))
UPPER_LEN, FORE_LEN = 0.285, 0.25


def arm_dirs():
    th = math.radians(34)
    u = Vector((math.sin(th), 0.015, -math.cos(th))).normalized()
    th2 = math.radians(30)
    f = Vector((math.sin(th2), -0.20, -math.cos(th2))).normalized()
    return u, f


def arm_points():
    u, f = arm_dirs()
    elbow = SHOULDER + u * UPPER_LEN
    wrist = elbow + f * FORE_LEN
    return elbow, wrist


def arm_left():
    u, f = arm_dirs()
    elbow, wrist = arm_points()
    up = [(-0.065, 0.026, 0.026, 0.026), (-0.04, 0.045, 0.044, 0.045), (-0.012, 0.056, 0.055, 0.057),
          (0.02, 0.060, 0.058, 0.060), (0.07, 0.061, 0.058, 0.058),
          (0.12, 0.055, 0.053, 0.054), (0.18, 0.050, 0.049, 0.050), (0.23, 0.047, 0.046, 0.048)]
    rings = []
    for d, rx, rf, rb in up:
        rings.append({'c': SHOULDER + u * d, 'rx': rx, 'rf': rf, 'rb': rb})
    mid = (u + f).normalized()
    rings.append({'c': elbow - u * 0.02, 'rx': 0.047, 'rf': 0.046, 'rb': 0.049, 'noise': 0.06})
    rings.append({'c': elbow + mid * 0.005, 'rx': 0.048, 'rf': 0.044, 'rb': 0.050, 'noise': 0.08})
    fore = [(0.03, 0.047, 0.043, 0.046), (0.07, 0.046, 0.042, 0.044), (0.12, 0.042, 0.037, 0.040),
            (0.17, 0.038, 0.033, 0.035), (0.205, 0.036, 0.031, 0.032), (0.215, 0.039, 0.034, 0.035),
            (0.225, 0.037, 0.032, 0.033)]
    for d, rx, rf, rb in fore:
        rings.append({'c': elbow + f * d, 'rx': rx, 'rf': rf, 'rb': rb, 'noise': 0.03 if d < 0.15 else 0.0})
    rings[0]['cap'] = 0.012
    sleeve = loft('Sleeve_L', rings, 'Fabric', segs=16, hint=(0, -1, 0), cap0=True, cap1=True, noise=0.02, angle=80)
    cuff = loft('Cuff_L', [{'c': elbow + f * 0.200, 'rx': 0.041, 'rf': 0.036, 'rb': 0.037},
                           {'c': elbow + f * 0.235, 'rx': 0.042, 'rf': 0.037, 'rb': 0.038},
                           {'c': wrist, 'rx': 0.034, 'rf': 0.026, 'rb': 0.028},
                           {'c': wrist + f * 0.02, 'rx': 0.031, 'rf': 0.022, 'rb': 0.024}],
                'Gear', segs=12, hint=(0, -1, 0))
    band = loft('Armband_L', [{'c': SHOULDER + u * 0.115, 'rx': 0.059, 'rf': 0.057, 'rb': 0.058},
                              {'c': SHOULDER + u * 0.165, 'rx': 0.055, 'rf': 0.053, 'rb': 0.054}],
                'TeamColour', segs=14, hint=(0, -1, 0), cap0=False, cap1=False, smooth=True)
    inner = loft('Armband_L_in', [{'c': SHOULDER + u * 0.115, 'rx': 0.053, 'rf': 0.051, 'rb': 0.052},
                                  {'c': SHOULDER + u * 0.165, 'rx': 0.049, 'rf': 0.047, 'rb': 0.048}],
                 'TeamColour', segs=14, hint=(0, -1, 0), cap0=False, cap1=False)
    band = join('Armband_L', [band, inner])
    hand = hand_left(wrist + f * 0.012, f)
    return [sleeve, cuff, band] + hand


def hand_left(base, L):
    L = L.normalized()
    N = (Vector((-1, 0, 0)) - L * L.dot(Vector((-1, 0, 0)))).normalized()
    W = N.cross(L).normalized()
    if W.y > 0:
        W = -W

    def P(l, w, n):
        return base + L * l + W * w + N * n

    parts = []
    palm = loft('Palm_L', [
        {'c': P(0.0, 0.0, 0.0), 'rx': 0.032, 'rf': 0.019, 'rb': 0.017, 'e': 2.6},
        {'c': P(0.03, 0.002, 0.002), 'rx': 0.041, 'rf': 0.022, 'rb': 0.018, 'e': 3.0},
        {'c': P(0.065, 0.002, 0.003), 'rx': 0.045, 'rf': 0.020, 'rb': 0.017, 'e': 3.2},
        {'c': P(0.094, 0.0, 0.005), 'rx': 0.044, 'rf': 0.015, 'rb': 0.015, 'e': 3.0, 'cap': 0.006},
    ], 'Gear', segs=14, hint=N, angle=70)
    parts.append(palm)
    parts.append(rbox('Knuckle_L', P(0.078, 0.0, -0.017), (0.07, 0.026, 0.008), 'Hard', bevel=0.003, segs=1,
                      basis=(W, L, -N)))
    fingers = [(0.0285, 0.082, 1.0), (0.0095, 0.090, 1.0), (-0.0095, 0.085, 0.97), (-0.0275, 0.070, 0.9)]
    for k, (w, ln, sc) in enumerate(fingers):
        start = P(0.088, w, 0.003)
        d = L.copy()
        pts = [start]
        seg = [ln * 0.42, ln * 0.32, ln * 0.26]
        curl = [math.radians(18 + k * 4), math.radians(32 + k * 4), math.radians(24)]
        sgn = 1.0 if (Matrix.Rotation(0.1, 3, W) @ L).dot(N) > 0 else -1.0
        for s, c in zip(seg, curl):
            d = (Matrix.Rotation(sgn * c, 3, W) @ d).normalized()
            pts.append(pts[-1] + d * s)
        r = 0.0108 * sc
        rings = []
        for i, p in enumerate(pts):
            rr = r * (1.0 - 0.12 * i / 3)
            rings.append({'c': p, 'rx': rr, 'rf': rr * 0.95, 'rb': rr * 0.95})
            if 0 < i < 3:
                rings.append({'c': p + (pts[i + 1] - p).normalized() * 0.006, 'rx': rr * 0.93, 'rf': rr * 0.9,
                              'rb': rr * 0.9})
        rings[-1]['cap'] = r * 0.8
        parts.append(loft('Finger_L%d' % k, rings, 'Gear', segs=7, hint=N, angle=70))
    t0 = P(0.022, 0.024, 0.008)
    td = (L * 0.62 + W * 0.50 + N * 0.60).normalized()
    pts = [t0, t0 + td * 0.034]
    td2 = (L * 0.80 + W * 0.18 + N * 0.56).normalized()
    pts.append(pts[-1] + td2 * 0.028)
    td3 = (L * 0.86 - W * 0.12 + N * 0.48).normalized()
    pts.append(pts[-1] + td3 * 0.024)
    rings = [{'c': p, 'rx': 0.014 - 0.0012 * i, 'rf': 0.012 - 0.001 * i, 'rb': 0.012 - 0.001 * i}
             for i, p in enumerate(pts)]
    rings[-1]['cap'] = 0.008
    parts.append(loft('Thumb_L', rings, 'Gear', segs=8, hint=N, angle=70))
    return parts


HIP = Vector((0.092, 0.004, 0.925))
KNEE = Vector((0.104, -0.010, 0.500))
ANKLE = Vector((0.118, 0.012, 0.088))


def leg_left():
    th = (KNEE - HIP).normalized()
    sh = (ANKLE - KNEE).normalized()
    rings = []
    # loose combat trousers: (distance from the hip, outer, front, back, inner)
    for d, rx, rf, rb, rs in [(-0.02, 0.092, 0.094, 0.104, 0.094), (0.04, 0.098, 0.098, 0.106, 0.094),
                              (0.10, 0.096, 0.094, 0.098, 0.088), (0.17, 0.090, 0.088, 0.092, 0.080),
                              (0.24, 0.082, 0.082, 0.084, 0.072), (0.31, 0.074, 0.074, 0.075, 0.066),
                              (0.37, 0.068, 0.068, 0.068, 0.062)]:
        rings.append({'c': HIP + th * d, 'rx': rs, 'rf': rf, 'rb': rb, 'rs': rx, 'noise': 0.03})
    rings.append({'c': KNEE + Vector((0, 0, 0.015)), 'rx': 0.058, 'rf': 0.064, 'rb': 0.062, 'rs': 0.060, 'noise': 0.06})
    rings.append({'c': KNEE + sh * 0.02, 'rx': 0.057, 'rf': 0.062, 'rb': 0.064, 'rs': 0.059, 'noise': 0.07})
    for d, rx, rf, rb, rs, nz in [(0.07, 0.064, 0.062, 0.072, 0.060, 0.04), (0.13, 0.066, 0.060, 0.076, 0.061, 0.03),
                                  (0.20, 0.061, 0.057, 0.068, 0.057, 0.03), (0.26, 0.057, 0.054, 0.060, 0.053, 0.04),
                                  (0.30, 0.062, 0.062, 0.066, 0.059, 0.03), (0.33, 0.059, 0.059, 0.062, 0.057, 0.02),
                                  (0.35, 0.048, 0.050, 0.050, 0.046, 0.0)]:
        rings.append({'c': KNEE + sh * d, 'rx': rs, 'rf': rf, 'rb': rb, 'rs': rx, 'noise': nz})
    # a leg's ring side axis S = T x F points to -X (T runs down), so rx is the inner side and rs the outer
    trousers = loft('Trousers_L', rings, 'Fabric', segs=18, hint=(0, -1, 0), noise=0.01, angle=60)
    parts = [trousers]
    parts += boot_left()
    kc = KNEE + Vector((0.0, -0.068, 0.0))
    pad = loft('KneePad_L', [
        {'c': kc + Vector((0, 0.022, 0.075)), 'rx': 0.030, 'rf': 0.008, 'rb': 0.008, 'cap': 0.0},
        {'c': kc + Vector((0, 0.008, 0.055)), 'rx': 0.050, 'rf': 0.016, 'rb': 0.012},
        {'c': kc + Vector((0, 0.0, 0.010)), 'rx': 0.056, 'rf': 0.022, 'rb': 0.016},
        {'c': kc + Vector((0, 0.004, -0.040)), 'rx': 0.052, 'rf': 0.018, 'rb': 0.014},
        {'c': kc + Vector((0, 0.020, -0.070)), 'rx': 0.034, 'rf': 0.010, 'rb': 0.010},
    ], 'Hard', segs=14, hint=(0, -1, 0), angle=55)
    parts.append(pad)
    for dz, name in ((0.058, 'KneeStrapTop_L'), (-0.055, 'KneeStrapLow_L')):
        c = KNEE + Vector((0, 0.002, dz))
        q = 0.071 if dz > 0 else 0.068
        parts.append(loft(name, [{'c': c + Vector((0, 0, 0.012)), 'rx': q, 'rf': q, 'rb': q + 0.002},
                                 {'c': c - Vector((0, 0, 0.012)), 'rx': q, 'rf': q, 'rb': q + 0.002}],
                          'Gear', segs=14, cap0=True, cap1=True, angle=40))
    pc = HIP + th * 0.25
    out = Vector((1, 0, 0))
    up = -th
    fwd = up.cross(out).normalized()
    basis = (fwd, out, up)
    parts.append(rbox('Cargo_L', pc + out * 0.084, (0.13, 0.032, 0.16), 'Fabric', bevel=0.012, basis=basis,
                      taper=(0.96, 0.7)))
    parts.append(rbox('CargoFlap_L', pc + out * 0.095 + up * 0.075, (0.135, 0.022, 0.05), 'Fabric', bevel=0.008,
                      basis=basis))
    return parts


def boot_left():
    a = ANKLE
    x = a.x
    shaft = loft('BootShaft_L', [
        {'c': (x, a.y + 0.004, 0.212), 'rx': 0.050, 'rf': 0.052, 'rb': 0.054, 'cap': 0.0},
        {'c': (x, a.y + 0.004, 0.190), 'rx': 0.049, 'rf': 0.051, 'rb': 0.053},
        {'c': (x, a.y + 0.004, 0.150), 'rx': 0.046, 'rf': 0.050, 'rb': 0.052},
        {'c': (x, a.y + 0.002, 0.100), 'rx': 0.047, 'rf': 0.058, 'rb': 0.054},
        {'c': (x, a.y, 0.055), 'rx': 0.048, 'rf': 0.060, 'rb': 0.050},
    ], 'Gear', segs=16, hint=(0, -1, 0), angle=50)
    toe_out = 0.012
    pts = [(0.070, 0.050, 0.038, 0.036, 0.034), (0.040, 0.052, 0.046, 0.042, 0.040),
           (-0.010, 0.050, 0.054, 0.042, 0.040), (-0.060, 0.048, 0.050, 0.034, 0.036),
           (-0.110, 0.051, 0.054, 0.028, 0.034), (-0.150, 0.048, 0.052, 0.026, 0.030),
           (-0.180, 0.040, 0.044, 0.022, 0.028), (-0.200, 0.028, 0.030, 0.016, 0.022)]
    rings = []
    for y, rs, rx, up, dn in pts:
        t = (0.07 - y) / 0.27
        rings.append({'c': (x + toe_out * t, a.y + y, 0.036), 'rx': rx * 0.92, 'rs': rs * 0.92, 'rf': up, 'rb': dn * 0.6,
                      'hint': (0, 0, 1), 'e': 2.6, 'T': (toe_out / 0.27, -1, 0)})
    rings[0]['cap'] = 0.012
    rings[-1]['cap'] = 0.012
    foot = loft('BootFoot_L', rings, 'Gear', segs=16, hint=(0, 0, 1), angle=55)
    srings = []
    for y, rs, rx, up, dn in pts:
        t = (0.07 - y) / 0.27
        srings.append({'c': (x + toe_out * t, a.y + y, 0.013), 'rx': rx * 0.98 + 0.004, 'rs': rs * 0.98 + 0.004,
                       'rf': 0.013, 'rb': 0.013, 'hint': (0, 0, 1), 'e': 4.0, 'T': (toe_out / 0.27, -1, 0)})
    srings[0]['cap'] = 0.006
    srings[-1]['cap'] = 0.008
    sole = loft('Sole_L', srings, 'Hard', segs=16, hint=(0, 0, 1), angle=40)
    lugs = []
    for i, y in enumerate([0.055, 0.025, -0.07, -0.10, -0.13, -0.16]):
        t = (0.07 - y) / 0.27
        w = 0.085 if -0.15 < y < 0.06 else 0.07
        lugs.append(rbox('Lug_L%d' % i, (x + toe_out * t, a.y + y, 0.003), (w, 0.016, 0.006), 'Hard', bevel=0.0))
    lugs = join('Lugs_L', lugs)
    laces = []
    for i in range(5):
        z = 0.08 + i * 0.033
        yy = a.y - (0.058 if z < 0.12 else 0.052)
        laces.append(rbox('Lace_L%d' % i, (x, yy - 0.003, z), (0.034, 0.008, 0.007), 'Hard', bevel=0.0))
    laces = join('Laces_L', laces)
    return [shaft, foot, sole, lugs, laces]


def torso():
    shirt = TORSO.loft('Shirt', 'Fabric', 0.79, 1.455, 26, 32, cap0=True, cap1=False, noise=0.006,
                       cap_bulge=(0.01, 0))
    neck = loft('Gaiter', [
        {'c': (0, 0.012, 1.425), 'rx': 0.072, 'rf': 0.064, 'rb': 0.068},
        {'c': (0, 0.008, 1.455), 'rx': 0.063, 'rf': 0.060, 'rb': 0.064, 'noise': 0.05},
        {'c': (0, 0.002, 1.48), 'rx': 0.061, 'rf': 0.064, 'rb': 0.060, 'noise': 0.04},
        {'c': (0, -0.006, 1.505), 'rx': 0.064, 'rf': 0.076, 'rb': 0.060},
    ], 'Fabric', segs=18, cap0=False, cap1=False, noise=0.02)
    return [shirt, neck]


def body():
    materials()
    parts = torso()
    arm = arm_left()
    leg = leg_left()
    left = arm + leg
    right = [mirror_x(o, o.name.replace('_L', '_R')) for o in left]
    return parts + left + right

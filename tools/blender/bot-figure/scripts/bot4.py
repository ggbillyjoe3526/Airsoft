# --- v3.4: the glove rebuilt as one smooth cage (cuff, palm, four fingers and the thumb), subdivided once ---
# A hand modelled the way artists box-model one: a simple low cage whose fingers and thumb are pulled out of the
# palm's faces, then smoothed. Everything shares one surface, so the webs between the fingers and the thumb's root
# come out naturally rounded instead of being stitched tubes.
if not getattr(arm_left, 'v4', False):
    _arm_left_v3 = arm_left

GLOVE_CAGE_SHRINK = 1.12     # a once-subdivided cage settles inside its points; grow the cage to keep sizes true


def _hand_frame():
    u, f = arm_dirs()
    elbow, wrist = arm_points()
    base = wrist + f * 0.010
    L = f.normalized()
    N = (Vector((-1, 0, 0)) - L * L.dot(Vector((-1, 0, 0)))).normalized()   # palm side
    W = N.cross(L).normalized()                                             # thumb side
    if W.y > 0:
        W = -W
    return base, L, W, N


def glove_left():
    base, L, W, N = _hand_frame()
    K = GLOVE_CAGE_SHRINK

    def P(l, w, n):
        return base + L * l + W * w + N * n

    verts = []
    faces = []

    def add(p):
        verts.append(Vector(p))
        return len(verts) - 1

    # ring order (10 points): back of the hand from the thumb side across to the little-finger side, then the palm
    # from the little-finger side back to the thumb side
    def ellipse_ring(l, rw, rb, rp, dn=0.0):
        ang = [15, 52, 90, 128, 165, 195, 232, 270, 308, 345]
        out = []
        for a in ang:
            c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
            n = -s * rb if s > 0 else -s * rp
            out.append(add(P(l, c * rw * K, n * K + dn)))
        return out

    def palm_ring(l, ws, back, palm, crown, cup, dn=0.0):
        # ws: the five column edges across the hand (thumb side first); back/palm: half thickness; crown lifts the
        # middle of the back of the hand, cup sinks the middle of the palm
        out = []
        hw = max(abs(w) for w in ws)
        for j, w in enumerate(ws):
            t = 1.0 - (w / hw) ** 2
            edge = 0.62 if j in (0, 4) else 1.0
            out.append(add(P(l, w * K, (-(back * edge) - crown * t) * K + dn)))
        for j, w in reversed(list(enumerate(ws))):
            t = 1.0 - (w / hw) ** 2
            edge = 0.62 if j in (0, 4) else 1.0
            out.append(add(P(l, w * K, ((palm * edge) - cup * t) * K + dn)))
        return out

    rings = [
        ellipse_ring(-0.086, 0.0372, 0.0360, 0.0360),       # cuff lip
        ellipse_ring(-0.088, 0.0392, 0.0382, 0.0382),       # cuff edge
        ellipse_ring(-0.081, 0.0410, 0.0402, 0.0402),       # rolled cuff
        ellipse_ring(-0.034, 0.0340, 0.0295, 0.0300, 0.001),
        ellipse_ring(-0.012, 0.0300, 0.0215, 0.0215, 0.002),                                    # wrist
        palm_ring(0.010, [0.036, 0.018, 0.0, -0.018, -0.034], 0.0150, 0.0175, 0.0020, 0.0, 0.002),  # heel of the hand
        palm_ring(0.046, [0.045, 0.0225, 0.0, -0.0225, -0.043], 0.0135, 0.0160, 0.0030, 0.0030, 0.002),
        palm_ring(0.080, [0.0465, 0.023, 0.0, -0.022, -0.042], 0.0120, 0.0120, 0.0025, 0.0, 0.002),  # knuckles
    ]
    thumb_quad = None
    for a, b in zip(rings, rings[1:]):
        for i in range(10):
            j = (i + 1) % 10
            q = [a[i], a[j], b[j], b[i]]
            if a is rings[5] and i == 9:
                thumb_quad = q          # the thumb side between the heel and the middle of the palm
                continue
            faces.append(q)

    def pull(quad, path, sizes, e1, e2, cap=True):
        """Grow a digit out of a cage face: one square ring per path point, matched to the face's corners."""
        c0 = sum((verts[i] for i in quad), Vector()) / 4
        signs = [(1 if (verts[i] - c0).dot(e1) > 0 else -1, 1 if (verts[i] - c0).dot(e2) > 0 else -1) for i in quad]
        prev = quad
        d0 = (path[0] - c0).normalized()
        for k, (p, (a, b_back, b_palm)) in enumerate(zip(path, sizes)):
            d = ((path[k + 1] - p) if k + 1 < len(path) else (p - path[k - 1])).normalized()
            rot = d0.rotation_difference(d)
            u1, u2 = rot @ e1, rot @ e2
            ring = [add(p + u1 * (s1 * a * K) + u2 * (s2 * (b_palm if s2 > 0 else b_back) * K)) for s1, s2 in signs]
            for i in range(4):
                j = (i + 1) % 4
                faces.append([prev[i], prev[j], ring[j], ring[i]])
            prev = ring
        if cap:
            faces.append(list(prev))

    # fingers, index to little finger, out of the four faces across the knuckles
    kr = rings[7]
    sgn = 1.0 if (Matrix.Rotation(0.1, 3, W) @ L).dot(N) > 0 else -1.0
    fingers = [(0.077, 0.0120, 3.0), (0.086, 0.0122, 0.0), (0.081, 0.0116, -2.5), (0.064, 0.0104, -6.0)]
    for k, (ln, r, splay) in enumerate(fingers):
        quad = [kr[k], kr[k + 1], kr[8 - k], kr[9 - k]]
        c0 = sum((verts[i] for i in quad), Vector()) / 4
        d = (Matrix.Rotation(math.radians(splay), 3, N) @ L).normalized()
        seg = [ln * 0.45, ln * 0.30, ln * 0.25]
        curl = [math.radians(12 + k * 3), math.radians(26 + k * 3), math.radians(18)]
        joints = [c0]
        for s, cv in zip(seg, curl):
            d = (Matrix.Rotation(sgn * cv, 3, W) @ d).normalized()
            joints.append(joints[-1] + d * s)
        globals().setdefault('_finger_joints', {})[k] = list(joints)     # the skeleton's finger bones follow these

        def at(seg_i, t):
            return joints[seg_i].lerp(joints[seg_i + 1], t)

        path = [at(0, 0.10), at(0, 0.55), at(0, 0.98), at(1, 0.98), at(2, 0.55), at(2, 0.93)]
        sizes = [(r * 1.06, r * 1.12, r * 1.00),     # knuckle, its bump standing on the back of the hand
                 (r * 0.93, r * 0.86, r * 0.98),
                 (r * 0.96, r * 0.95, r * 0.92),     # middle joint, a slight knuckle
                 (r * 0.82, r * 0.76, r * 0.82),     # end joint
                 (r * 0.76, r * 0.68, r * 0.80),     # finger pad
                 (r * 0.50, r * 0.44, r * 0.52)]     # tip
        if k == 3:                                   # the short little finger needs one ring fewer
            del path[1], sizes[1]
        pull(quad, path, sizes, W, N)

    # the thumb, out of the side of the palm next to the heel of the hand, resting in front of the index finger
    c0 = sum((verts[i] for i in thumb_quad), Vector()) / 4
    td = [(L * 0.76 + W * 0.40 + N * 0.46).normalized(),
          (L * 0.90 + W * 0.02 + N * 0.36).normalized(),
          (L * 0.92 - W * 0.16 + N * 0.30).normalized()]
    tl = [0.023, 0.022, 0.019]
    j = [c0]
    for dd, s in zip(td, tl):
        j.append(j[-1] + dd * s)
    path = [j[0].lerp(j[1], 0.35), j[1], j[2], j[2].lerp(j[3], 0.50), j[2].lerp(j[3], 0.86), j[2].lerp(j[3], 0.99)]
    sizes = [(0.0190, 0.0138, 0.0148),     # the mound at the root of the thumb
             (0.0122, 0.0106, 0.0114),     # first joint
             (0.0110, 0.0096, 0.0104),     # second joint
             (0.0104, 0.0090, 0.0102),     # pad
             (0.0090, 0.0078, 0.0090),     # rounding into the tip
             (0.0048, 0.0042, 0.0048)]     # tip
    e2 = (N - L * L.dot(N)).normalized()
    globals()['_thumb_tip'] = j[3]
    globals()['_thumb_joints'] = list(j)
    pull(thumb_quad, path, sizes, L, e2)

    cage = make('Glove_L', verts, faces, 'Gear', smooth=True, angle=180)
    globals()['_glove_cage'] = (list(verts), list(faces))
    mod = cage.modifiers.new('sub', 'SUBSURF')
    mod.levels = 1
    mod.render_levels = 1
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(cage.evaluated_get(dg))
    old = cage.data
    cage.modifiers.clear()
    cage.data = me
    bpy.data.meshes.remove(old)
    me.name = 'Glove_L'
    me.shade_smooth()

    strap = tube('CuffStrap_L', [{'c': P(-0.056, 0, 0), 'rx': 0.0405, 'rs': 0.0412, 'rf': 0.0382, 'rb': 0.0390},
                                 {'c': P(-0.043, 0, 0.0005), 'rx': 0.0378, 'rs': 0.0384, 'rf': 0.0345, 'rb': 0.0352}],
                 'Hard', segs=14, n=2, hint=N, cap0=0.0, cap1=0.0, cap_rings=1, angle=60)
    return [cage, strap]


def arm_left():
    parts = []
    for o in _arm_left_v3():
        if o.name.startswith('Thumb_L'):
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            parts.append(o)
    return parts


arm_left.v3 = True
arm_left.v4 = True

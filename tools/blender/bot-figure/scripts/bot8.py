# --- v4 robot: a believable machine on the same skeleton (same joints), wearing the same plate carrier and belt ---
# Hard shell panels over dark rubber joints, chrome pins and pistons, cables across the elbows and knees, team panels
# on the limbs (TeamPaint) and a sensor head. The chassis stays inside the human figure's clothing, so Kit, Kit_Pack and
# Kit_Radio from the human build fit it unchanged.
RT = None                   # the torso profile without cloth folds, set by robot_body()


def robot_materials():
    mat('Shell', 0xd2d6db, rough=0.42)
    mat('Joint', 0x1d1f23, rough=0.78)
    mat('Chrome', 0xc9cdd3, rough=0.2, metal=1.0)
    mat('TeamPaint', 0x3d8bff, rough=0.45)                 # painted team panels (the carrier stays TeamColour)
    g = mat('TeamGlow', 0x3d8bff, rough=0.3)
    b = g.node_tree.nodes.get('Principled BSDF')
    for k, v in (('Emission Color', (*srgb(0x3d8bff), 1)), ('Emission Strength', 3.0)):
        if k in b.inputs:
            b.inputs[k].default_value = v


def ball(name, c, r, material, segs=12, rings=8):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(c))
    return finish(bm, name, material, True, 80)


def ploft(name, prof, zs, off, segs, material, pole0=None, pole1=None, scale=1.0, angle=60):
    """Rings of a profile at the given heights, offset from its surface, joined into one skin."""
    rows, cents = [], []
    for z in zs:
        o = off(z) if callable(off) else off
        c = Vector((0, prof.at(z)[1], z))
        row = []
        for j in range(segs):
            p = prof.point(z, TAU * j / segs, o)
            row.append(c + (p - c) * scale)
        rows.append(row)
        cents.append(c)
    return skin(name, rows, material, cents, pole0, pole1, angle)


def _plate(name, centre, normal, along, size, material, corner=0.008, onto=None, gap=0.0008):
    """A rounded plate lying on a part: normal out of the part, along its long side. Given the parts it lies on, it
    is bent over them (each point dropped onto their surface, keeping the plate's thickness)."""
    n = Vector(normal).normalized()
    z = (Vector(along) - n * n.dot(Vector(along))).normalized()
    x = z.cross(n).normalized()
    o = guard_plate(name, centre, size, material, basis=(x, n, z), corner=corner)
    if onto:
        tree = bvh(onto)
        c = Vector(centre)
        for v in o.data.vertices:
            h = (v.co - c).dot(n) + size[1] / 2
            loc, nn, i, d = tree.ray_cast(v.co + n * 0.06, -n, 0.2)
            if loc is not None:
                v.co = loc + n * (gap + h)
        o.data.update()
    return o


def _piston(name, a, b, r=0.008):
    a, b = Vector(a), Vector(b)
    m = a.lerp(b, 0.55)
    return [cyl(name + 'Rod', a.lerp(b, 0.35), b, r, 'Chrome', segs=8),
            cyl(name + 'Sleeve', a, m, r * 1.7, 'Joint', segs=8)]


def robot_torso():
    p = []
    chest_z = [1.060, 1.072, 1.100, 1.13, 1.17, 1.21, 1.26, 1.30, 1.335, 1.36, 1.38, 1.40, 1.418, 1.434]
    p.append(ploft('ChestShell', RT, chest_z, -0.004, 28, 'Shell', pole1=Vector((0, 0.012, 1.452))))
    # the chest's seam: a dark groove line round the shell under the collar bone, and a sternum ridge
    p.append(panel('ChestSeam', RT, 1.392, 1.398, 0.0, TAU, -0.004, 0.0015, 1, 28, 'Joint', inset=0.0, wrap=True,
                   inner=False))
    p.append(panel('Sternum', RT, 1.30, 1.43, FRONT - 0.16, FRONT + 0.16, -0.003, 0.006, 3, 3, 'Shell', inset=0.4,
                   inner=False))
    bel = [0.990, 1.005, 1.020, 1.035, 1.050, 1.065, 1.080, 1.095, 1.112]
    p.append(ploft('Bellows', RT, bel, lambda z: -0.026 if round((z - 0.990) / 0.015) % 2 else -0.012, 24, 'Joint',
                   angle=30))
    pel = [0.822, 0.840, 0.860, 0.885, 0.910, 0.935, 0.960, 0.985, 1.000]
    p.append(ploft('Pelvis', RT, pel, -0.007, 28, 'Shell', pole0=Vector((0, 0.005, 0.808))))
    p.append(panel('PelvisPanel', RT, 0.885, 0.955, FRONT - 0.32, FRONT + 0.32, -0.004, 0.006, 2, 4, 'TeamPaint',
                   inset=0.5, inner=False))
    # the neck: a rubber column with rings, two chrome rods at the front and a collar where it meets the chest
    p.append(cyl('Neck', (0, 0.010, 1.430), (0, 0.004, 1.515), 0.034, 'Joint', segs=12))
    for i, z in enumerate((1.462, 1.480, 1.498)):
        p.append(cyl('NeckRing%d' % i, (0, 0.008, z - 0.004), (0, 0.007, z + 0.004), 0.043, 'Joint', segs=14))
    for sx in (1, -1):
        p.append(cyl('NeckRod%d' % (sx > 0), (sx * 0.024, -0.024, 1.440), (sx * 0.022, -0.030, 1.505), 0.0045,
                     'Chrome', segs=6))
    p.append(tube('Collar', [{'c': (0, 0.012, 1.436), 'rx': 0.060, 'rf': 0.056, 'rb': 0.062},
                             {'c': (0, 0.012, 1.452), 'rx': 0.050, 'rf': 0.047, 'rb': 0.052}], 'Joint', segs=20, n=2,
                  cap0=0.0, cap1=0.0, cap_rings=1, angle=50))
    return p


def robot_leg_left():
    th = (KNEE - HIP).normalized()
    sh = (ANKLE - KNEE).normalized()
    X = Vector((1, 0, 0))
    p = [ball('HipBall_L', HIP, 0.060, 'Joint')]
    p.append(tube('Thigh_L', [
        {'c': HIP + th * 0.035, 'rx': 0.066, 'rf': 0.076, 'rb': 0.078, 'rs': 0.076, 'e': 2.5},
        {'c': HIP + th * 0.12, 'rx': 0.064, 'rf': 0.073, 'rb': 0.075, 'rs': 0.072, 'e': 2.5},
        {'c': HIP + th * 0.22, 'rx': 0.057, 'rf': 0.066, 'rb': 0.066, 'rs': 0.064, 'e': 2.5},
        {'c': HIP + th * 0.31, 'rx': 0.051, 'rf': 0.059, 'rb': 0.057, 'rs': 0.056, 'e': 2.4},
        {'c': KNEE - th * 0.062, 'rx': 0.046, 'rf': 0.053, 'rb': 0.049, 'rs': 0.049, 'e': 2.3},
    ], 'Shell', segs=16, n=8, cap0=0.016, cap1=0.010, cap_rings=2, angle=45))
    p.append(_plate('ThighPanel_L', HIP + th * 0.17 + Vector((0.004, -0.071, 0)), (0, -1, 0.15), -th,
                    (0.058, 0.007, 0.13), 'TeamPaint', onto=[p[1]]))
    p += _piston('ThighPiston_L', HIP + th * 0.08 + X * 0.083, KNEE - th * 0.07 + X * 0.058)
    p.append(cyl('KneeHinge_L', KNEE - X * 0.052, KNEE + X * 0.052, 0.043, 'Joint', segs=14))
    p.append(cyl('KneePin_L', KNEE - X * 0.060, KNEE + X * 0.060, 0.015, 'Chrome', segs=8))
    p.append(_plate('KneePlate_L', KNEE + Vector((0, -0.052, 0.004)), (0, -1, 0), (0, 0, 1), (0.078, 0.012, 0.096),
                    'TeamPaint', corner=0.014))
    shin = tube('Shin_L', [
        {'c': KNEE + sh * 0.055, 'rx': 0.047, 'rf': 0.049, 'rb': 0.055, 'rs': 0.049, 'e': 2.4},
        {'c': KNEE + sh * 0.13, 'rx': 0.051, 'rf': 0.050, 'rb': 0.064, 'rs': 0.054, 'e': 2.4},
        {'c': KNEE + sh * 0.22, 'rx': 0.048, 'rf': 0.048, 'rb': 0.058, 'rs': 0.050, 'e': 2.4},
        {'c': KNEE + sh * 0.30, 'rx': 0.042, 'rf': 0.044, 'rb': 0.047, 'rs': 0.044, 'e': 2.3},
        {'c': ANKLE - sh * 0.040, 'rx': 0.038, 'rf': 0.040, 'rb': 0.041, 'rs': 0.040, 'e': 2.3},
        {'c': ANKLE - sh * 0.004, 'rx': 0.036, 'rf': 0.038, 'rb': 0.038, 'rs': 0.038, 'e': 2.3},
    ], 'Shell', segs=16, n=9, cap0=0.010, cap1=0.006, cap_rings=2, angle=45)
    p.append(shin)
    p.append(_plate('ShinPanel_L', KNEE + sh * 0.17 + Vector((0, -0.050, 0)), (0, -1, 0), -sh, (0.044, 0.006, 0.12),
                    'Shell', corner=0.010, onto=[shin]))
    p += _piston('CalfPiston_L', KNEE + Vector((0, 0.080, -0.075)), ANKLE + Vector((0, 0.052, 0.090)), r=0.007)
    p.append(cyl('Ankle_L', ANKLE - X * 0.040, ANKLE + X * 0.040, 0.030, 'Joint', segs=12))
    x, y0 = ANKLE.x, ANKLE.y
    # the foot: a shell that rises to an ankle yoke, a hinged toe plate and a dark tread under both
    p.append(tube('Foot_L', [
        {'c': (x, y0 + 0.058, 0.050), 'rx': 0.034, 'rs': 0.036, 'rf': 0.026, 'rb': 0.026, 'e': 3.0},
        {'c': (x, y0 + 0.030, 0.058), 'rx': 0.043, 'rs': 0.045, 'rf': 0.040, 'rb': 0.036, 'e': 3.0},
        {'c': (x + 0.002, y0 - 0.020, 0.056), 'rx': 0.045, 'rs': 0.047, 'rf': 0.040, 'rb': 0.034, 'e': 3.0},
        {'c': (x + 0.004, y0 - 0.070, 0.044), 'rx': 0.047, 'rs': 0.049, 'rf': 0.026, 'rb': 0.024, 'e': 3.0},
        {'c': (x + 0.006, y0 - 0.118, 0.034), 'rx': 0.046, 'rs': 0.047, 'rf': 0.016, 'rb': 0.016, 'e': 3.0},
    ], 'Shell', segs=16, n=8, hint=(0, 0, 1), cap0=0.012, cap1=0.006, cap_rings=2, angle=40))
    p.append(cyl('ToeHinge_L', (x - 0.044, y0 - 0.132, 0.024), (x + 0.056, y0 - 0.132, 0.024), 0.011, 'Joint', segs=8))
    p.append(rbox('Toe_L', (x + 0.008, y0 - 0.172, 0.026), (0.090, 0.066, 0.032), 'Shell', bevel=0.009, segs=1,
                  taper=(0.94, 0.70)))
    for sx in (1, -1):
        p.append(rbox('AnkleYoke%d_L' % (sx > 0), (x + sx * 0.047, y0 + 0.006, 0.080), (0.016, 0.066, 0.064),
                      'Shell', bevel=0.006, segs=1, taper=(1.0, 0.72)))
    p.append(rbox('Tread_L', (x + 0.004, y0 - 0.064, 0.008), (0.096, 0.278, 0.016), 'Joint', bevel=0.005, segs=1))
    p.append(tube('LegCable_L', [{'c': HIP + Vector((0.02, 0.070, 0.050)), 'rx': 0.0065},
                                 {'c': HIP + th * 0.20 + Vector((0.01, 0.084, 0)), 'rx': 0.0065},
                                 {'c': KNEE + Vector((0.025, 0.062, 0.045)), 'rx': 0.0065},
                                 {'c': KNEE + Vector((0.026, 0.058, -0.050)), 'rx': 0.0065},
                                 {'c': KNEE + Vector((0.020, 0.040, -0.080)), 'rx': 0.0065}],
                  'Joint', segs=6, n=12, cap0=0.0, cap1=0.0, cap_rings=1, angle=60))
    return p


def _finger_from(prefix, js, W, N, r, first=0):
    """Hard segments between the given joints (the human glove's finger joints, so both figures share one
    skeleton), with dark joint discs at each joint."""
    parts = []
    for i in range(len(js) - 1):
        d = (js[i + 1] - js[i])
        ln = d.length
        d = d.normalized()
        w_ax = (W - d * d.dot(W)).normalized()
        n = w_ax.cross(d).normalized()
        if n.dot(N) < 0:
            n = -n
        w = r * (1.0 - 0.10 * (i + first))
        parts.append(rbox('%sSeg%d' % (prefix, i), js[i].lerp(js[i + 1], 0.52), (2 * w, 1.8 * w, ln * 0.86), 'Shell',
                          bevel=min(0.004, w * 0.45), segs=1, basis=(w_ax, n, d),
                          taper=(0.92, 0.9) if i == len(js) - 2 else None))
        parts.append(cyl('%sKnuckle%d' % (prefix, i), js[i] - w_ax * w * 0.92, js[i] + w_ax * w * 0.92, w * 0.78,
                         'Joint', segs=8))
    return parts


def robot_hand_left():
    base, L, W, N = _hand_frame()

    def P(l, w, n):
        return base + L * l + W * w + N * n

    p = [rbox('Palm_L', P(0.044, 0.002, 0.002), (0.084, 0.030, 0.080), 'Shell', bevel=0.008, segs=2, basis=(W, N, L))]
    p.append(_plate('HandPlate_L', P(0.042, 0.000, -0.0165), -N, L, (0.060, 0.006, 0.056), 'TeamPaint',
                    onto=[p[0]]))
    p.append(cyl('KnuckleBar_L', P(0.082, 0.042, -0.002), P(0.082, -0.040, -0.002), 0.011, 'Joint', segs=8))
    for k, r in enumerate((0.0105, 0.0108, 0.0103, 0.0094)):
        p += _finger_from('Finger%d_L' % k, _finger_joints[k], W, N, r)
    tj = _thumb_joints
    td = (tj[1] - tj[0]).normalized()
    tw = (td.cross(N)).normalized()
    p.append(rbox('ThumbBase_L', tj[0].lerp(tj[1], 0.5), (0.024, 0.020, (tj[1] - tj[0]).length + 0.010), 'Shell',
                  bevel=0.006, segs=1, basis=(tw, td.cross(tw).normalized(), td)))
    p += _finger_from('Thumb_L', tj[1:], tw, N, 0.0105, first=1)
    p.append(cyl('Wrist_L', base - L * 0.022, base + L * 0.006, 0.029, 'Joint', segs=12))
    return p


def robot_arm_left():
    u, f = arm_dirs()
    elbow, wrist = arm_points()
    S0 = SHOULDER
    Y = Vector((0, 1, 0))
    p = [ball('ShoulderBall_L', S0, 0.054, 'Joint')]
    p.append(tube('Pauldron_L', [
        {'c': S0 - u * 0.052, 'rx': 0.034, 'rf': 0.040, 'rb': 0.042, 'rs': 0.046, 'e': 2.6},
        {'c': S0 - u * 0.030, 'rx': 0.050, 'rf': 0.062, 'rb': 0.064, 'rs': 0.070, 'e': 2.6},
        {'c': S0 + u * 0.012, 'rx': 0.054, 'rf': 0.070, 'rb': 0.072, 'rs': 0.078, 'e': 2.6},
        {'c': S0 + u * 0.062, 'rx': 0.052, 'rf': 0.064, 'rb': 0.066, 'rs': 0.072, 'e': 2.6},
    ], 'Shell', segs=16, n=6, cap0=0.010, cap1=0.0, cap_rings=2, angle=40))
    p.append(tube('PauldronTrim_L', [{'c': S0 + u * 0.058, 'rx': 0.054, 'rf': 0.066, 'rb': 0.068, 'rs': 0.074,
                                      'e': 2.6},
                                     {'c': S0 + u * 0.070, 'rx': 0.052, 'rf': 0.063, 'rb': 0.065, 'rs': 0.071,
                                      'e': 2.6}],
                  'TeamPaint', segs=16, n=2, cap0=0.0, cap1=0.0, cap_rings=1, angle=40))
    p.append(tube('UpperArm_L', [
        {'c': S0 + u * 0.060, 'rx': 0.046, 'rf': 0.048, 'rb': 0.050, 'rs': 0.050, 'e': 2.4},
        {'c': S0 + u * 0.130, 'rx': 0.046, 'rf': 0.048, 'rb': 0.048, 'rs': 0.050, 'e': 2.4},
        {'c': S0 + u * 0.200, 'rx': 0.042, 'rf': 0.044, 'rb': 0.044, 'rs': 0.045, 'e': 2.4},
        {'c': elbow - u * 0.042, 'rx': 0.038, 'rf': 0.040, 'rb': 0.040, 'rs': 0.041, 'e': 2.3},
    ], 'Shell', segs=14, n=6, cap0=0.008, cap1=0.008, cap_rings=1, angle=45))
    ax = u.cross(f).normalized()
    outer = u.cross(Vector((0, -1, 0))).normalized()          # away from the body, round the upper arm
    if outer.x < 0:
        outer = -outer
    p.append(_plate('ArmPanel_L', S0 + u * 0.15 + outer * 0.046, outer, -u, (0.046, 0.007, 0.10), 'TeamPaint',
                    onto=[p[3]]))
    p.append(cyl('ElbowHinge_L', elbow - ax * 0.040, elbow + ax * 0.040, 0.038, 'Joint', segs=14))
    p.append(cyl('ElbowPin_L', elbow - ax * 0.048, elbow + ax * 0.048, 0.013, 'Chrome', segs=8))
    p.append(tube('Forearm_L', [
        {'c': elbow + f * 0.045, 'rx': 0.043, 'rf': 0.045, 'rb': 0.047, 'rs': 0.047, 'e': 2.4},
        {'c': elbow + f * 0.100, 'rx': 0.044, 'rf': 0.044, 'rb': 0.044, 'rs': 0.046, 'e': 2.4},
        {'c': elbow + f * 0.170, 'rx': 0.038, 'rf': 0.038, 'rb': 0.038, 'rs': 0.039, 'e': 2.4},
        {'c': wrist - f * 0.030, 'rx': 0.033, 'rf': 0.032, 'rb': 0.032, 'rs': 0.033, 'e': 2.3},
    ], 'Shell', segs=14, n=6, cap0=0.008, cap1=0.006, cap_rings=1, angle=45))
    back = (Y - f * f.dot(Y)).normalized()
    fout = f.cross(Vector((0, -1, 0))).normalized()
    if fout.x < 0:
        fout = -fout
    p.append(_plate('ForearmPanel_L', elbow + f * 0.11 + fout * 0.043, fout, -f, (0.040, 0.006, 0.09), 'TeamPaint',
                    onto=[p[-1]]))
    p += _piston('ForearmPiston_L', elbow + f * 0.05 + back * 0.050, wrist - f * 0.06 + back * 0.036, r=0.0065)
    bu = (Y - u * u.dot(Y)).normalized()
    p.append(tube('ArmCable_L', [{'c': S0 + u * 0.09 + bu * 0.044, 'rx': 0.0055},
                                 {'c': S0 + u * 0.17 + bu * 0.048, 'rx': 0.0055},
                                 {'c': elbow - u * 0.03 + bu * 0.043, 'rx': 0.0055},
                                 {'c': elbow + back * 0.050, 'rx': 0.0055},
                                 {'c': elbow + f * 0.06 + back * 0.048, 'rx': 0.0055},
                                 {'c': elbow + f * 0.09 + back * 0.036, 'rx': 0.0055}],
                  'Joint', segs=6, n=12, cap0=0.0, cap1=0.0, cap_rings=1, angle=60))
    return p + robot_hand_left()


def robot_body():
    global RT
    RT = TORSO.view(0.0)
    robot_materials()
    parts = robot_torso()
    left = robot_arm_left() + robot_leg_left()
    right = [mirror_x(o, o.name.replace('_L', '_R')) for o in left]
    return parts + left + right


# --- robot heads, in the human head's space (scaled with it), each at most 2,000 triangles ---
SKULL = Profile2([
    (1.488, 0.010, 0.050, 0.058, 0.058, 2.4),
    (1.505, 0.010, 0.062, 0.072, 0.074, 2.6),
    (1.535, 0.010, 0.074, 0.086, 0.088, 2.7),
    (1.580, 0.010, 0.080, 0.092, 0.096, 2.7),
    (1.630, 0.010, 0.080, 0.092, 0.098, 2.7),
    (1.668, 0.010, 0.074, 0.084, 0.092, 2.6),
    (1.692, 0.010, 0.060, 0.068, 0.076, 2.4),
    (1.704, 0.010, 0.040, 0.046, 0.050, 2.2),
    (1.709, 0.010, 0.018, 0.020, 0.022, 2.0),
])
SKULL_Z = [1.488, 1.497, 1.510, 1.528, 1.550, 1.575, 1.600, 1.625, 1.648, 1.668, 1.684, 1.696, 1.704, 1.709]


def robot_head_sensor():
    """Today's sensor head: a rounded skull with a brow, a dark face plate with vents, a visor band with the team's
    light line, ear pods with team discs, a crest stripe over the crown and an antenna with a glowing tip."""
    G = SKULL
    p = [ploft('Skull', G, SKULL_Z, 0.0, 24, 'Shell', pole1=Vector((0, 0.010, 1.711)), angle=50)]
    p.append(panel('Visor', G, 1.584, 1.634, FRONT - 1.18, FRONT + 1.18, 0.002, 0.010, 2, 16, 'Lens', inset=0.3,
                   bulge=0.003, inner=False))
    p.append(panel('LightLine', G, 1.605, 1.612, FRONT - 1.0, FRONT + 1.0, 0.012, 0.0025, 1, 14, 'TeamGlow',
                   inset=0.0, inner=False))
    p.append(panel('Brow', G, 1.634, 1.652, FRONT - 1.08, FRONT + 1.08, 0.004, 0.012, 1, 14, 'Shell', inset=0.4,
                   inner=False))
    p.append(panel('FacePlate', G, 1.508, 1.578, FRONT - 0.72, FRONT + 0.72, 0.002, 0.012, 2, 8, 'Joint', inset=0.4,
                   bulge=0.004, inner=False))
    vents = []
    for i in range(4):
        z = 1.522 + i * 0.013
        vents.append(panel('Vent%d' % i, G, z - 0.002, z + 0.002, FRONT - 0.40, FRONT + 0.40, 0.014, 0.002, 1, 4,
                           'Hard', inset=0.0, inner=False))
    p.append(join('Vents', vents))
    for sx, nm in ((1, 'L'), (-1, 'R')):
        c = Vector((sx * 0.078, 0.014, 1.600))
        p.append(cyl('EarPod_' + nm, c, c + Vector((sx * 0.030, 0, 0)), 0.034, 'Joint', segs=14, r1=0.031))
        p.append(cyl('EarDisc_' + nm, c + Vector((sx * 0.029, 0, 0)), c + Vector((sx * 0.036, 0, 0)), 0.025,
                     'TeamPaint', segs=14))
    crest = [G.point(1.650, FRONT, 0.002), G.point(1.690, FRONT, 0.002), Vector((0, 0.010, 1.713)),
             G.point(1.690, BACK, 0.002), G.point(1.640, BACK, 0.002)]
    p.append(tube('Crest', [{'c': q, 'rx': 0.004, 'rs': 0.004, 'rf': 0.022, 'rb': 0.022} for q in crest], 'TeamPaint',
                  segs=8, n=10, hint=(1, 0, 0), cap0=0.0, cap1=0.0, cap_rings=1, angle=50))
    a0 = Vector((-0.084, 0.040, 1.630))
    a1 = Vector((-0.100, 0.066, 1.736))          # short enough that the head stays near the hit volume's height
    p.append(cyl('AntennaBase', a0 - Vector((-0.010, 0, 0)), a0 + Vector((-0.010, 0, 0)), 0.012, 'Joint', segs=8))
    p.append(cyl('Antenna', a0, a1, 0.0035, 'Hard', segs=6, r1=0.0025))
    p.append(ball('AntennaTip', a1, 0.007, 'TeamGlow', segs=8, rings=6))
    p.append(cyl('NeckSocket', (0, 0.010, 1.470), (0, 0.010, 1.492), 0.046, 'Joint', segs=16, r1=0.050))
    return p


def robot_head_optic():
    """A second design: a squarer camera head with one big round lens ringed by the team's glow, two small side
    sensors, a jaw grille, side sensor pods, a team roll bar over the crown and cooling fins at the back."""
    G = Profile2([(z, cy, rx * 0.96, rf * 0.94, rb, min(e + 0.6, 3.4)) for z, cy, rx, rf, rb, e in SKULL.r])
    p = [ploft('Skull', G, SKULL_Z, 0.0, 24, 'Shell', pole1=Vector((0, 0.010, 1.711)), angle=40)]
    t, n, up = surface_basis(G, 1.598, FRONT)
    c = G.point(1.598, FRONT, 0.0)
    p.append(cyl('EyeHousing', c - n * 0.010, c + n * 0.026, 0.041, 'Joint', segs=16, r1=0.039))
    p.append(cyl('EyeRing', c + n * 0.024, c + n * 0.029, 0.035, 'TeamGlow', segs=16))
    p.append(ball('Eye', c + n * 0.022, 0.029, 'Lens', segs=12, rings=6))
    for sx in (1, -1):
        q = G.point(1.556, FRONT + sx * 0.62, 0.0)
        t2, n2, _ = surface_basis(G, 1.556, FRONT + sx * 0.62)
        p.append(cyl('Sensor%d' % (sx > 0), q - n2 * 0.004, q + n2 * 0.010, 0.011, 'Joint', segs=10))
        p.append(ball('SensorLens%d' % (sx > 0), q + n2 * 0.009, 0.008, 'Lens', segs=8, rings=6))
    p.append(panel('Jaw', G, 1.498, 1.540, FRONT - 0.85, FRONT + 0.85, 0.002, 0.012, 2, 8, 'Joint', inset=0.4,
                   inner=False))
    bars = []
    for i in range(3):
        z = 1.507 + i * 0.012
        bars.append(panel('Grille%d' % i, G, z - 0.0018, z + 0.0018, FRONT - 0.55, FRONT + 0.55, 0.014, 0.002, 1, 6,
                          'Chrome', inset=0.0, inner=False))
    p.append(join('Grille', bars))
    for sx, nm in ((1, 'L'), (-1, 'R')):
        a = 0.0 if sx > 0 else math.pi
        t2, n2, up2 = surface_basis(G, 1.612, a)
        q = G.point(1.612, a, 0.0)
        p.append(rbox('Pod_' + nm, q + n2 * 0.012, (0.070, 0.030, 0.050), 'Shell', bevel=0.008, segs=1,
                      basis=(t2, n2, up2)))
        p.append(rbox('PodStripe_' + nm, q + n2 * 0.0275, (0.056, 0.004, 0.012), 'TeamPaint', bevel=0.0015, segs=1,
                      basis=(t2, n2, up2)))
    bar = [G.point(1.612, 0.0, 0.040), G.point(1.680, 0.0, 0.016), Vector((0, 0.020, 1.728)),
           G.point(1.680, math.pi, 0.016), G.point(1.612, math.pi, 0.040)]
    p.append(tube('RollBar', [{'c': q, 'rx': 0.0075} for q in bar], 'TeamPaint', segs=8, n=11, hint=(0, -1, 0),
                  cap0=0.0, cap1=0.0, cap_rings=1, angle=60))
    fins = []
    for i in range(5):
        a = BACK + (i - 2) * 0.17
        t2, n2, up2 = surface_basis(G, 1.598, a)
        fins.append(rbox('Fin%d' % i, G.point(1.598, a, 0.004), (0.006, 0.016, 0.060), 'Joint', bevel=0.0015, segs=1,
                         basis=(t2, n2, up2)))
    p.append(join('Fins', fins))
    p.append(cyl('NeckSocket', (0, 0.010, 1.470), (0, 0.010, 1.492), 0.046, 'Joint', segs=16, r1=0.050))
    return p


ROBOT_HEADS = (('Head_Sensor', robot_head_sensor), ('Head_Optic', robot_head_optic))


def finalise_robot():
    """The robot figure: the human build gives the kit and the scale; its body and heads are swapped for the
    robot's."""
    b, k, h = build_all()
    objs = b + k + h
    zs = [(o.matrix_world @ Vector(c)).z for o in objs for c in o.bound_box]
    lo, hi = min(zs), max(zs)
    s = FIGURE_HEIGHT / (hi - lo)
    m = Matrix.Scale(s, 4) @ Matrix.Translation((0, 0, -lo))
    hm = Matrix.Translation(HEAD_TOP) @ Matrix.Scale(HEAD_SCALE, 4) @ Matrix.Translation(-HEAD_TOP)
    for o in b + h:
        bpy.data.objects.remove(o, do_unlink=True)
    rb = robot_body()
    heads = []
    for name, fn in ROBOT_HEADS:
        ps = fn()
        for o in ps:
            o.data.transform(hm)
        heads.append((name, ps))
    for o in k + rb + [o for _, ps in heads for o in ps]:
        o.data.transform(m)
    kit_rest, groups = _split_kit(k)
    out = [join('Body', rb), join('Kit', kit_rest)] + [join(name, groups[name]) for name, _ in KIT_SPLIT]
    out += [join(name, ps) for name, ps in heads]
    for o in out:
        for q in bpy.context.selected_objects:
            q.select_set(False)
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
        bpy.ops.object.mode_set(mode='OBJECT')
    return out, s

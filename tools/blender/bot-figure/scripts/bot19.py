# --- v12 robot (William, 13 October 2026): redesigned from his reference pictures, then made over after his first
# review (more mechanical and boxy, flush shoulders, no plus marks, one head for all) ---------------------------------
# A boxy android soldier: a light grey synthetic suit with squared limbs under segmented armour (four grey chest plates
# over dark seams, a back plate with a flat power cell, hip plates, thigh, knee, elbow and ankle plates, pistons down
# the thighs and shins, dark forearm bracers, white boots with heel blocks), with the team on the shoulder caps, the
# belt, the thigh stripes, the knee plates and the hand plates (TeamPaint) and on its glows (TeamGlow: the chest
# screen's face, the visor line, the mouth). One head: the old sensor head made over, a squared skull with a
# wraparound visor and a headset with square headphones. No airsoft gear: no pouches, holsters, magazines or packs.
# Same skeleton, joints and hands as v11, so every clip and finger solve carries over. The greys share one material
# (Shell, Gloss on the head): each part's grey goes into the baked shade (the vertex colour the game multiplies in), so
# the figure keeps few draw calls.

TINT_ATTR = 'part_tint'
GREY = {'suit': 0xb2b7be, 'plate': 0x60656c, 'armour': 0x303338, 'white': 0xeceef1, 'hand': 0x6f747b,
        'black': 0x232529, 'face': 0xe3e6eb, 'mask': 0x9fadc0}


def tint(o, key):
    """Give a part its grey (multiplied into the baked shade by bake_shade below)."""
    c = srgb(GREY[key] if isinstance(key, str) else key)
    me = o.data
    a = me.attributes.get(TINT_ATTR) or me.attributes.new(TINT_ATTR, 'FLOAT_VECTOR', 'POINT')
    a.data.foreach_set('vector', list(c) * len(me.vertices))
    return o


if not getattr(bake_shade, 'v19', False):
    _bake_shade_v9 = bake_shade


def bake_shade(objs, occluders=(), samples=48, distance=0.12):
    """bot9's ambient occlusion, then each part's grey multiplied in (parts without one keep the shade as it is)."""
    _bake_shade_v9(objs, occluders, samples, distance)
    for o in objs:
        me = o.data
        ca = me.color_attributes
        if ca.get('Shade') is not None:            # the exporter writes the render colour: on pip's bpy 5.0 it is unset
            ca.render_color_index = ca.find('Shade')
        a = me.attributes.get(TINT_ATTR)
        if a is None:
            continue
        sh = me.color_attributes.get('Shade')
        tv = [0.0] * (3 * len(me.vertices))
        a.data.foreach_get('vector', tv)
        if sh is not None:
            for i, d in enumerate(sh.data):
                t = tv[3 * i:3 * i + 3]
                if t[0] + t[1] + t[2] > 0:
                    g = d.color
                    d.color = (g[0] * t[0], g[1] * t[1], g[2] * t[2], 1.0)
        me.attributes.remove(me.attributes[TINT_ATTR])


bake_shade.v19 = True


def _glow(name, hexcol, strength):
    g = mat(name, hexcol, rough=0.3)
    b = g.node_tree.nodes.get('Principled BSDF')
    for k, v in (('Emission Color', (*srgb(hexcol), 1)), ('Emission Strength', strength)):
        if k in b.inputs:
            b.inputs[k].default_value = v
    return g


def robot_materials():
    mat('Shell', 0xffffff, rough=0.42)                 # every grey part: its grey is in the vertex colour
    mat('Gloss', 0xffffff, rough=0.22)                 # helmets and faces
    mat('Joint', 0x1c1e22, rough=0.78)                 # rubber joints, ribs and soles
    mat('Visor', 0x06080b, rough=0.05, metal=0.7)      # visor and screen glass
    mat('TeamPaint', 0x3d8bff, rough=0.40)
    _glow('TeamGlow', 0x3d8bff, 3.0)
    _glow('Light', 0xc4f0ff, 4.0)                      # small status lights


# --- skin rules for the new parts (checked before bot10's; bot10's prefixes already cover Pauldron*, Thigh*,
# Shin*, Forearm*, Foot*, Toe*) ---
if not any(r[0][0] == 'ChestPlate' for r in RULES):
    RULES[:0] = [
        (('ChestPlate', 'ChestUnit', 'ChestScreen', 'ChestFace', 'BackPlate', 'BackUnit', 'BackTeam', 'BackLight',
          'ShoulderYoke'), ('rigid', 'Chest')),
        (('Waist',), ('blend', ['Hips', 'Spine', 'Spine1', 'Chest'])),
        (('BeltBand', 'BeltTeam'), ('rigid', 'Hips')),
        (('BootCuff',), ('rigid', 'Shin_S')),
    ]


def _strap(name, surf, x0, x1, th0, th1, lift, thick, material, nth=16, nx=3, cy=0.012, cz=1.33, across='x'):
    """A strap laid on a surface over the top of a part: each station found by a ray from outside towards the line
    through (0, cy, cz) along the strap's width, at an angle th (degrees, 0 straight up), lifted off the surface by
    lift, thick at its middle and thinner at its edges. across 'x': the strap is x0 to x1 wide and runs front to back
    (th -90 ahead, 90 behind); across 'y': it is cy + x0 to cy + x1 wide and runs side to side (th -90 on the right,
    90 on the left)."""
    tree = bvh(surf)
    go, gi = [], []
    for i in range(nth + 1):
        th = math.radians(th0 + (th1 - th0) * i / nth)
        d = Vector((0, math.sin(th), math.cos(th))) if across == 'x' else Vector((math.sin(th), 0, math.cos(th)))
        ro, ri = [], []
        for j in range(nx + 1):
            w = x0 + (x1 - x0) * j / nx
            o = Vector((w, cy, cz)) if across == 'x' else Vector((0, cy + w, cz))
            loc, n, _, _ = tree.ray_cast(o + d * 0.4, -d, 0.6)
            n = (n + d).normalized()
            edge = j in (0, nx) or i in (0, nth)
            ri.append(loc + n * lift)
            ro.append(loc + n * (lift + thick * (0.55 if edge else 1.0)))
        go.append(ro)
        gi.append(ri)
    return slab(name, go, gi, material, angle=50, inner=False)


def _bolts(name, pts, normal, material='Shell', r=0.0042, h=0.003, onto=None):
    """Hex bolt heads standing h out of a face (normal out of it) at the given points; given the part they sit on,
    each is dropped onto it."""
    n = Vector(normal).normalized()
    tree = bvh(onto) if onto else None
    out = []
    for i, q in enumerate(pts):
        q = Vector(q)
        if tree is not None:
            loc = tree.ray_cast(q + n * 0.05, -n, 0.1)[0]
            q = loc if loc is not None else q
        out.append(cyl('%s%d' % (name, i), q - n * 0.002, q + n * h, r, material, segs=6))
    return join(name, out)


def _slats(name, centre, along, up, normal, n, pitch, size, material):
    """n thin bars on a face, pitch apart up it (a vent or a grille): size (along, out, up)."""
    c0 = Vector(centre) - Vector(up) * (pitch * (n - 1) / 2) + Vector(normal) * (size[1] / 2)
    return join(name, [rbox('%s%d' % (name, i), c0 + Vector(up) * (pitch * i), size, material, bevel=0.0, segs=1,
                            basis=(Vector(along), Vector(normal), Vector(up))) for i in range(n)])


def robot_torso():
    p = []
    # the suit: the chest is rigid on the Chest bone; the ribbed band under the armour and the waist bend with the spine
    chest_z = [1.150, 1.170, 1.200, 1.240, 1.280, 1.320, 1.355, 1.380, 1.400, 1.418, 1.434]
    p.append(tint(ploft('ChestShell', RT, chest_z, -0.004, 28, 'Shell', pole1=Vector((0, 0.012, 1.452))), 'suit'))
    rib = [1.088 + 0.0095 * i for i in range(9)]
    p.append(ploft('Bellows', RT, rib, lambda z: -0.017 if round((z - 1.088) / 0.0095) % 2 else -0.005, 28, 'Joint',
                   angle=30))
    waist = [0.985, 1.005, 1.025, 1.045, 1.065, 1.092]
    p.append(tint(ploft('Waist', RT, waist, lambda z: -0.010 + 0.004 * abs(z - 1.035) / 0.06, 28, 'Shell'), 'suit'))
    pel = [0.822, 0.840, 0.860, 0.885, 0.910, 0.935, 0.960, 0.990]
    p.append(tint(ploft('Pelvis', RT, pel, -0.007, 28, 'Shell', pole0=Vector((0, 0.005, 0.808))), 'suit'))
    p.append(tint(panel('BeltBand', RT, 0.962, 0.990, 0.0, TAU, -0.008, 0.012, 1, 28, 'Shell', inset=0.3, wrap=True,
                        inner=False), 'armour'))
    p.append(panel('BeltTeam', RT, 0.967, 0.985, FRONT - 0.28, FRONT + 0.28, 0.004, 0.004, 1, 4, 'TeamPaint',
                   inset=0.3, inner=False))
    # hip armour: a squared plate on each hip and a guard over the front, below the belt
    for a0, nm in ((0.0, 'PelvisPlate_L'), (math.pi, 'PelvisPlate_R')):
        p.append(tint(panel(nm, RT, 0.874, 0.956, a0 - 0.40, a0 + 0.40, -0.006, 0.014, 2, 6, 'Shell', inset=0.55,
                            inner=False), 'plate'))
    p.append(tint(panel('PelvisGuard', RT, 0.858, 0.956, FRONT - 0.26, FRONT + 0.26, -0.006, 0.013, 2, 4, 'Shell',
                        inset=0.55, inner=False), 'plate'))

    # chest armour: four plates over the front (no wider than ±0.95 rad: a wider one pushes the left arm out in the
    # pistol reload, arms-check) on a dark layer that shows in the seams between them, and a plate over the back
    top_f = lambda a: 1.386 - 0.038 * math.exp(-((a - FRONT) / 0.40) ** 2)
    bot_f = lambda a: 1.160 + 0.012 * math.cos(a - FRONT)
    p.append(panel('ChestSeam', RT, lambda a: bot_f(a) + 0.004, lambda a: top_f(a) - 0.005, FRONT - 0.92, FRONT + 0.92,
                   0.0, 0.006, 1, 22, 'Joint', inset=0.2, inner=False))        # inside the plates' edges, not level
    mid = 1.270
    for nm, a0, a1 in (('L', FRONT - 0.95, FRONT - 0.04), ('R', FRONT + 0.04, FRONT + 0.95)):
        p.append(tint(panel('ChestPlateU' + nm, RT, mid + 0.005, top_f, a0, a1, 0.001, 0.016, 3, 11, 'Shell',
                            inset=0.55, inner=False), 'plate'))
        p.append(tint(panel('ChestPlateD' + nm, RT, bot_f, mid - 0.005, a0, a1, 0.001, 0.016, 2, 11, 'Shell',
                            inset=0.55, inner=False), 'plate'))
    bolts = []
    for s in (1, -1):
        for a, z in ((FRONT + s * 0.84, lambda a: top_f(a) - 0.016), (FRONT + s * 0.84, lambda a: mid + 0.017),
                     (FRONT + s * 0.84, lambda a: bot_f(a) + 0.026)):
            bolts.append((RT.point(z(a), a, 0.017), surface_basis(RT, z(a), a)[1]))
    p.append(tint(join('ChestPlateBolts', [_bolts('ChestPlateBolt%d' % i, [q], n) for i, (q, n) in enumerate(bolts)]),
                  'armour'))
    p.append(tint(panel('ChestPlateTrim', RT, bot_f, lambda a: bot_f(a) + 0.011, FRONT - 0.95, FRONT + 0.95, 0.0,
                        0.0175, 1, 22, 'Shell', inset=0.3, inner=False), 'armour'))
    top_b = lambda a: 1.400 - 0.028 * math.exp(-((a - BACK) / 0.40) ** 2)
    p.append(panel('BackPlateSeam', RT, 1.175, lambda a: top_b(a) - 0.005, BACK - 0.10, BACK + 0.10, 0.0, 0.006, 1, 4,
                   'Joint', inset=0.2, inner=False))
    for nm, a0, a1 in (('R', BACK - 1.15, BACK - 0.04), ('L', BACK + 0.04, BACK + 1.15)):
        p.append(tint(panel('BackPlate' + nm, RT, 1.170, top_b, a0, a1, 0.001, 0.015, 5, 9, 'Shell', inset=0.55,
                            inner=False), 'plate'))
    p.append(tint(panel('BackPlateTrim', RT, 1.170, 1.181, BACK - 1.15, BACK + 1.15, 0.0, 0.0175, 1, 18, 'Shell',
                        inset=0.3, inner=False), 'armour'))
    bolts = [(RT.point(z, a, 0.0165), surface_basis(RT, z, a)[1]) for a in (BACK - 0.98, BACK + 0.98)
             for z in (1.196, top_b(BACK + 0.98) - 0.020)]
    p.append(tint(join('BackPlateBolts', [_bolts('BackPlateBolt%d' % i, [q], n) for i, (q, n) in enumerate(bolts)]),
                  'armour'))
    # the chest unit: a dark box bolted on, with a screen (the team's glowing face on it), three status lights and a
    # vent
    zc = 1.255
    yf = RT.point(zc, FRONT, 0.016).y
    p.append(tint(rbox('ChestUnit', (0.0, yf - 0.014, zc), (0.176, 0.032, 0.104), 'Shell', bevel=0.006, segs=1),
                  'armour'))
    fy = yf - 0.030
    X, N, U = Vector((1, 0, 0)), Vector((0, -1, 0)), Vector((0, 0, 1))
    p.append(rbox('ChestScreen', (-0.030, fy - 0.0012, zc + 0.004), (0.080, 0.004, 0.060), 'Visor', bevel=0.003,
                  segs=1))
    face = [rbox('ChestFaceEyeL', (-0.044, fy - 0.0032, zc + 0.016), (0.011, 0.002, 0.011), 'TeamGlow', bevel=0.0,
                 segs=1),
            rbox('ChestFaceEyeR', (-0.016, fy - 0.0032, zc + 0.016), (0.011, 0.002, 0.011), 'TeamGlow', bevel=0.0,
                 segs=1),
            rbox('ChestFaceMouth', (-0.030, fy - 0.0032, zc - 0.010), (0.034, 0.002, 0.012), 'TeamGlow', bevel=0.0,
                 segs=1)]
    p.append(join('ChestFace', face))
    p.append(join('ChestUnitLights', [rbox('ChestUnitLight%d' % i, (0.048, fy - 0.0012, zc + 0.028 - 0.015 * i),
                                           (0.022, 0.003, 0.008), m, bevel=0.0, segs=1)
                                      for i, m in enumerate(('Light', 'Light', 'TeamGlow'))]))
    p.append(tint(_slats('ChestUnitVent', (0.048, fy, zc - 0.032), X, U, N, 3, 0.0075, (0.040, 0.003, 0.0035),
                         'Shell'), 'plate'))
    p.append(tint(_bolts('ChestUnitBolts', [(sx * 0.079, fy, zc + sz * 0.043) for sx in (1, -1) for sz in (1, -1)],
                         N), 'plate'))
    # the back unit: a flat power cell on the back plate with the team's stripe, two lights and cooling fins
    t, n, up = surface_basis(RT, 1.285, BACK)
    bc = RT.point(1.285, BACK, 0.016) + n * 0.011
    p.append(tint(rbox('BackUnit', bc, (0.132, 0.022, 0.118), 'Shell', bevel=0.006, segs=1, basis=(t, n, up)),
                  'armour'))
    face_b = bc + n * 0.011
    p.append(rbox('BackTeam', face_b + n * 0.0015 + up * 0.040, (0.100, 0.003, 0.016), 'TeamPaint', bevel=0.0, segs=1,
                  basis=(t, n, up)))
    p.append(join('BackLight', [rbox('BackLight%d' % i, face_b + n * 0.0015 + t * (0.040 * i) + up * 0.020,
                                     (0.014, 0.003, 0.006), 'Light', bevel=0.0, segs=1, basis=(t, n, up))
                                for i in (-1, 1)]))
    p.append(tint(_slats('BackUnitFins', face_b - up * 0.022, up, t, n, 6, 0.016, (0.050, 0.004, 0.005), 'Shell'),
                  'plate'))
    # shoulder yokes: armour straps laid on the suit over each shoulder, their ends tucked under the plates
    for sx, nm in ((1, 'ShoulderYoke_L'), (-1, 'ShoulderYoke_R')):
        p.append(tint(_strap(nm, p[0], 0.068 * sx, 0.128 * sx, -80.0, 80.0, 0.002, 0.007, 'Shell'), 'plate'))
    # the neck: a ribbed rubber column inside a dark collar
    p.append(cyl('Neck', (0, 0.010, 1.430), (0, 0.004, 1.515), 0.034, 'Joint', segs=14))
    for i, z in enumerate((1.462, 1.476, 1.490, 1.504)):
        p.append(cyl('NeckRing%d' % i, (0, 0.008, z - 0.003), (0, 0.007, z + 0.003), 0.040, 'Joint', segs=14))
    p.append(tint(tube('Collar', [{'c': (0, 0.012, 1.430), 'rx': 0.066, 'rf': 0.060, 'rb': 0.066},
                                  {'c': (0, 0.012, 1.452), 'rx': 0.054, 'rf': 0.050, 'rb': 0.056}], 'Shell', segs=22,
                       n=2, cap0=0.0, cap1=0.0, cap_rings=1, angle=50), 'armour'))
    return p


def _piston(name, a, b, c, r, material='Joint'):
    """A piston on a limb: a dark cylinder from a to b and a bright rod from b on to c."""
    return [cyl(name + 'Piston_L', a, b, r, material, segs=8),
            tint(cyl(name + 'Rod_L', b - (b - a).normalized() * 0.01, c, r * 0.48, 'Shell', segs=6), 'white')]


def robot_leg_left():
    th = (KNEE - HIP).normalized()
    sh = (ANKLE - KNEE).normalized()
    X = Vector((1, 0, 0))
    p = [ball('HipBall_L', HIP, 0.058, 'Joint')]
    # squared limbs (William: more mechanical and boxy)
    thigh = tube('Thigh_L', [
        {'c': HIP + th * 0.035, 'rx': 0.066, 'rf': 0.076, 'rb': 0.078, 'rs': 0.076, 'e': 3.0},
        {'c': HIP + th * 0.12, 'rx': 0.064, 'rf': 0.073, 'rb': 0.075, 'rs': 0.073, 'e': 3.0},
        {'c': HIP + th * 0.22, 'rx': 0.057, 'rf': 0.066, 'rb': 0.066, 'rs': 0.064, 'e': 3.0},
        {'c': HIP + th * 0.31, 'rx': 0.051, 'rf': 0.059, 'rb': 0.057, 'rs': 0.056, 'e': 2.9},
        {'c': KNEE - th * 0.055, 'rx': 0.046, 'rf': 0.052, 'rb': 0.049, 'rs': 0.049, 'e': 2.8},
    ], 'Shell', segs=20, n=9, cap0=0.016, cap1=0.010, cap_rings=2, angle=45)
    p.append(tint(thigh, 'suit'))
    # a plate down the front of the thigh with the team's stripe on its outer half, and a piston down its outside
    pc = HIP + th * 0.17 + Vector((0.004, -0.072, 0))
    tp = _plate('ThighPlate_L', pc, (0.12, -1, 0.0), -th, (0.074, 0.009, 0.17), 'Shell', corner=0.010, onto=[thigh])
    p.append(tint(tp, 'plate'))
    p.append(_plate('ThighTeam_L', pc + Vector((0.020, -0.012, 0)), (0.12, -1, 0.0), -th, (0.024, 0.003, 0.13),
                    'TeamPaint', corner=0.004, onto=[tp]))
    bolts = [pc + Vector((sx * 0.026, -0.010, 0)) - th * (sz * 0.068) for sx in (1, -1) for sz in (1, -1)]
    p.append(tint(_bolts('ThighPlateBolts_L', bolts, (0.12, -1, 0.0), onto=[tp]), 'armour'))
    p += _piston('Thigh', HIP + th * 0.10 + Vector((0.083, 0.010, 0)), HIP + th * 0.25 + Vector((0.073, 0.012, 0)),
                 HIP + th * 0.37 + Vector((0.064, 0.012, 0)), 0.010)
    p.append(tint(_plate('ThighPanel_L', HIP + th * 0.20 + Vector((0.004, 0.068, 0)), (0, 1, 0), -th,
                         (0.060, 0.006, 0.14), 'Shell', corner=0.010, onto=[thigh]), 'plate'))
    # the knee: a hinge under a squared dark plate with the team's colour on it
    p.append(cyl('KneeHinge_L', KNEE - X * 0.050, KNEE + X * 0.050, 0.042, 'Joint', segs=14))
    kp = _plate('KneePlate_L', KNEE + Vector((0, -0.050, 0.006)), (0, -1, 0.05), (0, 0, 1), (0.084, 0.018, 0.104),
                'Shell', corner=0.012)
    p.append(tint(kp, 'armour'))
    p.append(_plate('KneePlateTeam_L', KNEE + Vector((0, -0.062, 0.010)), (0, -1, 0.05), (0, 0, 1),
                    (0.052, 0.004, 0.058), 'TeamPaint', corner=0.006, onto=[kp]))
    bolts = [KNEE + Vector((sx * 0.033, -0.0595, 0.006 + sz * 0.040)) for sx in (1, -1) for sz in (1, -1)]
    p.append(tint(_bolts('KneePlateBolts_L', bolts, (0, -1, 0.05), onto=[kp]), 'plate'))
    shin = tube('Shin_L', [
        {'c': KNEE + sh * 0.050, 'rx': 0.046, 'rf': 0.048, 'rb': 0.054, 'rs': 0.048, 'e': 3.0},
        {'c': KNEE + sh * 0.120, 'rx': 0.049, 'rf': 0.049, 'rb': 0.060, 'rs': 0.051, 'e': 3.0},
        {'c': KNEE + sh * 0.190, 'rx': 0.046, 'rf': 0.047, 'rb': 0.056, 'rs': 0.048, 'e': 3.0},
    ], 'Shell', segs=16, n=5, cap0=0.010, cap1=None, cap_rings=2, angle=45)
    p.append(tint(shin, 'suit'))
    p.append(tint(_plate('ShinPanel_L', KNEE + sh * 0.115 + Vector((0, 0.058, 0)), (0, 1, 0), -sh,
                         (0.040, 0.005, 0.08), 'Shell', corner=0.008, onto=[shin]), 'plate'))
    p += _piston('Shin', KNEE + sh * 0.060 + X * 0.058, KNEE + sh * 0.135 + X * 0.060, KNEE + sh * 0.190 + X * 0.057,
                 0.009)
    # the boot: a squared white shaft from mid-shin with a dark cuff, an ankle guard, a chunky foot with a heel block
    # on a dark sole
    cuff = {'rx': 0.053, 'rf': 0.054, 'rb': 0.062, 'rs': 0.055, 'e': 3.0}
    p.append(tube('BootCuff_L', [dict(cuff, c=KNEE + sh * 0.178), dict(cuff, c=KNEE + sh * 0.200)], 'Joint', segs=16,
                  n=2, cap0=None, cap1=None, angle=50))
    boot = tube('ShinBoot_L', [
        {'c': KNEE + sh * 0.198, 'rx': 0.050, 'rf': 0.051, 'rb': 0.058, 'rs': 0.052, 'e': 3.0},
        {'c': KNEE + sh * 0.270, 'rx': 0.047, 'rf': 0.049, 'rb': 0.052, 'rs': 0.049, 'e': 3.0},
        {'c': KNEE + sh * 0.330, 'rx': 0.045, 'rf': 0.048, 'rb': 0.049, 'rs': 0.047, 'e': 3.0},
        {'c': ANKLE + sh * 0.010, 'rx': 0.046, 'rf': 0.050, 'rb': 0.049, 'rs': 0.048, 'e': 3.0},
    ], 'Shell', segs=16, n=6, cap0=None, cap1=0.008, cap_rings=1, angle=50)     # its end sunk in the foot: no slit
    p.append(tint(boot, 'white'))
    p.append(tint(_plate('ShinGuard_L', KNEE + sh * 0.27 + Vector((0, -0.050, 0)), (0, -1, 0.05), -sh,
                         (0.054, 0.009, 0.11), 'Shell', corner=0.007, onto=[boot]), 'plate'))
    p.append(cyl('Ankle_L', ANKLE - X * 0.044, ANKLE + X * 0.044, 0.032, 'Joint', segs=12))
    p.append(tint(_plate('AnkleGuard_L', ANKLE + X * 0.050, X, (0, 0, 1), (0.044, 0.008, 0.048), 'Shell',
                         corner=0.010), 'plate'))
    x, y0 = ANKLE.x, ANKLE.y
    p.append(tint(tube('Foot_L', [
        {'c': (x, y0 + 0.060, 0.054), 'rx': 0.037, 'rs': 0.039, 'rf': 0.030, 'rb': 0.028, 'e': 3.3},
        {'c': (x, y0 + 0.030, 0.064), 'rx': 0.047, 'rs': 0.049, 'rf': 0.046, 'rb': 0.040, 'e': 3.3},
        {'c': (x + 0.002, y0 - 0.020, 0.060), 'rx': 0.049, 'rs': 0.051, 'rf': 0.044, 'rb': 0.038, 'e': 3.3},
        {'c': (x + 0.004, y0 - 0.070, 0.047), 'rx': 0.050, 'rs': 0.052, 'rf': 0.029, 'rb': 0.027, 'e': 3.3},
        {'c': (x + 0.006, y0 - 0.118, 0.037), 'rx': 0.049, 'rs': 0.050, 'rf': 0.019, 'rb': 0.018, 'e': 3.3},
    ], 'Shell', segs=16, n=8, hint=(0, 0, 1), cap0=0.014, cap1=0.006, cap_rings=2, angle=40), 'white'))
    p.append(tint(rbox('FootHeel_L', (x, y0 + 0.052, 0.046), (0.090, 0.032, 0.056), 'Shell', bevel=0.008, segs=1),
                  'white'))
    p.append(cyl('ToeHinge_L', (x - 0.046, y0 - 0.132, 0.026), (x + 0.058, y0 - 0.132, 0.026), 0.012, 'Joint', segs=8))
    p.append(tint(rbox('Toe_L', (x + 0.008, y0 - 0.174, 0.028), (0.096, 0.070, 0.036), 'Shell', bevel=0.008, segs=1,
                       taper=(0.94, 0.70)), 'white'))
    p.append(rbox('Tread_L', (x + 0.004, y0 - 0.066, 0.009), (0.104, 0.290, 0.018), 'Joint', bevel=0.006, segs=1))
    return p


def robot_arm_left():
    u, f = arm_dirs()
    elbow, wrist = arm_points()
    S0 = SHOULDER
    Y = Vector((0, 1, 0))
    p = [ball('ShoulderBall_L', S0, 0.046, 'Joint')]
    outer = u.cross(Vector((0, -1, 0))).normalized()          # away from the body, round the upper arm
    if outer.x < 0:
        outer = -outer
    fwd = (Vector((0, -1, 0)) - u * u.dot(Vector((0, -1, 0)))).normalized()
    # the shoulder armour (William: part of the shoulder, not sticking out): a squared cap in the team's colour that
    # hugs the joint and the top of the upper arm, bolted on, with a dark band round its edge
    cap = [(-0.046, 0.028, 0.034, 0.036, 0.038), (-0.024, 0.043, 0.049, 0.051, 0.053),
           (0.015, 0.047, 0.052, 0.054, 0.056), (0.060, 0.048, 0.051, 0.053, 0.055),
           (0.088, 0.047, 0.050, 0.052, 0.054)]          # (along the arm, rx, rf, rb, rs)
    p.append(tube('Pauldron_L', [{'c': S0 + u * d, 'rx': rx, 'rf': rf, 'rb': rb, 'rs': rs, 'e': 3.8}
                                 for d, rx, rf, rb, rs in cap],
                  'TeamPaint', segs=20, n=7, cap0=0.008, cap1=None, cap_rings=2, angle=40))
    p.append(tint(tube('PauldronRim_L', [{'c': S0 + u * 0.084, 'rx': 0.0475, 'rf': 0.0505, 'rb': 0.0525, 'rs': 0.0545,
                                          'e': 3.8},
                                         {'c': S0 + u * 0.098, 'rx': 0.0465, 'rf': 0.0485, 'rb': 0.0505, 'rs': 0.0515,
                                          'e': 3.8}],
                       'Shell', segs=20, n=2, cap0=None, cap1=None, angle=40), 'armour'))
    p.append(tint(_bolts('PauldronBolts_L', [S0 + u * 0.034 + outer * 0.0545 + fwd * s for s in (0.022, -0.022)],
                         outer, onto=[p[1]]), 'plate'))
    p.append(tint(tube('UpperArm_L', [
        {'c': S0 + u * 0.060, 'rx': 0.045, 'rf': 0.047, 'rb': 0.049, 'rs': 0.049, 'e': 3.0},
        {'c': S0 + u * 0.140, 'rx': 0.045, 'rf': 0.046, 'rb': 0.047, 'rs': 0.048, 'e': 3.0},
        {'c': S0 + u * 0.205, 'rx': 0.041, 'rf': 0.042, 'rb': 0.043, 'rs': 0.043, 'e': 3.0},
        {'c': elbow - u * 0.040, 'rx': 0.038, 'rf': 0.039, 'rb': 0.040, 'rs': 0.040, 'e': 3.0},
    ], 'Shell', segs=16, n=6, cap0=0.008, cap1=0.008, cap_rings=1, angle=45), 'suit'))
    ua = p[-1]
    side_u = (outer + fwd).normalized()
    p.append(tint(_plate('UpperArmPanel_L', S0 + u * 0.165 + side_u * 0.048, side_u, -u, (0.030, 0.005, 0.090), 'Shell',
                         corner=0.006, onto=[ua]), 'plate'))
    ax = u.cross(f).normalized()
    p.append(cyl('ElbowHinge_L', elbow - ax * 0.039, elbow + ax * 0.039, 0.037, 'Joint', segs=14))
    # the forearm: a squared grey bracer, slimmer at the wrist, with a dark guard over the elbow, a light plate along
    # its outside, a small light at the wrist and a rubber cuff at its end
    fa = tube('Forearm_L', [
        {'c': elbow + f * 0.040, 'rx': 0.041, 'rf': 0.043, 'rb': 0.045, 'rs': 0.045, 'e': 3.2},
        {'c': elbow + f * 0.100, 'rx': 0.042, 'rf': 0.042, 'rb': 0.044, 'rs': 0.044, 'e': 3.2},
        {'c': elbow + f * 0.170, 'rx': 0.036, 'rf': 0.036, 'rb': 0.037, 'rs': 0.038, 'e': 3.2},
        {'c': wrist - f * 0.022, 'rx': 0.031, 'rf': 0.031, 'rb': 0.032, 'rs': 0.032, 'e': 3.0},
    ], 'Shell', segs=16, n=6, cap0=0.008, cap1=0.006, cap_rings=1, angle=45)
    p.append(tint(fa, 'plate'))
    back = (Y - f * f.dot(Y)).normalized()
    side = f.cross(back).normalized()
    p.append(tint(rbox('ForearmElbow_L', elbow + f * 0.012 + back * 0.046, (0.058, 0.018, 0.046), 'Shell',
                       bevel=0.007, segs=1, basis=(side, back, f)), 'armour'))
    fout = f.cross(Vector((0, -1, 0))).normalized()
    if fout.x < 0:
        fout = -fout
    p.append(tint(_plate('ForearmPanel_L', elbow + f * 0.105 + fout * 0.044, fout, -f, (0.034, 0.006, 0.12), 'Shell',
                         corner=0.006, onto=[fa]), 'suit'))
    p.append(_plate('ForearmLight_L', wrist - f * 0.050 + back * 0.036, back, -f, (0.012, 0.003, 0.007), 'Light',
                    corner=0.002, onto=[fa]))
    p.append(tube('ForearmCuff_L', [{'c': wrist - f * 0.036, 'rx': 0.0335, 'rf': 0.0335, 'rb': 0.0345, 'rs': 0.0345,
                                     'e': 3.0},
                                    {'c': wrist - f * 0.022, 'rx': 0.0335, 'rf': 0.0335, 'rb': 0.0345, 'rs': 0.0345,
                                     'e': 3.0}],
                  'Joint', segs=16, n=2, cap0=None, cap1=0.007, cap_rings=1, angle=40))
    hand = robot_hand_left()
    for o in hand:
        if o.name.startswith(('Palm', 'Finger', 'Thumb')) and 'Knuckle' not in o.name:
            tint(o, 'hand')
    return p + hand


def robot_body():
    global RT
    RT = TORSO.view(0.0)
    robot_materials()
    parts = robot_torso()
    left = robot_arm_left() + robot_leg_left()
    right = [mirror_x(o, o.name.replace('_L', '_R')) for o in left]
    return parts + left + right


# --- the head (William, 13 Oct: every robot wears the old sensor head, made over with the redesign: a visor and a
# headset with square headphones), in the human head's space (scaled with it), at most 2,500 triangles -------------
HELM = Profile2([
    (1.486, 0.010, 0.056, 0.062, 0.064, 3.0),
    (1.500, 0.010, 0.068, 0.078, 0.080, 3.2),
    (1.525, 0.010, 0.078, 0.090, 0.092, 3.4),
    (1.560, 0.010, 0.083, 0.096, 0.098, 3.5),
    (1.620, 0.010, 0.084, 0.097, 0.100, 3.5),
    (1.660, 0.010, 0.082, 0.094, 0.098, 3.5),
    (1.684, 0.010, 0.077, 0.088, 0.093, 3.4),
    (1.700, 0.010, 0.066, 0.076, 0.081, 3.2),
    (1.709, 0.010, 0.046, 0.053, 0.057, 2.9),
    (1.713, 0.010, 0.022, 0.025, 0.027, 2.5),
])
HELM_Z = [1.486, 1.494, 1.505, 1.520, 1.540, 1.565, 1.592, 1.620, 1.645, 1.665, 1.684, 1.700, 1.709, 1.713]


def robot_head_headset():
    """The sensor head made over: a squared white skull with a grey brow over a dark wraparound visor with the team's
    glowing line in it, a dark jaw with a grille and the team's glowing mouth, square dark headphones with the team's
    plates and a light, joined by a band over the crown, a microphone boom, the team's stripe over the crown, an
    antenna with a glowing tip and a cooling vent at the back."""
    G = HELM
    p = [tint(ploft('Skull', G, HELM_Z, 0.0, 26, 'Gloss', pole1=Vector((0, 0.010, 1.715)), angle=40), 'white')]
    p.append(tint(panel('VisorFrame', G, 1.571, 1.637, FRONT - 1.30, FRONT + 1.30, 0.0, 0.007, 2, 20, 'Gloss',
                        inset=0.3, inner=False), 'armour'))
    p.append(panel('Visor', G, 1.577, 1.631, FRONT - 1.24, FRONT + 1.24, 0.002, 0.008, 2, 20, 'Visor', inset=0.35,
                   inner=False))
    p.append(panel('VisorLight', G, 1.601, 1.608, FRONT - 0.92, FRONT + 0.92, 0.0102, 0.0022, 1, 16, 'TeamGlow',
                   inset=0.0, inner=False))
    p.append(tint(panel('Brow', G, 1.637, 1.656, FRONT - 1.10, FRONT + 1.10, 0.002, 0.010, 1, 14, 'Gloss', inset=0.45,
                        inner=False), 'plate'))
    p.append(panel('Jaw', G, 1.500, 1.566, FRONT - 0.80, FRONT + 0.80, 0.002, 0.011, 2, 10, 'Joint', inset=0.4,
                   inner=False))
    p.append(tint(join('Grille', [panel('Grille%d' % i, G, z - 0.0022, z + 0.0022, FRONT - 0.42, FRONT + 0.42, 0.013,
                                        0.0025, 1, 6, 'Gloss', inset=0.0, inner=False)
                                  for i, z in enumerate((1.513, 1.525))]), 'plate'))
    p.append(panel('Mouth', G, 1.5375, 1.5425, FRONT - 0.30, FRONT + 0.30, 0.013, 0.0025, 1, 6, 'TeamGlow', inset=0.0,
                   inner=False))
    # the headset: square headphones (the team's plate and a light on each), a band over the crown and a microphone
    for sx, nm in ((1, 'L'), (-1, 'R')):
        c = Vector((sx * 0.098, 0.006, 1.594))
        p.append(tint(rbox('EarUnit_' + nm, c, (0.030, 0.074, 0.080), 'Gloss', bevel=0.008, segs=2), 'armour'))
        p.append(rbox('EarPlate_' + nm, c + Vector((sx * 0.0165, 0.002, 0.002)), (0.004, 0.050, 0.054), 'TeamPaint',
                      bevel=0.003, segs=1))
        p.append(rbox('EarLight_' + nm, c + Vector((sx * 0.0165, -0.006, -0.032)), (0.004, 0.024, 0.005), 'Light',
                      bevel=0.0, segs=1))
    p.append(tint(_strap('HeadBand', p[0], -0.007, 0.019, -74.0, 74.0, 0.006, 0.007, 'Gloss', nth=16, nx=3, cy=0.006,
                         cz=1.600, across='y'), 'plate'))
    p.append(_strap('Crest', p[0], -0.009, 0.009, -58.0, 76.0, 0.001, 0.004, 'TeamPaint', nth=16, nx=2, cy=0.010,
                    cz=1.600))
    m0, m1 = Vector((0.104, -0.026, 1.566)), Vector((0.068, -0.084, 1.530))
    p.append(cyl('MicBoom', m0, m1, 0.0032, 'Joint', segs=6))
    p.append(rbox('Mic', m1, (0.014, 0.012, 0.011), 'Joint', bevel=0.0, segs=1))
    # the antenna on the right headphone, short enough that the head stays near the hit volume's height
    a0 = Vector((-0.104, 0.030, 1.628))
    a1 = Vector((-0.112, 0.048, 1.734))
    p.append(cyl('AntennaBase', a0 - Vector((-0.008, 0, 0)), a0 + Vector((-0.008, 0, 0)), 0.010, 'Joint', segs=8))
    p.append(cyl('Antenna', a0, a1, 0.0032, 'Joint', segs=6, r1=0.0024))
    p.append(ball('AntennaTip', a1, 0.0065, 'TeamGlow', segs=6, rings=4))
    # a cooling vent at the back with a light under it
    p.append(panel('Vent', G, 1.566, 1.626, BACK - 0.42, BACK + 0.42, 0.001, 0.005, 1, 8, 'Joint', inset=0.4,
                   inner=False))
    t, n, up = surface_basis(G, 1.596, BACK)
    p.append(tint(_slats('VentSlats', G.point(1.596, BACK, 0.005), t, up, n, 4, 0.013, (0.062, 0.004, 0.005), 'Gloss'),
                  'plate'))
    t, n, up = surface_basis(G, 1.552, BACK)
    p.append(rbox('NapeLight', G.point(1.552, BACK, 0.001), (0.030, 0.004, 0.006), 'Light', bevel=0.0, segs=1,
                  basis=(t, n, up)))
    p.append(cyl('NeckSocket', (0, 0.010, 1.470), (0, 0.010, 1.492), 0.046, 'Joint', segs=16, r1=0.050))
    return p


ROBOT_HEADS = (('Head_Headset', robot_head_headset),)


# The robot has no Hard parts any more, so bot14's smoothing of the glove's Hard strap has nothing to do on it.
if not getattr(smooth_hand_hard, 'v19', False):
    _smooth_hand_hard_v14 = smooth_hand_hard


def smooth_hand_hard(objs, rig):
    m = bpy.data.materials.get('Hard')
    if m is None or not any(s.material == m for o in objs for s in o.material_slots):
        return
    _smooth_hand_hard_v14(objs, rig)


smooth_hand_hard.v19 = True


# The robot's paint: a clean satin finish with faint scuffs (the v4 robot's worn chips read as dirt on the sleek suit; a
# stronger bump read as dimpled leather in the first review).
if not getattr(make_textures, 'v19', False):
    _make_textures_v9 = make_textures


def make_textures():
    out = _make_textures_v9()
    scuff = _periodic_noise(TEX, 120, 7)
    lum = 1.0 - 0.035 * scuff
    rough = 0.40 + 0.08 * scuff
    orm = np.stack([np.ones_like(rough), rough, np.zeros_like(rough)], -1)
    out['Shell'] = (_image('tex_satin_col', np.repeat(lum[..., None], 3, -1)),
                    _image('tex_satin_nrm', _normal_from_height(scuff * 0.04, 3.0), True),
                    _image('tex_satin_orm', orm, True))
    out['TeamPaint'] = (None, out['Shell'][1], None)
    out['Joint'] = (None, out['Shell'][1], None)        # the human's rubber stipple read as dimples on the robot
    return out


make_textures.v19 = True

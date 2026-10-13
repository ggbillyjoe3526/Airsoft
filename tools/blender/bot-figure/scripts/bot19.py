# --- v12 robot (William, 13 October 2026): redesigned from his reference pictures ------------------------------------
# A sleek android soldier: a light grey synthetic suit under segmented armour (grey chest and back plates, a dark chest
# unit with a screen and status lights, a ribbed band under the chest, dark forearm bracers, white boots), with the
# team on big shoulder pads, the belt mark, the thigh stripe and the helmet block (TeamPaint) and on its glows
# (TeamGlow: the chest screen's face, the mouth, the eyes). Two heads: a visored helmet over a pale face mask with a
# glowing mouth, and a pale android face with a dark eye band under a white helmet. No airsoft gear: no pouches,
# holsters, magazines or packs. Same skeleton, joints and hands as v11, so every clip and finger solve carries over.
# The greys share one material (Shell): each part's grey goes into the baked shade (the vertex colour the game
# multiplies in), so the figure keeps few draw calls.

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
        (('ChestPlate', 'ChestUnit', 'ChestScreen', 'ChestFace', 'ChestCross', 'ChestLight', 'ChestModule',
          'BackPlate', 'BackUnit', 'BackTeam', 'BackLight', 'ShoulderYoke'), ('rigid', 'Chest')),
        (('Waist',), ('blend', ['Hips', 'Spine', 'Spine1', 'Chest'])),
        (('BeltBand', 'BeltTeam'), ('rigid', 'Hips')),
        (('BootCuff',), ('rigid', 'Shin_S')),
    ]


def _cross(name, centre, normal, along, arm, width, depth=0.0022):
    """A raised plus mark: two thin bars on a face."""
    n = Vector(normal).normalized()
    z = (Vector(along) - n * n.dot(Vector(along))).normalized()
    x = z.cross(n).normalized()
    c = Vector(centre) + n * (depth / 2)
    return join(name, [rbox(name + 'H', c, (arm, depth, width), 'Shell', bevel=0.0, segs=1, basis=(x, n, z)),
                       rbox(name + 'V', c, (width, depth, arm), 'Shell', bevel=0.0, segs=1, basis=(x, n, z))])


def _strap(name, surf, x0, x1, th0, th1, lift, thick, material, nth=16, nx=3, cy=0.012, cz=1.33):
    """A strap laid on a surface over the top of the body, between x0 and x1: each station found by a ray from
    outside towards the line (x, cy, cz) at an angle th (degrees, -90 ahead, 0 straight up, 90 behind), lifted off
    the surface by lift, thick at its middle and thinner at its edges."""
    tree = bvh(surf)
    go, gi = [], []
    for i in range(nth + 1):
        th = math.radians(th0 + (th1 - th0) * i / nth)
        d = Vector((0, math.sin(th), math.cos(th)))
        ro, ri = [], []
        for j in range(nx + 1):
            x = x0 + (x1 - x0) * j / nx
            loc, n, _, _ = tree.ray_cast(Vector((x, cy, cz)) + d * 0.4, -d, 0.6)
            n = (n + d).normalized()
            edge = j in (0, nx) or i in (0, nth)
            ri.append(loc + n * lift)
            ro.append(loc + n * (lift + thick * (0.55 if edge else 1.0)))
        go.append(ro)
        gi.append(ri)
    return slab(name, go, gi, material, angle=50, inner=False)


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
    p.append(panel('BeltTeam', RT, 0.967, 0.985, FRONT - 0.20, FRONT + 0.20, 0.004, 0.004, 1, 3, 'TeamPaint',
                   inset=0.3, inner=False))

    # chest armour: a plate over the front with a scoop under the collar (no wider than ±0.95 rad: a wider one
    # pushes the left arm out in the pistol reload, arms-check), and a plate over the back
    top_f = lambda a: 1.386 - 0.038 * math.exp(-((a - FRONT) / 0.40) ** 2)
    bot_f = lambda a: 1.160 + 0.012 * math.cos(a - FRONT)
    p.append(tint(panel('ChestPlate', RT, bot_f, top_f, FRONT - 0.95, FRONT + 0.95, 0.001, 0.015, 6, 22, 'Shell',
                        inset=0.55, bulge=0.003, inner=False), 'plate'))
    p.append(tint(panel('ChestPlateTrim', RT, bot_f, lambda a: bot_f(a) + 0.011, FRONT - 0.95, FRONT + 0.95, 0.0,
                        0.0175, 1, 22, 'Shell', inset=0.3, inner=False), 'armour'))
    top_b = lambda a: 1.400 - 0.028 * math.exp(-((a - BACK) / 0.40) ** 2)
    p.append(tint(panel('BackPlate', RT, 1.170, top_b, BACK - 1.15, BACK + 1.15, 0.001, 0.015, 5, 18, 'Shell',
                        inset=0.55, bulge=0.003, inner=False), 'plate'))
    p.append(tint(panel('BackPlateTrim', RT, 1.170, 1.181, BACK - 1.15, BACK + 1.15, 0.0, 0.0175, 1, 18, 'Shell',
                        inset=0.3, inner=False), 'armour'))
    # the chest unit: a dark box with a screen (the team's glowing face on it), a plus mark and a status light
    zc = 1.255
    yf = RT.point(zc, FRONT, 0.016).y
    p.append(tint(rbox('ChestUnit', (0.0, yf - 0.014, zc), (0.176, 0.032, 0.104), 'Shell', bevel=0.010, segs=2),
                  'armour'))
    fy = yf - 0.030
    p.append(rbox('ChestScreen', (-0.032, fy - 0.0012, zc + 0.004), (0.078, 0.004, 0.058), 'Visor', bevel=0.004,
                  segs=1))
    face = [rbox('ChestFaceEyeL', (-0.046, fy - 0.0032, zc + 0.016), (0.011, 0.002, 0.011), 'TeamGlow', bevel=0.0,
                 segs=1),
            rbox('ChestFaceEyeR', (-0.018, fy - 0.0032, zc + 0.016), (0.011, 0.002, 0.011), 'TeamGlow', bevel=0.0,
                 segs=1),
            rbox('ChestFaceMouth', (-0.032, fy - 0.0032, zc - 0.010), (0.034, 0.002, 0.012), 'TeamGlow', bevel=0.0,
                 segs=1)]
    p.append(join('ChestFace', face))
    p.append(tint(_cross('ChestCross', (0.050, fy, zc + 0.006), (0, -1, 0), (0, 0, 1), 0.040, 0.0055), 'white'))
    p.append(rbox('ChestLight', (0.050, fy - 0.0012, zc - 0.034), (0.026, 0.003, 0.006), 'Light', bevel=0.0, segs=1))
    # a small module on the right ribs with a blue light (the left arm sweeps the left ribs in the pistol reload)
    t, n, up = surface_basis(RT, 1.180, FRONT + 0.95)
    mc = RT.point(1.180, FRONT + 0.95, 0.016) + n * 0.017
    p.append(tint(rbox('ChestModule', mc, (0.052, 0.034, 0.078), 'Shell', bevel=0.007, segs=2, basis=(t, n, up)),
                  'armour'))
    p.append(rbox('ChestModuleLight', mc + n * 0.0175 + up * 0.020, (0.012, 0.003, 0.012), 'Light', bevel=0.0, segs=1,
                  basis=(t, n, up)))
    # the back unit with the team's stripe and two lights
    t, n, up = surface_basis(RT, 1.285, BACK)
    bc = RT.point(1.285, BACK, 0.016) + n * 0.015
    p.append(tint(rbox('BackUnit', bc, (0.132, 0.030, 0.118), 'Shell', bevel=0.009, segs=2, basis=(t, n, up)),
                  'armour'))
    p.append(rbox('BackTeam', bc + n * 0.0155 + up * 0.030, (0.096, 0.003, 0.018), 'TeamPaint', bevel=0.0, segs=1,
                  basis=(t, n, up)))
    p.append(join('BackLight', [rbox('BackLight%d' % i, bc + n * 0.0155 + t * (0.030 * i) - up * 0.026,
                                     (0.014, 0.003, 0.006), 'Light', bevel=0.0, segs=1, basis=(t, n, up))
                                for i in (-1, 1)]))
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


def robot_leg_left():
    th = (KNEE - HIP).normalized()
    sh = (ANKLE - KNEE).normalized()
    X = Vector((1, 0, 0))
    p = [ball('HipBall_L', HIP, 0.058, 'Joint')]
    thigh = tube('Thigh_L', [
        {'c': HIP + th * 0.035, 'rx': 0.066, 'rf': 0.076, 'rb': 0.078, 'rs': 0.076, 'e': 2.3},
        {'c': HIP + th * 0.12, 'rx': 0.064, 'rf': 0.073, 'rb': 0.075, 'rs': 0.073, 'e': 2.3},
        {'c': HIP + th * 0.22, 'rx': 0.057, 'rf': 0.066, 'rb': 0.066, 'rs': 0.064, 'e': 2.3},
        {'c': HIP + th * 0.31, 'rx': 0.051, 'rf': 0.059, 'rb': 0.057, 'rs': 0.056, 'e': 2.2},
        {'c': KNEE - th * 0.055, 'rx': 0.046, 'rf': 0.052, 'rb': 0.049, 'rs': 0.049, 'e': 2.2},
    ], 'Shell', segs=18, n=9, cap0=0.016, cap1=0.010, cap_rings=2, angle=50)
    p.append(tint(thigh, 'suit'))
    p.append(tint(_plate('ThighStripe_L', HIP + th * 0.18 + X * 0.072, (1, 0, 0.05), -th, (0.022, 0.003, 0.26),
                         'Shell', corner=0.006, onto=[thigh]), 'armour'))
    p.append(_plate('ThighTeam_L', HIP + th * 0.20 + Vector((0.030, -0.066, 0)), (0.45, -1, 0.1), -th,
                    (0.010, 0.003, 0.15), 'TeamPaint', corner=0.004, onto=[thigh]))
    p.append(cyl('KneeHinge_L', KNEE - X * 0.050, KNEE + X * 0.050, 0.042, 'Joint', segs=14))
    p.append(tint(_plate('KneePlate_L', KNEE + Vector((0, -0.050, 0.006)), (0, -1, 0.05), (0, 0, 1),
                         (0.084, 0.016, 0.104), 'Shell', corner=0.020), 'armour'))
    shin = tube('Shin_L', [
        {'c': KNEE + sh * 0.050, 'rx': 0.046, 'rf': 0.048, 'rb': 0.054, 'rs': 0.048, 'e': 2.2},
        {'c': KNEE + sh * 0.120, 'rx': 0.049, 'rf': 0.049, 'rb': 0.060, 'rs': 0.051, 'e': 2.2},
        {'c': KNEE + sh * 0.190, 'rx': 0.046, 'rf': 0.047, 'rb': 0.056, 'rs': 0.048, 'e': 2.2},
    ], 'Shell', segs=16, n=5, cap0=0.010, cap1=None, cap_rings=2, angle=50)
    p.append(tint(shin, 'suit'))
    # the boot: a white shaft from mid-shin with a dark cuff, a chunky white foot on a dark sole
    p.append(tube('BootCuff_L', [{'c': KNEE + sh * 0.178, 'rx': 0.053, 'rf': 0.054, 'rb': 0.062, 'rs': 0.055},
                                 {'c': KNEE + sh * 0.200, 'rx': 0.053, 'rf': 0.054, 'rb': 0.062, 'rs': 0.055}],
                  'Joint', segs=18, n=2, cap0=None, cap1=None, angle=50))
    boot = tube('ShinBoot_L', [
        {'c': KNEE + sh * 0.198, 'rx': 0.050, 'rf': 0.051, 'rb': 0.058, 'rs': 0.052, 'e': 2.4},
        {'c': KNEE + sh * 0.270, 'rx': 0.047, 'rf': 0.049, 'rb': 0.052, 'rs': 0.049, 'e': 2.4},
        {'c': KNEE + sh * 0.330, 'rx': 0.045, 'rf': 0.048, 'rb': 0.049, 'rs': 0.047, 'e': 2.4},
        {'c': ANKLE - sh * 0.010, 'rx': 0.046, 'rf': 0.050, 'rb': 0.049, 'rs': 0.048, 'e': 2.4},
    ], 'Shell', segs=18, n=6, cap0=None, cap1=0.008, cap_rings=1, angle=50)
    p.append(tint(boot, 'white'))
    p.append(tint(_plate('ShinGuard_L', KNEE + sh * 0.27 + Vector((0, -0.050, 0)), (0, -1, 0.05), -sh,
                         (0.050, 0.008, 0.11), 'Shell', corner=0.012, onto=[boot]), 'white'))
    p.append(cyl('Ankle_L', ANKLE - X * 0.044, ANKLE + X * 0.044, 0.032, 'Joint', segs=12))
    x, y0 = ANKLE.x, ANKLE.y
    p.append(tint(tube('Foot_L', [
        {'c': (x, y0 + 0.060, 0.054), 'rx': 0.037, 'rs': 0.039, 'rf': 0.030, 'rb': 0.028, 'e': 3.0},
        {'c': (x, y0 + 0.030, 0.064), 'rx': 0.047, 'rs': 0.049, 'rf': 0.046, 'rb': 0.040, 'e': 3.0},
        {'c': (x + 0.002, y0 - 0.020, 0.060), 'rx': 0.049, 'rs': 0.051, 'rf': 0.044, 'rb': 0.038, 'e': 3.0},
        {'c': (x + 0.004, y0 - 0.070, 0.047), 'rx': 0.050, 'rs': 0.052, 'rf': 0.029, 'rb': 0.027, 'e': 3.0},
        {'c': (x + 0.006, y0 - 0.118, 0.037), 'rx': 0.049, 'rs': 0.050, 'rf': 0.019, 'rb': 0.018, 'e': 3.0},
    ], 'Shell', segs=16, n=8, hint=(0, 0, 1), cap0=0.014, cap1=0.006, cap_rings=2, angle=40), 'white'))
    p.append(cyl('ToeHinge_L', (x - 0.046, y0 - 0.132, 0.026), (x + 0.058, y0 - 0.132, 0.026), 0.012, 'Joint', segs=8))
    p.append(tint(rbox('Toe_L', (x + 0.008, y0 - 0.174, 0.028), (0.096, 0.070, 0.036), 'Shell', bevel=0.012, segs=2,
                       taper=(0.94, 0.70)), 'white'))
    p.append(rbox('Tread_L', (x + 0.004, y0 - 0.066, 0.009), (0.104, 0.290, 0.018), 'Joint', bevel=0.006, segs=1))
    return p


def robot_arm_left():
    u, f = arm_dirs()
    elbow, wrist = arm_points()
    S0 = SHOULDER
    Y = Vector((0, 1, 0))
    p = [ball('ShoulderBall_L', S0, 0.052, 'Joint')]
    outer = u.cross(Vector((0, -1, 0))).normalized()          # away from the body, round the upper arm
    if outer.x < 0:
        outer = -outer
    # the shoulder pad: a big rounded block in the team's colour, a dark rim and a plus mark on its outer face
    p.append(tube('Pauldron_L', [
        {'c': S0 - u * 0.058, 'rx': 0.040, 'rf': 0.052, 'rb': 0.054, 'rs': 0.062, 'e': 3.0},
        {'c': S0 - u * 0.034, 'rx': 0.056, 'rf': 0.073, 'rb': 0.075, 'rs': 0.083, 'e': 3.0},
        {'c': S0 + u * 0.015, 'rx': 0.060, 'rf': 0.078, 'rb': 0.080, 'rs': 0.088, 'e': 3.0},
        {'c': S0 + u * 0.070, 'rx': 0.058, 'rf': 0.075, 'rb': 0.077, 'rs': 0.085, 'e': 3.0},
        {'c': S0 + u * 0.092, 'rx': 0.056, 'rf': 0.072, 'rb': 0.074, 'rs': 0.082, 'e': 3.0},
    ], 'TeamPaint', segs=20, n=8, cap0=0.012, cap1=None, cap_rings=2, angle=40))
    p.append(tint(tube('PauldronRim_L', [{'c': S0 + u * 0.088, 'rx': 0.058, 'rf': 0.074, 'rb': 0.076, 'rs': 0.084,
                                          'e': 3.0},
                                         {'c': S0 + u * 0.104, 'rx': 0.054, 'rf': 0.070, 'rb': 0.072, 'rs': 0.080,
                                          'e': 3.0}],
                       'Shell', segs=20, n=2, cap0=None, cap1=None, angle=40), 'armour'))
    p.append(tint(_cross('PauldronCross_L', S0 + u * 0.022 + outer * 0.0905, outer, -u, 0.044, 0.0065), 'white'))
    p.append(tint(tube('UpperArm_L', [
        {'c': S0 + u * 0.060, 'rx': 0.045, 'rf': 0.047, 'rb': 0.049, 'rs': 0.049, 'e': 2.2},
        {'c': S0 + u * 0.140, 'rx': 0.045, 'rf': 0.046, 'rb': 0.047, 'rs': 0.048, 'e': 2.2},
        {'c': S0 + u * 0.205, 'rx': 0.041, 'rf': 0.042, 'rb': 0.043, 'rs': 0.043, 'e': 2.2},
        {'c': elbow - u * 0.040, 'rx': 0.038, 'rf': 0.039, 'rb': 0.040, 'rs': 0.040, 'e': 2.2},
    ], 'Shell', segs=16, n=6, cap0=0.008, cap1=0.008, cap_rings=1, angle=45), 'suit'))
    ax = u.cross(f).normalized()
    p.append(cyl('ElbowHinge_L', elbow - ax * 0.039, elbow + ax * 0.039, 0.037, 'Joint', segs=14))
    # the forearm: a dark bracer with a white line along its outside and a small light at the wrist
    fa = tube('Forearm_L', [
        {'c': elbow + f * 0.040, 'rx': 0.044, 'rf': 0.046, 'rb': 0.048, 'rs': 0.048, 'e': 2.6},
        {'c': elbow + f * 0.100, 'rx': 0.045, 'rf': 0.045, 'rb': 0.046, 'rs': 0.047, 'e': 2.6},
        {'c': elbow + f * 0.170, 'rx': 0.039, 'rf': 0.039, 'rb': 0.040, 'rs': 0.041, 'e': 2.6},
        {'c': wrist - f * 0.022, 'rx': 0.035, 'rf': 0.034, 'rb': 0.035, 'rs': 0.036, 'e': 2.5},
    ], 'Shell', segs=16, n=6, cap0=0.008, cap1=0.006, cap_rings=1, angle=45)
    p.append(tint(fa, 'armour'))
    fout = f.cross(Vector((0, -1, 0))).normalized()
    if fout.x < 0:
        fout = -fout
    p.append(tint(_plate('ForearmLine_L', elbow + f * 0.115 + fout * 0.045, fout, -f, (0.005, 0.0025, 0.15), 'Shell',
                         corner=0.002, onto=[fa]), 'white'))
    back = (Y - f * f.dot(Y)).normalized()
    p.append(_plate('ForearmLight_L', wrist - f * 0.050 + back * 0.036, back, -f, (0.012, 0.003, 0.007), 'Light',
                    corner=0.002, onto=[fa]))
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


# --- the two heads, in the human head's space (scaled with it), each at most 2,500 triangles ------------------------
def _pole_dome(name, prof, z0f, ztop, nz, segs, material, off=0.0, lip=0.0):
    """A dome over a profile whose rim height varies round the head (z0f(a)), closed at a pole at ztop. lip > 0 turns
    the rim in by that much, so its edge reads as a thick shell."""
    rows, cents = [], []
    angs = [TAU * j / segs for j in range(segs)]
    if lip:
        rows.append([prof.point(z0f(a) + 0.002, a, off - lip) for a in angs])
        cents.append(Vector((0, prof.at(z0f(FRONT))[1], z0f(FRONT))))
    for i in range(nz):
        t = i / nz
        t = 1 - (1 - t) ** 1.5                         # rings closer near the crown, where it curves most
        rows.append([prof.point(z0f(a) + (ztop - z0f(a)) * t * 0.985, a, off) for a in angs])
        cents.append(Vector((0, prof.at(z0f(FRONT))[1], z0f(FRONT) + (ztop - z0f(FRONT)) * t)))
    pole = Vector((0, prof.at(ztop)[1], ztop + off * 0.5))
    return skin(name, rows, material, cents, None, pole, angle=50)


def _patch(name, prof, zs, angs, off, material, angle=60):
    """A one-sided surface on a profile over the given heights and angles (non-uniform, so detail goes where it's
    needed), facing out."""
    bm = bmesh.new()
    R = [[bm.verts.new(prof.point(z, a, off)) for a in angs] for z in zs]
    for i in range(len(zs) - 1):
        for j in range(len(angs) - 1):
            bm.faces.new((R[i][j], R[i][j + 1], R[i + 1][j + 1], R[i + 1][j]))
    bm.normal_update()
    zc = zs[len(zs) // 2]
    c = Vector((0, prof.at(zc)[1], zc))
    if sum(f.normal.dot(f.calc_center_median() - c) for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return finish(bm, name, material, True, angle, recalc=False)


def _frame3(prof, z, a, dz=0.002, da=0.01):
    """(along the ring, normal out, up the surface) at a point of a profile, curving with it in height too."""
    p = prof.point(z, a)
    ta = (prof.point(z, a + da) - prof.point(z, a - da)).normalized()
    tz = (prof.point(z + dz, a) - prof.point(z - dz, a)).normalized()
    n = tz.cross(ta).normalized()
    c = Vector((0, prof.at(z)[1], z))
    if n.dot(p - c) < 0:
        n = -n
    up = ta.cross(n).normalized()
    if up.z < 0:
        up = -up
    return p, ta, n, up


def _head(prof, zs, ks, back_steps, face_name, face_key):
    """A head on one profile in two pieces that meet edge to edge: the face over the front (ks: its columns from the
    middle out, in radians) and the dark hood round the rest, open at the top (the helmet closes over it)."""
    angs = [FRONT - k for k in reversed(ks[1:])] + [FRONT + k for k in ks]
    face = tint(_patch(face_name, prof, zs, angs, 0.0, 'Gloss'), face_key)
    half = ks[-1]
    back = [FRONT + half + (TAU - 2 * half) * i / back_steps for i in range(back_steps + 1)]
    return [face, _patch('Hood', prof, zs, back, 0.0, 'Joint')]


def _brim(name, prof, z_at, half, length, tilt, thick, material, na=12):
    """A peak standing out of a helmet's front: from z_at(a) on the profile, out and up at tilt (radians)."""
    go, gi = [], []
    for t in (0.0, 0.45, 1.0):
        ro, ri = [], []
        for j in range(na + 1):
            a = FRONT - half + 2 * half * j / na
            c, ta, n, up = _frame3(prof, z_at(a), a)
            d = (n * math.cos(tilt) + Vector((0, 0, 1)) * math.sin(tilt)).normalized()
            w = d.cross(ta).normalized()
            if w.z < 0:
                w = -w
            edge = 1.0 - 0.35 * (abs(j - na / 2) / (na / 2)) ** 3        # the peak is shorter at its ends
            q = c + d * (length * t * edge)
            ro.append(q + w * thick * 0.5)
            ri.append(q - w * thick * 0.5)
        go.append(ro)
        gi.append(ri)
    return slab(name, go, gi, material, angle=45)


SKULL_IN = Profile2([(z, cy, rx * 0.97, rf * 0.97, rb * 0.97, e) for z, cy, rx, rf, rb, e in SKULL.r])
HELM_V = Profile2([
    (1.488, 0.012, 0.070, 0.078, 0.086, 2.8),
    (1.515, 0.012, 0.081, 0.089, 0.097, 3.0),
    (1.545, 0.012, 0.089, 0.098, 0.105, 3.1),
    (1.580, 0.012, 0.092, 0.103, 0.108, 3.2),
    (1.630, 0.012, 0.093, 0.105, 0.109, 3.2),
    (1.672, 0.012, 0.088, 0.099, 0.105, 3.0),
    (1.700, 0.012, 0.076, 0.085, 0.093, 2.7),
    (1.716, 0.012, 0.056, 0.062, 0.069, 2.3),
    (1.724, 0.012, 0.030, 0.034, 0.037, 2.0),
])
# (its back drawn in, so the hood stays inside the helmet: the human head's crown would poke through it)
MASK = Profile2([(z, cy + 0.010, rx * 0.97, rf * 0.90, rb * 0.88, e) for z, cy, rx, rf, rb, e in HEAD.r], head_dr, 1.0)


def robot_head_visor():
    """After his pictures: a glossy black helmet with a big dark visor, the team's block on its brow with a light,
    a grey module on its right side, and under the visor a pale face mask with the team's glowing mouth."""
    zs = [1.468, 1.478, 1.488, 1.497, 1.505, 1.513, 1.522, 1.532, 1.543, 1.554, 1.565, 1.577, 1.590]
    p = _head(MASK, zs, [0.0, 0.11, 0.24, 0.38, 0.55, 0.74, 0.95], 12, 'FaceMask', 'mask')
    rim = lambda a: 1.492 + 0.064 * gauss(angd(a, FRONT), 0.62)
    p.append(tint(_pole_dome('Helmet', HELM_V, rim, 1.724, 12, 36, 'Gloss', lip=0.007), 'black'))
    p.append(tint(panel('VisorFrame', HELM_V, 1.554, 1.680, FRONT - 1.10, FRONT + 1.10, 0.0, 0.005, 3, 18, 'Gloss',
                        inset=0.3, inner=False), 'plate'))
    p.append(panel('Visor', HELM_V, 1.559, 1.675, FRONT - 1.04, FRONT + 1.04, 0.001, 0.008, 3, 18, 'Visor',
                   inset=0.35, bulge=0.003, inner=False))
    up_lip = lambda a: 1.5135 - 0.0075 * (angd(a, FRONT) / 0.30) ** 2
    lo_lip = lambda a: 1.4985 + 0.0055 * (angd(a, FRONT) / 0.30) ** 2
    p.append(panel('Mouth', MASK, lo_lip, up_lip, FRONT - 0.30, FRONT + 0.30, 0.0015, 0.0025, 2, 8, 'TeamGlow',
                   inset=0.5, inner=False))
    c, ta, n, up = _frame3(HELM_V, 1.702, FRONT)
    bc = c + n * 0.010
    p.append(rbox('HelmetBlock', bc, (0.066, 0.022, 0.058), 'TeamPaint', bevel=0.007, segs=2, basis=(ta, n, up)))
    p.append(rbox('HelmetLight', bc + n * 0.013 + up * 0.012, (0.022, 0.008, 0.013), 'Light', bevel=0.002, segs=1,
                  basis=(ta, n, up)))
    t, n, up = surface_basis(HELM_V, 1.612, math.pi)
    mc = HELM_V.point(1.612, math.pi, 0.0) + n * 0.012
    p.append(tint(rbox('EarModule', mc, (0.078, 0.026, 0.062), 'Gloss', bevel=0.008, segs=2, basis=(t, n, up)),
                  'plate'))
    p.append(rbox('EarLight', mc + n * 0.013 - t * 0.022, (0.012, 0.003, 0.006), 'Light', bevel=0.0, segs=1,
                  basis=(t, n, up)))
    p.append(cyl('NeckSocket', (0, 0.010, 1.470), (0, 0.010, 1.492), 0.046, 'Joint', segs=16, r1=0.050))
    return p


def face_dr(z, a):
    """The human head's nose, brow, eyes, cheeks, lips and chin (bot2), a little sharper: a calm synthetic face."""
    d = 1.15 * head_dr(z, a)
    d += bump(z, a, 1.553, FRONT, 0.016, 0.085, 0.006)       # a straighter, finer nose
    d += bump(z, a, 1.606, FRONT, 0.010, 0.70, 0.003)        # brow
    d -= bump(z, a, 1.530, FRONT - 0.42, 0.014, 0.14, 0.003)  # under the cheekbones
    d -= bump(z, a, 1.530, FRONT + 0.42, 0.014, 0.14, 0.003)
    return d


FACE = Profile2([(z, cy + 0.006, rx * 0.98, rf * 0.93, rb, e) for z, cy, rx, rf, rb, e in HEAD.r], face_dr, 1.0)
HELM_W = Profile2([
    (1.540, 0.012, 0.089, 0.099, 0.105, 2.5),
    (1.580, 0.012, 0.092, 0.103, 0.108, 2.5),
    (1.630, 0.012, 0.092, 0.104, 0.109, 2.5),
    (1.672, 0.012, 0.086, 0.097, 0.104, 2.4),
    (1.700, 0.012, 0.073, 0.082, 0.091, 2.3),
    (1.716, 0.012, 0.053, 0.059, 0.065, 2.2),
    (1.724, 0.012, 0.029, 0.032, 0.035, 2.0),
])


def robot_head_face():
    """After his pictures: a pale synthetic face with a dark band across the eyes and the team's glowing eyes, under
    a white helmet with its peak up, dark ear cups with the team's discs, and a dark hood round the rest."""
    zs = [1.468, 1.479, 1.489, 1.498, 1.506, 1.514, 1.523, 1.533, 1.543, 1.552, 1.561, 1.570, 1.579, 1.588, 1.597,
          1.607, 1.619, 1.632, 1.646]
    p = _head(FACE, zs, [0.0, 0.07, 0.15, 0.24, 0.34, 0.45, 0.58, 0.73, 0.90, 1.08, 1.26], 10, 'Face', 'face')
    p.append(panel('EyeBand', FACE, 1.581, 1.604, FRONT - 0.98, FRONT + 0.98, 0.0015, 0.003, 2, 14, 'Joint',
                   inset=0.5, inner=False))
    for sx in (1, -1):
        c, ta, n, up = _frame3(FACE, 1.592, FRONT + sx * 0.37)
        p.append(rbox('Eye%d' % (sx > 0), c + n * 0.0060, (0.016, 0.003, 0.0065), 'TeamGlow', bevel=0.0, segs=1,
                      basis=(ta, n, up)))
    rim = lambda a: 1.562 + 0.080 * gauss(angd(a, FRONT), 0.90)
    p.append(tint(_pole_dome('Helmet', HELM_W, rim, 1.724, 10, 32, 'Gloss', lip=0.007), 'white'))
    # a dark trim round the helmet's edge, so it reads as a hard shell over the face
    p.append(tint(panel('HelmetTrim', HELM_W, lambda a: rim(a) + 0.001, lambda a: rim(a) + 0.011, 0.0, TAU, 0.0, 0.004,
                        1, 32, 'Gloss', inset=0.3, wrap=True, inner=False), 'armour'))
    for sx, nm in ((1, 'L'), (-1, 'R')):
        c = Vector((sx * 0.086, 0.014, 1.585))
        p.append(cyl('EarCup_' + nm, c, c + Vector((sx * 0.024, 0, 0)), 0.036, 'Joint', segs=16, r1=0.033))
        p.append(cyl('EarDisc_' + nm, c + Vector((sx * 0.023, 0, 0)), c + Vector((sx * 0.027, 0, 0)), 0.024,
                     'TeamPaint', segs=16))
    p.append(cyl('NeckSocket', (0, 0.010, 1.470), (0, 0.010, 1.492), 0.046, 'Joint', segs=16, r1=0.050))
    return p


ROBOT_HEADS = (('Head_Visor', robot_head_visor), ('Head_Face', robot_head_face))


# The robot has no Hard parts any more, so bot14's smoothing of the glove's Hard strap has nothing to do on it.
if not getattr(smooth_hand_hard, 'v19', False):
    _smooth_hand_hard_v14 = smooth_hand_hard


def smooth_hand_hard(objs, rig):
    m = bpy.data.materials.get('Hard')
    if m is None or not any(s.material == m for o in objs for s in o.material_slots):
        return
    _smooth_hand_hard_v14(objs, rig)


smooth_hand_hard.v19 = True


# The robot's paint: a clean satin finish with faint scuffs (the v4 robot's worn chips read as dirt on the sleek suit).
if not getattr(make_textures, 'v19', False):
    _make_textures_v9 = make_textures


def make_textures():
    out = _make_textures_v9()
    scuff = _periodic_noise(TEX, 120, 7)
    lum = 1.0 - 0.035 * scuff
    rough = 0.40 + 0.08 * scuff
    orm = np.stack([np.ones_like(rough), rough, np.zeros_like(rough)], -1)
    out['Shell'] = (_image('tex_satin_col', np.repeat(lum[..., None], 3, -1)),
                    _image('tex_satin_nrm', _normal_from_height(scuff * 0.12, 3.0), True),
                    _image('tex_satin_orm', orm, True))
    out['TeamPaint'] = (None, out['Shell'][1], None)
    return out


make_textures.v19 = True

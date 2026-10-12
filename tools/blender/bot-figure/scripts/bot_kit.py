
# Plate carrier, pouches, belt and holster; then the high-cut helmet head. Run after bot_body.py.
FRONT = math.pi / 2
BACK = 3 * math.pi / 2
PLATE_HALF = 0.80


def plate_top(a, centre, drop, back=False):
    # flat across the middle, rising slightly to the straps, then the shooter's cut chamfers the corners
    u = abs((a - (BACK if back else FRONT)) / PLATE_HALF)
    z = centre + 0.014 * min(u / 0.6, 1.0)
    if u > 0.62:
        z -= drop * (u - 0.62) / 0.38
    return z


def vest():
    parts = []
    ztop_f = lambda a: plate_top(a, 1.348, 0.06)
    parts.append(panel('PlateFront', TORSO, 1.045, ztop_f, FRONT - PLATE_HALF, FRONT + PLATE_HALF, 0.010, 0.032, 8, 14,
                       'TeamColour', inset=0.45, bulge=0.004))
    ztop_b = lambda a: plate_top(a, 1.375, 0.045, back=True)
    parts.append(panel('PlateBack', TORSO, 1.04, ztop_b, BACK - PLATE_HALF, BACK + PLATE_HALF, 0.010, 0.032, 8, 14,
                       'TeamColour', inset=0.45, bulge=0.004))
    parts.append(panel('Cummer_L', TORSO, 1.06, 1.20, BACK + PLATE_HALF - 0.1 - TAU, FRONT - PLATE_HALF + 0.1, 0.012,
                       0.016, 3, 8, 'TeamColour', inset=0.35))
    parts.append(panel('Cummer_R', TORSO, 1.06, 1.20, FRONT + PLATE_HALF - 0.1, BACK - PLATE_HALF + 0.1, 0.012,
                       0.016, 3, 8, 'TeamColour', inset=0.35))
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
        rings = [{'c': p, 'rx': 0.030, 'rf': 0.009, 'rb': 0.006, 'e': 3.5, 'hint': h} for p, h in path]
        parts.append(loft(nm, rings, 'TeamColour', segs=10, angle=40))
    return parts


def pouches():
    parts = []
    for i, da in enumerate((-0.40, 0.0, 0.40)):
        a = FRONT + da
        z = 1.115
        po = on_surface('MagPouch%d' % i, TORSO, z, a, 0.040, (0.078, 0.036, 0.115), 'Gear', bevel=0.007)
        parts.append(po)
        t, n, up = surface_basis(TORSO, z, a)
        base = TORSO.point(z, a, 0.040) + n * 0.018
        parts.append(rbox('Mag%d' % i, base + up * 0.075 + n * 0.0, (0.064, 0.026, 0.06), 'Hard', bevel=0.004,
                          basis=(t, n, up)))
        parts.append(rbox('MagTab%d' % i, base + up * 0.108 + n * 0.002, (0.03, 0.03, 0.008), 'Gear', bevel=0.003,
                          segs=1, basis=(t, n, up)))
    a = FRONT
    z = 1.235
    parts.append(on_surface('AdminPouch', TORSO, z, a, 0.040, (0.17, 0.03, 0.085), 'Gear', bevel=0.008))
    t, n, up = surface_basis(TORSO, z, a)
    parts.append(rbox('TeamPatch', TORSO.point(z + 0.005, a, 0.040) + n * 0.032, (0.075, 0.006, 0.045), 'TeamColour',
                      bevel=0.003, segs=1, basis=(t, n, up)))
    a = BACK + PLATE_HALF + 0.02 - TAU
    z = 1.14
    parts.append(on_surface('RadioPouch', TORSO, z, a, 0.028, (0.065, 0.04, 0.12), 'Gear', bevel=0.008))
    t, n, up = surface_basis(TORSO, z, a)
    rp = TORSO.point(z, a, 0.028) + n * 0.02
    parts.append(rbox('Radio', rp + up * 0.072, (0.055, 0.032, 0.04), 'Hard', bevel=0.005, basis=(t, n, up)))
    parts.append(cyl('Antenna', rp + up * 0.09 + t * 0.012, rp + up * 0.30 + t * 0.012 + Vector((0, 0.02, 0)), 0.005,
                     'Hard', segs=6, r1=0.0035))
    parts.append(panel('Hydration', TORSO, 1.085, 1.345, BACK - 0.40, BACK + 0.40, 0.040, 0.016, 4, 8, 'Gear',
                       inset=0.6, bulge=0.022))
    # drag handle at the top of the back plate
    t, n, up = surface_basis(TORSO, 1.37, BACK)
    parts.append(rbox('DragHandle', TORSO.point(1.37, BACK, 0.040) + n * 0.008, (0.07, 0.014, 0.022), 'Gear',
                      bevel=0.005, segs=1, basis=(t, n, up)))
    # webbing rows (the loops pouches thread through) on the cummerbund and the back plate's sides
    rows = []
    for k, z in enumerate((1.085, 1.125, 1.165)):
        for nm, a0, a1 in (('L', -0.62, 0.55), ('R', math.pi - 0.55, math.pi + 0.62)):
            rows.append(panel('Web%s%d' % (nm, k), TORSO, z, z + 0.022, a0, a1, 0.027, 0.003, 1, 6, 'Gear', inset=0.0,
                              inner=False))
        for nm, a0, a1 in (('BL', BACK + 0.42, BACK + 0.82), ('BR', BACK - 0.82, BACK - 0.42)):
            rows.append(panel('Web%s%d' % (nm, k), TORSO, z, z + 0.022, a0, a1, 0.0425, 0.003, 1, 3, 'Gear',
                              inset=0.0, inner=False))
    parts.append(join('Webbing', rows))
    return parts


def belt():
    parts = []
    parts.append(panel('Belt', TORSO, 0.985, 1.035, 0.0, TAU, 0.004, 0.016, 2, 28, 'Gear', inset=0.3, wrap=True))
    t, n, up = surface_basis(TORSO, 1.01, FRONT)
    parts.append(rbox('Buckle', TORSO.point(1.01, FRONT, 0.02) + n * 0.004, (0.06, 0.012, 0.045), 'Hard', bevel=0.004,
                      basis=(t, n, up)))
    a = math.pi + 0.15
    t, n, up = surface_basis(TORSO, 0.97, a)
    hp = TORSO.point(0.97, a, 0.022) + n * 0.03
    parts.append(rbox('Holster', hp - up * 0.05, (0.05, 0.05, 0.17), 'Hard', bevel=0.01, basis=(t, n, up),
                      taper=(1.25, 1.0)))
    parts.append(rbox('PistolGrip', hp + up * 0.055 - t * 0.012, (0.03, 0.03, 0.07), 'Hard', bevel=0.006,
                      basis=(t, n, (up + t * 0.25).normalized())))
    a = BACK + 0.55 - TAU
    parts.append(on_surface('DumpPouch', TORSO, 0.95, a, 0.022, (0.12, 0.05, 0.13), 'Gear', bevel=0.02,
                            taper=(1.0, 1.25)))
    return parts


def head():
    parts = []
    parts.append(HEAD.loft('Balaclava', 'Fabric', 1.47, 1.66, 8, 18, cap0=False, cap1=True, cap_bulge=(0, 0.02)))
    zb = lambda a: 1.6075 + 0.0325 * math.sin(a) + 0.0175 * math.cos(a) ** 2 + (-0.006 if math.sin(a) < 0 else 0.0)
    top = 1.705
    parts.append(panel('Helmet', HEAD, zb, top, 0.0, TAU, 0.014, 0.011, 6, 28, 'TeamColour', inset=0.0, wrap=True,
                       angle=50, inner=False))
    c = HEAD.at(top)
    parts.append(loft('HelmetCrown', [{'c': (0, c[1], top), 'rx': c[2] + 0.025, 'rf': c[3] + 0.025, 'rb': c[4] + 0.025},
                                      {'c': (0, c[1], top + 0.010), 'rx': c[2] + 0.013, 'rf': c[3] + 0.013,
                                       'rb': c[4] + 0.013, 'cap': 0.006}],
                      'TeamColour', segs=28, cap0=False, angle=50))
    parts.append(panel('HelmetRim', HEAD, lambda a: zb(a) - 0.002, lambda a: zb(a) + 0.008, 0.0, TAU, 0.012, 0.016, 1,
                       28, 'Hard', inset=0.2, wrap=True))
    for nm, a0, a1 in (('Rail_L', -0.75, 0.55), ('Rail_R', math.pi - 0.55, math.pi + 0.75)):
        parts.append(panel(nm, HEAD, lambda a: zb(a) + 0.008, lambda a: zb(a) + 0.024, a0, a1, 0.024, 0.009, 1, 6,
                           'Hard', inset=0.2, inner=False))
    t, n, up = surface_basis(HEAD, 1.665, FRONT)
    parts.append(rbox('Shroud', HEAD.point(1.665, FRONT, 0.026) + n * 0.004, (0.05, 0.012, 0.03), 'Hard', bevel=0.004,
                      segs=1, basis=(t, n, up)))
    parts.append(panel('Counterweight', HEAD, 1.592, 1.640, BACK - 0.45, BACK + 0.45, 0.025, 0.018, 1, 6, 'Gear',
                       inset=0.4, inner=False))
    parts.append(panel('Velcro', HEAD, 1.668, 1.697, FRONT - 0.5, FRONT + 0.5, 0.0255, 0.003, 1, 5, 'Gear', inset=0.2,
                       inner=False))
    for sx, nm in ((1, 'EarCup_L'), (-1, 'EarCup_R')):
        p = Vector((sx * 0.082, 0.008, 1.585))
        parts.append(cyl(nm, p, p + Vector((sx * 0.032, 0, 0)), 0.038, 'Hard', segs=12, r1=0.033, hint=(0, -1, 0)))
    m0 = Vector((0.098, -0.03, 1.565))
    parts.append(loft('Mic', [{'c': m0, 'rx': 0.004}, {'c': (0.092, -0.07, 1.545), 'rx': 0.004},
                              {'c': (0.06, -0.105, 1.535), 'rx': 0.004},
                              {'c': (0.035, -0.112, 1.535), 'rx': 0.008, 'cap': 0.006}], 'Hard', segs=6, hint=(0, 0, 1)))
    gz0, gz1 = 1.585, 1.628
    ga0, ga1 = FRONT - 1.0, FRONT + 1.0
    parts.append(panel('GoggleFrame', HEAD, gz0, gz1, ga0, ga1, 0.010, 0.018, 2, 12, 'Hard', inset=0.3, bulge=0.004,
                       inner=False))
    parts.append(panel('GoggleLens', HEAD, gz0 + 0.005, gz1 - 0.004, ga0 + 0.08, ga1 - 0.08, 0.026, 0.008, 1, 12, 'Lens',
                       inset=0.3, bulge=0.004, inner=False))
    parts.append(panel('GoggleStrap', HEAD, 1.598, 1.618, ga1 - 0.05, ga0 + TAU + 0.05, 0.026, 0.004, 1, 14, 'Gear',
                       inset=0.0, inner=False))
    mz0, mz1 = 1.478, 1.582
    ma0, ma1 = FRONT - 1.15, FRONT + 1.15
    parts.append(panel('MeshMask', HEAD, mz0, mz1, ma0, ma1, 0.012, 0.006, 4, 12, 'Hard', inset=0.0, inner=False))
    parts.append(panel('MaskEdgeTop', HEAD, mz1 - 0.008, mz1 + 0.002, ma0, ma1, 0.012, 0.010, 1, 12, 'Gear', inset=0.3,
                       inner=False))
    parts.append(panel('MaskEdgeLow', HEAD, mz0 - 0.002, mz0 + 0.008, ma0, ma1, 0.012, 0.010, 1, 12, 'Gear', inset=0.3,
                       inner=False))
    # the mesh: raised bars across the mask face
    bars = []
    for i in range(4):
        z = mz0 + 0.024 + i * 0.019
        bars.append(panel('MaskBar%d' % i, HEAD, z - 0.0015, z + 0.0015, ma0 + 0.1, ma1 - 0.1, 0.0175, 0.0018, 1, 10,
                          'Hard', inset=0.0, inner=False))
    parts.append(join('MaskBars', bars))
    return parts


def kit():
    return vest() + pouches() + belt()

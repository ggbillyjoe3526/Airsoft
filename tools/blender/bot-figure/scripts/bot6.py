# --- v4 heads: the bump helmet, the balaclava and the full-face visor, alongside the high-cut helmet ---
# Every head shares the balaclava (no bare faces); each is joined into its own object, Head_<Name>, and the game shows
# one per figure. All are built in the same place as the high-cut head, so they fit the same neck and gaiter.
HEAD_KEEP = ('Balaclava', 'GoggleFrame', 'GoggleLens', 'GoggleStrap', 'MeshMask', 'MaskEdgeTop', 'MaskEdgeLow',
             'MaskBars')


def _head_base(keep=HEAD_KEEP):
    """The shared pieces from the high-cut head (balaclava, goggles, mesh mask); the helmet and headset removed."""
    out = []
    for o in head():
        base = o.name.split('.')[0]
        if base in keep:
            out.append(o)
        else:
            bpy.data.objects.remove(o, do_unlink=True)
    return out


BALA_ZS = [1.468, 1.476, 1.487, 1.5, 1.514, 1.53, 1.546, 1.562, 1.578, 1.596, 1.62, 1.645, 1.668, 1.687, 1.700]


def _full_balaclava(parts):
    """The high-cut head's balaclava stops under the helmet and is closed by a cone; a head without a helmet needs the
    real crown, so rebuild it through the top of the head and close it with a low dome."""
    for o in list(parts):
        if o.name.split('.')[0] == 'Balaclava':
            parts.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
    parts.insert(0, HEAD.loft('Balaclava', 'Fabric', 0, 0, 0, 16, cap0=False, cap1=True, cap_bulge=(0, 0.006),
                              zs=BALA_ZS))
    return parts


def _rename(o, name):
    o.name = name
    o.data.name = name
    return o


def head_bump():
    """A vented bump helmet over the balaclava: a rounder shell cut above the ears, two rows of vent slots, short side
    rails, a front shroud and the retention dial at the back; goggles and mesh mask as the high-cut head."""
    parts = _head_base()
    H = HEAD.view(0.0)
    zb = lambda a: 1.612 + 0.028 * math.sin(a) + 0.010 * math.cos(a) ** 2 + (-0.004 if math.sin(a) < 0 else 0.0)
    top = 1.708
    parts.append(_rename(panel('BumpShell', H, zb, top, 0.0, TAU, 0.016, 0.010, 5, 24, 'TeamColour', inset=0.0,
                               wrap=True, angle=60, inner=False), 'BumpShell'))
    c = H.at(top)
    parts.append(tube('BumpCrown', [{'c': (0, c[1], top), 'rx': c[2] + 0.026, 'rf': c[3] + 0.026, 'rb': c[4] + 0.026},
                                    {'c': (0, c[1], top + 0.004), 'rx': c[2] + 0.023, 'rf': c[3] + 0.023,
                                     'rb': c[4] + 0.023}],
                      'TeamColour', segs=24, n=2, hint=(0, -1, 0), cap1=0.011, cap_rings=1, angle=60))
    parts.append(panel('BumpRim', H, lambda a: zb(a) - 0.002, lambda a: zb(a) + 0.007, 0.0, TAU, 0.014, 0.014, 1, 24,
                       'Hard', inset=0.3, wrap=True, inner=False))
    for nm, a0, a1 in (('BumpRail_L', -0.55, 0.35), ('BumpRail_R', math.pi - 0.35, math.pi + 0.55)):
        parts.append(panel(nm, H, lambda a: zb(a) + 0.007, lambda a: zb(a) + 0.021, a0, a1, 0.026, 0.008, 1, 6,
                           'Hard', inset=0.25, inner=False))
    t, n, up = surface_basis(H, 1.664, FRONT)
    parts.append(rbox('BumpShroud', H.point(1.664, FRONT, 0.028) + n * 0.004, (0.046, 0.010, 0.026), 'Hard',
                      bevel=0.004, segs=1, basis=(t, n, up)))
    vents = []
    for z, angles in ((1.676, (FRONT - 0.42, FRONT + 0.42, BACK - 0.5, BACK + 0.5)), (1.660, (0.15, math.pi - 0.15))):
        for a in angles:
            vt, vn, vu = surface_basis(H, z, a)
            vents.append(rbox('Vent', H.point(z, a, 0.0265) + vn * 0.002, (0.026, 0.004, 0.008), 'Hard', bevel=0.0018,
                              segs=1, basis=(vt, vn, vu)))
    parts.append(join('BumpVents', vents))
    t, n, up = surface_basis(H, 1.592, BACK)
    p = H.point(1.592, BACK, 0.012)
    parts.append(cyl('BumpDial', p, p + n * 0.012, 0.016, 'Hard', segs=10, r1=0.014))
    parts.append(panel('BumpHarness', H, 1.586, 1.598, BACK - 1.2, BACK + 1.2, 0.008, 0.004, 1, 10, 'Gear',
                       inset=0.0, inner=False))
    return parts


def head_balaclava():
    """The balaclava on its own, with the goggles and mesh mask; the goggle strap in the team colour so the head
    still reads by team."""
    parts = _full_balaclava(_head_base())
    for o in list(parts):
        if o.name.startswith('GoggleStrap'):          # sized to clear the helmet pads; refit it to the balaclava
            parts.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
    ga0, ga1 = FRONT - 1.0, FRONT + 1.0
    parts.append(panel('GoggleStrap', HEAD.view(0.0), 1.598, 1.618, ga1 - 0.05, ga0 + TAU + 0.05, 0.005, 0.004, 1,
                       16, 'TeamColour', inset=0.0, inner=False))
    return parts


def head_visor():
    """A full-face visor, brow to chin, on side pivots over the balaclava: a team-coloured headband and crown strap
    carry it; the tinted lens has a dark trim along its edges."""
    parts = _full_balaclava(_head_base(('Balaclava',)))
    G = HEAD_SMOOTH
    H = HEAD.view(0.0)
    vz0, vz1 = 1.468, 1.648
    va0, va1 = FRONT - 1.22, FRONT + 1.22
    parts.append(panel('VisorLens', G, vz0, vz1, va0, va1, 0.034, 0.004, 6, 16, 'Lens', inset=0.0, bulge=0.010,
                       inner=False))
    parts.append(panel('VisorTrimTop', G, vz1 - 0.004, vz1 + 0.006, va0, va1, 0.034, 0.008, 1, 16, 'Hard',
                       inset=0.3, bulge=0.0, inner=False))
    parts.append(panel('VisorTrimLow', G, vz0 - 0.006, vz0 + 0.004, va0, va1, 0.034, 0.008, 1, 16, 'Hard',
                       inset=0.3, bulge=0.0, inner=False))
    parts.append(panel('VisorBand', H, 1.628, 1.652, 0.0, TAU, 0.006, 0.006, 1, 24, 'TeamColour', inset=0.2,
                       wrap=True, inner=False))
    crown = max(v.co.z for v in parts[0].data.vertices)
    cy = H.at(1.64)[1]
    arc = [H.point(1.646, FRONT, 0.010), H.point(1.664, FRONT, 0.010), Vector((0, cy, crown + 0.008)),
           H.point(1.664, BACK, 0.010), H.point(1.646, BACK, 0.010)]
    parts.append(tube('VisorStrap', [{'c': p, 'rx': 0.0032, 'rs': 0.0032, 'rf': 0.011, 'rb': 0.011} for p in arc],
                      'TeamColour', segs=8, n=8, hint=(1, 0, 0), cap0=0.0, cap1=0.0, cap_rings=1, angle=50))
    for sx, nm in ((1, 'VisorPivot_L'), (-1, 'VisorPivot_R')):
        a = 0.0 if sx > 0 else math.pi
        p = G.point(1.600, a, 0.034)
        t, n, up = surface_basis(G, 1.600, a)
        parts.append(cyl(nm, p - n * 0.004, p + n * 0.008, 0.017, 'Hard', segs=10, r1=0.014))
        parts.append(panel(nm + 'Arm', H, 1.596, 1.640, a - 0.12, a + 0.12, 0.010, 0.006, 2, 2, 'TeamColour',
                           inset=0.3, inner=False))
    return parts


HEADS_EXTRA = (('Head_Bump', head_bump), ('Head_Balaclava', head_balaclava), ('Head_Visor', head_visor))


def finalise():
    """Build, set the height to 1.73 m (feet on the ground), join into Body, Kit and one object per head, add UVs."""
    b, k, h = build_all()
    objs = b + k + h
    zs = [(o.matrix_world @ Vector(c)).z for o in objs for c in o.bound_box]
    lo, hi = min(zs), max(zs)
    s = FIGURE_HEIGHT / (hi - lo)
    m = Matrix.Scale(s, 4) @ Matrix.Translation((0, 0, -lo))
    hm = Matrix.Translation(HEAD_TOP) @ Matrix.Scale(HEAD_SCALE, 4) @ Matrix.Translation(-HEAD_TOP)
    heads = [('Head_HighCut', h)]
    for name, fn in HEADS_EXTRA:
        parts = fn()
        for o in parts:
            o.data.transform(hm)
        heads.append((name, parts))
    for o in objs + [o for _, ps in heads[1:] for o in ps]:
        o.data.transform(m)
    out = [join('Body', b), join('Kit', k)] + [join(name, ps) for name, ps in heads]
    for o in out:
        for p in bpy.context.selected_objects:
            p.select_set(False)
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
        bpy.ops.object.mode_set(mode='OBJECT')
    return out, s

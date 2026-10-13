# --- v12 heads (Dev 6, owner 2026-10-13: "create a few different heads for the human model") ----------------------
# Four looks a site sees on any game day, each with eye protection (always worn in airsoft) and a team marker:
#   Head_HighCut  the high-cut helmet, ear defenders, wrap glasses and steel mesh mask (bot20)
#   Head_Cap      a ball cap with the team patch on its front, a comms headset over it, full-seal goggles and the
#                 mesh mask
#   Head_Boonie   a camouflage boonie hat with the team band round its crown, wrap glasses and a sand check scarf
#                 over the nose and neck
#   Head_FullCut  a full-cut helmet in a camouflage cover with the team band round it, full-seal goggles and the
#                 balaclava, its chin harness
# Each is built on its own copy of the balaclava, in the same build space as bot20's head, and skinned whole to Head.
# The game picks one per figure by its id (figureRig.ts parts.human.head); each stays under the 2,500-triangle head
# budget, so the figure's own budget (body, kit and the largest head) holds whichever it wears.
import bpy, bmesh, math
from mathutils import Vector, Matrix

B = bpy.app.driver_namespace['bot']

HEAD_ORDER = ('Head_HighCut', 'Head_Cap', 'Head_Boonie', 'Head_FullCut')
SURF_COL.update({'Canvas': 0x5b5a43, 'Shemagh': 0xb5a079})


def _az(th):
    """|azimuth| in degrees, 0 front to 180 back."""
    return abs(((math.degrees(th) + 180) % 360) - 180)


def _dir(th, el):
    """The direction at azimuth th (0 front, +pi/2 the figure's left) and elevation el (radians)."""
    return Vector((math.sin(th) * math.cos(el), -math.cos(th) * math.cos(el), math.sin(el)))


def _bal_copy(bal, tag):
    out = []
    for o in bal:
        c = o.copy()
        c.data = o.data.copy()
        c.name = '%s_%s' % (o.name, tag)
        for col in o.users_collection:
            col.objects.link(c)
        out.append(c)
    return out


def _outermost(tree, c, d, reach=0.3):
    """The outermost surface along d from c: cast back in from outside."""
    hit, n, i, dist = tree.ray_cast(c + d * reach, -d)
    return hit


def _drop_covered(bal, shells, margin=0.012):
    """Delete the balaclava faces a hat or helmet hides: each corner, and the point `margin` below it, lies under the
    shell seen from inside the head. Saves triangles, and no cloth pokes through between the shell's samples."""
    tree = bvh(shells)

    def under(p):
        d = p - HEAD_IN
        return tree.ray_cast(HEAD_IN, d.normalized(), 0.3)[0] is not None
    for o in bal:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        hid = {v for v in bm.verts if under(v.co) and under(v.co - Vector((0.0, 0.0, margin)))}
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v in hid for v in f.verts)], context='FACES')
        bm.to_mesh(o.data)
        bm.free()
        o.data.update()


# --- full-seal goggles: a lens, a frame that seals onto the face, a strap round the head (under any hat or helmet) ---
GOG_C = Vector((0.0, 0.004, 1.603))


def gog_pt(u, v, off=0.0):
    a = math.radians(-74 + 148 * u)
    x = (0.094 + off) * math.sin(a)
    y = GOG_C.y - (0.136 + off) * (math.cos(a) ** 0.85)
    top = 1.6245 - 0.006 * math.sin(a) ** 2
    bot = 1.5815 + 0.003 * math.sin(a) ** 2 + 0.011 * math.exp(-(a / 0.17) ** 2)     # the nose bridge
    return Vector((x, y, bot + (top - bot) * v))


def goggles(tree, frame='Rubber', tag=''):
    lens = sheet('GoggleLens' + tag, gog_pt, 11, 3, S('Lens'), out_from=GOG_C + Vector((0, 0.05, 0)), angle=70)
    loop = [(k / 8, 1.0) for k in range(9)] + [(k / 8, 0.0) for k in range(8, -1, -1)]

    def grown(eu, ev, off):
        return [gog_pt(0.5 + (u - 0.5) * (1 + eu), 0.5 + (v - 0.5) * (1 + ev), off) for u, v in loop]
    lip_in = grown(0.0, 0.0, 0.0012)
    lip_out = grown(0.05, 0.24, 0.0022)
    back = grown(0.06, 0.28, -0.007)
    seal = []                                     # in onto the face (towards the head's axis), 2 cm at most
    for p in grown(0.05, 0.24, -0.007):
        dr = (Vector((0.0, 0.006, p.z)) - p).normalized()
        hit, n, i, dist = tree.ray_cast(p, dr, 0.02)
        seal.append(hit - dr * 0.0015 if hit is not None else p + dr * 0.02)
    rows = [lip_in, lip_out, back, seal]
    F = lambda u, v: rows[round(v * 3)][round(u * len(loop)) % len(loop)]
    fr = sheet('GoggleFrame' + tag, F, len(loop), 4, S(frame), wrap=True, out_from=GOG_C, angle=55,
               us=[i / len(loop) for i in range(len(loop))], vs=[0, 1 / 3, 2 / 3, 1])
    # the strap from each side of the frame round the back of the head
    sides = [back[0].lerp(back[17], 0.5), back[8].lerp(back[9], 0.5)]
    guide = [sides[0]]
    for k in range(1, 10):
        th = math.radians(-74 - 212 * k / 10)
        guide.append(GOG_C + _dir(th, 0.0) * 0.12 + Vector((0, 0, 0.014 * math.sin(math.pi * k / 10))))
    guide.append(sides[1])
    pts = onto(tree, guide[1:-1], Vector((0.0, 0.006, 1.6)), 0.0016, axis='z')
    pts = [guide[0]] + pts + [guide[-1]]
    strap = strip('GoggleStrap' + tag, pts, [Vector((0, 0, 1))] * len(pts), 0.026, 0.002, S('Elastic'),
                  out=Vector((0.0, 0.006, 1.6)), sides=2)
    return [lens, fr, strap]


# --- Head_Cap ---------------------------------------------------------------------------------------------------------
CAP_C = Vector((0.0, 0.004, 1.600))      # the crown: a dome round this, its radii across, front, back and up
CAP_R = (0.091, 0.112, 0.118, 0.093)
CAP_RIM = [(0, 1.640), (40, 1.636), (75, 1.618), (100, 1.608), (140, 1.600), (180, 1.597)]   # its edge's height


def cap_crown(tree):
    """The crown at (u round from the front, v from the top to the edge): a rounded dome, kept 6 mm clear of the
    balaclava (its flat faces cut inside their corners)."""
    rx, rf, rb, rz = CAP_R

    def F(u, v):
        th = u * TAU
        ph = math.acos(max(-0.99, min(0.99, (keyed(CAP_RIM, _az(th)) - CAP_C.z) / rz))) * v
        ry = rf if math.cos(th) > 0 else rb
        p = CAP_C + Vector((rx * math.sin(ph) * se(math.sin(th), 2.2), -ry * math.sin(ph) * se(math.cos(th), 2.2),
                            rz * math.cos(ph)))
        dr = (p - HEAD_IN).normalized()
        hit, n, i, dist = tree.ray_cast(HEAD_IN, dr)
        if hit is not None and (p - HEAD_IN).length < dist + 0.006:
            p = HEAD_IN + dr * (dist + 0.006)
        return p
    return F


def head_cap_v12(bal, gaiter):
    d = math.radians
    tree = bvh(bal)
    gog = goggles(tree, 'Polymer', '_Cap')
    F = cap_crown(bvh(bal + gog[2:]))             # clear of the goggle strap too, which runs under it
    crown = sheet('CapCrown', F, 20, 0, S('Canvas'), wrap=True, out_from=HEAD_IN, pole0=True,
                  vs=[0.06, 0.3, 0.55, 0.76, 0.91, 1.0], angle=55)
    parts = [crown]

    def brim(u, v):                               # the peak: arched, a little down at its sides
        a = d(-56 + 112 * u)
        s = abs(a) / d(56)
        out = Vector((math.sin(a) * 0.55, -math.cos(a), 0.0)).normalized()
        p0 = F((a / TAU) % 1.0, 1.0) - out * 0.003          # its root just inside the crown
        L = 0.002 + 0.072 * max(0.0, 1 - s ** 2.2) ** 0.6
        return p0 + out * (L * v) - Vector((0, 0, 0.008 * s * s * v + 0.006 * v ** 1.5))   # clear over the goggles
    parts.append(sheet('CapBrim', brim, 11, 3, S('Canvas'), thick=0.0035,
                       out_from=Vector((0.0, -0.12, 1.75)), angle=40))
    # the team patch on the crown's front
    parts.append(sheet('CapTeam', lambda u, v: F(-0.045 + 0.09 * u, 0.48 + 0.3 * v) +
                       _dir(TAU * (-0.045 + 0.09 * u), 0.5) * 0.0012, 4, 3, S('Team'), thick=0.0012,
                       out_from=HEAD_IN, angle=35))
    # the comms headset over the cap: the defenders' cups, a band over the crown, the boom mic
    for sd in 'LR':
        cup = ear_cup(sd)
        parts += cup[:3]
        for o in cup[3:]:                         # no rail adapters without a helmet
            bpy.data.objects.remove(o, do_unlink=True)
    ctree = bvh([crown])
    guide = []
    for k in range(9):
        a = d(-90 + 180 * k / 8)                   # left ear, over the top, right ear (in the cups' plane)
        guide.append(Vector((CUP_C.x + 0.12 * math.sin(a), CUP_C.y + 0.004, CUP_C.z + 0.05 + 0.12 * math.cos(a))))
    pts = []
    for p in guide:
        dr = (p - Vector((0.0, CUP_C.y + 0.004, 1.585))).normalized()
        hit = _outermost(ctree, Vector((0.0, CUP_C.y + 0.004, 1.585)), dr)
        pts.append(hit + dr * 0.004 if hit is not None else p)
    for k, sg in ((0, -1), (-1, 1)):              # the band's ends drop into the cups' tops
        pts[k] = Vector((sg * 0.105, CUP_C.y + 0.004, CUP_C.z + 0.044))
    parts.append(strip('HeadsetBand', pts, [Vector((0, 1, 0))] * len(pts), 0.020, 0.005, S('Rubber'),
                       out=Vector((0.0, CUP_C.y, 1.56)), angle=40))
    parts += boom_mic()
    parts += gog
    parts += mesh_mask(bvh(bal + [gaiter]))
    _drop_covered(bal, [crown])
    _drop_covered(gog[2:], [crown], margin=0.0)   # the strap where the crown hides it
    return bal + parts


# --- Head_Boonie ------------------------------------------------------------------------------------------------------
def _boonie_base(th):
    """The crown's lower edge: tilted up at the front, over the glasses."""
    z = 1.617 + 0.012 * math.cos(th)
    r = (0.094, 0.120 if math.cos(th) > 0 else 0.128)
    return z, r


def boonie_pt(th, s, dz=0.0):
    """On the crown at azimuth th, s its share of the base's radius, dz above the base."""
    z, (rx, ry) = _boonie_base(th)
    e = 2.4
    x = rx * s * se(math.sin(th), e)
    y = 0.006 - ry * s * se(math.cos(th), e)
    return Vector((x, y, z + dz))


def head_boonie_v12(bal, gaiter):
    d = math.radians
    tree = bvh(bal)
    top = 1.700
    rows = [(0.80, 0.0), (0.93, 0.008), (0.965, 0.03), (0.985, 0.06), (1.0, None)]   # (radius share, drop from top)

    def crown(u, v):                              # v: 0 the top ring .. 1 the foot (rows in between, linearly)
        th = u * TAU
        z0 = _boonie_base(th)[0]
        zt = top - 0.004 * math.cos(th)
        at = [(s, z0 if dz is None else zt - dz) for s, dz in rows]
        i = min(int(v * 4), 3)
        f = v * 4 - i
        sh = at[i][0] + (at[i + 1][0] - at[i][0]) * f
        p = boonie_pt(th, sh)
        return Vector((p.x, p.y, at[i][1] + (at[i + 1][1] - at[i][1]) * f))
    parts = [sheet('BoonieCrown', crown, 20, 0, S('Camo'), wrap=True, out_from=Vector((0, 0.006, 1.62)), pole0=True,
                   vs=[0.0, 0.25, 0.5, 0.75, 1.0], angle=50)]
    # the band round the crown's foot: the team colour
    band = [boonie_pt(k / 20 * TAU, 1.012, 0.011) for k in range(20)]
    parts.append(strip('BoonieTeam', band, [Vector((0, 0, 1))] * 20, 0.022, 0.0016, S('Team'), closed=True,
                       out=Vector((0, 0.006, 1.63)), sides=2))

    def brim(u, v):
        th = u * TAU
        p = boonie_pt(th, 1.0)
        out = (p - Vector((0.0, 0.006, p.z))).normalized()
        w = 0.003 * math.sin(4 * th + 0.7) * v
        return p + out * (0.058 * v) - Vector((0, 0, 0.016 * v ** 1.4 - w))
    parts.append(sheet('BoonieBrim', brim, 20, 3, S('Camo'), wrap=True, thick=0.0035,
                       out_from=Vector((0.0, 0.006, 1.80)), angle=45))
    parts += glasses(tree)
    parts += shemagh(bvh(bal + [gaiter]))
    _drop_covered(bal, parts[:1])
    return bal + parts


SHEMAGH_TOP = [(0, 1.583), (40, 1.578), (90, 1.548), (140, 1.522), (180, 1.515)]
SHEMAGH_BOTTOM = [(0, 1.448), (60, 1.460), (120, 1.470), (180, 1.476)]


def shemagh(tree):
    """A scarf wrapped over the nose and round the neck, loose over the mouth and chin, knotted at the nape."""
    def F(u, v):
        th = u * TAU
        a = _az(th)
        z = keyed(SHEMAGH_TOP, a) + (keyed(SHEMAGH_BOTTOM, a) - keyed(SHEMAGH_TOP, a)) * v
        c = Vector((0.0, 0.006, z))
        dr = Vector((math.sin(th), -math.cos(th), 0.0))
        hit = _outermost(tree, c, dr)
        base = hit if hit is not None else c + dr * 0.09
        fold = 0.0035 * math.sin(th * 7 + v * 3.0) * math.sin(math.pi * v)
        hang = 0.012 * math.sin(math.pi * v) * max(0.0, math.cos(th)) ** 2
        return base + dr * (0.006 + hang + fold)
    parts = [sheet('Shemagh', F, 18, 5, S('Shemagh'), wrap=True, out_from=Vector((0.0, 0.006, 1.52)), angle=60)]
    p = F(0.5, 0.45)
    parts.append(pillow('ShemaghKnot', p + Vector((0, 0.008, 0)), (0.036, 0.018, 0.026), S('Shemagh'), bevel=0.008,
                        segs=1, bulge=0.003))
    return parts


# --- Head_FullCut -----------------------------------------------------------------------------------------------------
FULL_RIM = [(0, 1.633), (30, 1.631), (52, 1.618), (70, 1.592), (90, 1.557), (115, 1.556), (145, 1.565), (180, 1.568)]


def _full_ph(th):
    z = keyed(FULL_RIM, _az(th))
    return math.acos(max(-0.99, min(0.99, (z - HC.z) / HA[2])))


def head_fullcut_v12(bal, gaiter):
    d = math.radians
    tree = bvh(bal)
    cols = 24

    def F(u, v):                                  # as bot20's helmet_shell, cut low over the ears
        th = u * TAU
        ph = _full_ph(th)
        if v <= 0.9:
            return shell_pt(th, ph * (0.06 + 0.94 * v / 0.9))
        t = (v - 0.9) / 0.1
        a = math.pi * t
        n = shell_normal(th, ph)
        down = (shell_pt(th, ph + 0.02) - shell_pt(th, ph)).normalized()
        return shell_pt(th, ph) + n * (0.0035 * math.sin(a) - 0.008 * t) + down * 0.004 * math.sin(a)
    rows = [0.0, 0.2, 0.38, 0.54, 0.68, 0.8, 0.88, 0.9, 0.95, 1.0]
    sh = sheet('FullCutShell', F, cols, 0, S('Camo'), wrap=True, out_from=HC, pole0=True, vs=rows,
               mats=lambda i, j: 1 if j >= len(rows) - 4 else 0)
    sh.data.materials.append(S('Elastic'))
    parts = [sh]
    # the team band round the cover (lying on it, its underside dropped), and the front mount
    w = 0.024 / HA[2]
    band = sheet('FullCutTeam', lambda u, v: shell_pt(u * TAU, d(50) + w * (v - 0.5), 0.0026), 24, 2, S('Team'),
                 wrap=True, thick=0.002, out_from=HC, angle=35)
    bm = bmesh.new()
    bm.from_mesh(band.data)
    under = [f for f in bm.faces if f.normal.dot((f.calc_center_median() - HC).normalized()) < -0.8]
    bmesh.ops.delete(bm, geom=under, context='FACES_ONLY')
    bm.to_mesh(band.data)
    bm.free()
    parts.append(band)
    side, n, up = shell_basis(0.0, d(65))
    parts.append(box('FullCutMount', shell_pt(0.0, d(65), 0.004), (0.03, 0.009, 0.022), S('Polymer'),
                     basis=(side, n, up)))
    parts += chin_straps(tree)
    parts += goggles(tree, 'Rubber', '_FullCut')
    _drop_covered(bal, [sh])
    return bal + parts


# --- the new surfaces (bot21 bakes them with the rest) ---------------------------------------------------------------
def surf_shemagh(m):
    """Sand cotton woven with a brown check: 5 mm bands every 18 mm both ways, darker where they cross (the Detail UV
    is in metres)."""
    g = G(m)
    col = g.mulc(lin(0xb5a079), g.math('ADD', 0.92, g.math('MULTIPLY', g.noise(g.P, 40.0, 2.0, 0.6), 0.16)))
    bands = []
    for w in (g.U, g.V):
        f = g.math('FRACT', g.math('DIVIDE', w, 0.018))
        bands.append(g.math('MULTIPLY', g.step(f, 0.0, 0.05), g.step(f, 0.33, 0.28)))
    lines = g.math('ADD', g.math('MULTIPLY', g.math('MAXIMUM', bands[0], bands[1]), 0.6),
                   g.math('MULTIPLY', g.math('MULTIPLY', bands[0], bands[1]), 0.35))
    col = g.mixc(lines, col, lin(0x4b3a29))
    h = g.math('ADD', g.math('MULTIPLY', g.noise(g.P, 500.0, 1.0, 0.5), 0.25), g.math('MULTIPLY', lines, 0.4))
    h = g.math('ADD', h, g.math('MULTIPLY', g.noise(g.P, 45.0, 2.0, 0.6), 1.2))       # loose folds
    return g.finish(col, 0.95, 0.0, h, height_dist=0.002)


SURF_BUILD.update({'Canvas': lambda m: _plain(m, 0x5b5a43, 0.92, mottle=0.14, grain=700.0, grain_amt=0.35, dust=0.2),
                   'Shemagh': surf_shemagh})


def heads_v12(old_head, gaiter):
    """The four heads, [(name, parts)] in HEAD_ORDER: bot20's high-cut, then the cap, the boonie and the full-cut, each
    on its own copy of the balaclava."""
    hv = head_v12(old_head, extra=[gaiter])
    bal = [o for o in hv if o.name.startswith('Balaclava')]
    made = {'Head_HighCut': hv,
            'Head_Cap': head_cap_v12(_bal_copy(bal, 'Cap'), gaiter),
            'Head_Boonie': head_boonie_v12(_bal_copy(bal, 'Boonie'), gaiter),
            'Head_FullCut': head_fullcut_v12(_bal_copy(bal, 'FullCut'), gaiter)}
    return [(n, made[n]) for n in HEAD_ORDER]


B.update(dict(heads_v12=heads_v12, goggles=goggles, head_cap_v12=head_cap_v12, head_boonie_v12=head_boonie_v12,
              head_fullcut_v12=head_fullcut_v12, shemagh=shemagh, HEAD_ORDER=HEAD_ORDER))
print('bot22 ready')

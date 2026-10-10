# --- v4 skeleton: one 55-bone skeleton for the human and the robot, skin weights on every part, then the rig ---
# Bones are named for three.js (no dots): Root, Hips, Spine, Spine1, Chest, Neck, Head; per side Shoulder, UpperArm,
# Forearm, Hand, Index1-3, Middle1-3, Ring1-3, Pinky1-3, Thumb1-3, Grip (where a replica's grip sits: its Y axis
# runs along the barrel, its Z axis is the replica's up), Thigh, Shin, Foot, Toe; with _L and _R.
# Weights are set on the separate parts before they are joined: hard pieces follow one bone, cloth and shells that
# bend (shirt, trousers, sleeves, gloves, boots, the robot's bellows and cables) blend between the nearest bones.
import re

FINGER_NAMES = ('Index', 'Middle', 'Ring', 'Pinky')
GRIP_ANGLE = 18.0           # degrees between the hand's length and a replica's barrel
FRONT_V = Vector((0, -1, 0))
UP_V = Vector((0, 0, 1))


def _mx(v, s):
    return Vector((v.x * s, v.y, v.z))


def skeleton_points():
    """(name, parent, head, tail, z-axis hint) in build space (before scaling to 1.73 m)."""
    u, f = arm_dirs()
    elbow, wrist = arm_points()
    base, L, W, N = _hand_frame()
    bones = [('Hips', None, Vector((0, 0.006, 0.955)), Vector((0, 0.004, 1.035)), FRONT_V),
             ('Spine', 'Hips', Vector((0, 0.004, 1.035)), Vector((0, 0.002, 1.150)), FRONT_V),
             ('Spine1', 'Spine', Vector((0, 0.002, 1.150)), Vector((0, 0.002, 1.280)), FRONT_V),
             ('Chest', 'Spine1', Vector((0, 0.002, 1.280)), Vector((0, 0.010, 1.430)), FRONT_V),
             ('Neck', 'Chest', Vector((0, 0.010, 1.430)), Vector((0, 0.008, 1.500)), FRONT_V),
             ('Head', 'Neck', Vector((0, 0.008, 1.500)), Vector((0, 0.008, 1.700)), FRONT_V)]
    y0 = ANKLE.y
    for sd, s in (('L', 1.0), ('R', -1.0)):
        m = lambda v: _mx(Vector(v), s)
        side = [('Shoulder', 'Chest', (0.030, 0.004, 1.405), SHOULDER, FRONT_V),
                ('UpperArm', 'Shoulder', SHOULDER, elbow, FRONT_V),
                ('Forearm', 'UpperArm', elbow, wrist, FRONT_V),
                ('Hand', 'Forearm', wrist, base + L * 0.080, -N)]
        for k, nm in enumerate(FINGER_NAMES):
            js = _finger_joints[k]
            for i in range(3):
                side.append(('%s%d' % (nm, i + 1), 'Hand' if i == 0 else '%s%d' % (nm, i), js[i], js[i + 1], -N))
        tj = _thumb_joints
        for i in range(3):
            side.append(('Thumb%d' % (i + 1), 'Hand' if i == 0 else 'Thumb%d' % i, tj[i], tj[i + 1], -N))
        g = base + L * 0.045 + N * 0.022
        ga = math.radians(GRIP_ANGLE)
        barrel = L * math.cos(ga) + W * math.sin(ga)          # a grip is raked: the barrel runs above the knuckles
        gup = W * math.cos(ga) - L * math.sin(ga)
        g = g + barrel * 0.028 + gup * 0.010                  # the centre of the closed fist, at its top
        side.append(('Grip', 'Hand', g, g + barrel * 0.06, gup))
        side += [('Thigh', 'Hips', HIP, KNEE, FRONT_V),
                 ('Shin', 'Thigh', KNEE, ANKLE, FRONT_V),
                 ('Foot', 'Shin', ANKLE, (ANKLE.x + 0.005, y0 - 0.125, 0.025), UP_V),
                 ('Toe', 'Foot', (ANKLE.x + 0.005, y0 - 0.125, 0.025), (ANKLE.x + 0.010, y0 - 0.205, 0.022), UP_V)]
        for nm, par, h, t, z in side:
            par = par if par in ('Chest', 'Hips') else par + '_' + sd
            bones.append((nm + '_' + sd, par, m(h), m(t), _mx(Vector(z), s)))
    return bones


# --- weights -----------------------------------------------------------------------------------------------------
def _seg(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length


def _blend(o, names, bones):
    segs = [(n, bones[n][0], bones[n][1]) for n in names]
    groups = {n: o.vertex_groups.get(n) or o.vertex_groups.new(name=n) for n in names}
    for v in o.data.vertices:
        ds = sorted((_seg(v.co, a, b), n) for n, a, b in segs)
        d0 = ds[0][0]
        sig = max(0.003, min(0.02, 0.25 * d0))
        ws = [(math.exp(-(d - d0) / sig), n) for d, n in ds[:3]]
        tot = sum(w for w, _ in ws)
        ws = [(w / tot, n) for w, n in ws if w / tot >= 0.03]
        tot = sum(w for w, _ in ws)
        for w, n in ws:
            groups[n].add([v.index], w / tot, 'REPLACE')


def _rigid(o, splits):
    idx = [v.index for v in o.data.vertices]
    for n, w in splits:
        g = o.vertex_groups.get(n) or o.vertex_groups.new(name=n)
        g.add(idx, w, 'REPLACE')


def _side(name):
    m = re.search(r'_([LR])(?:$|[A-Z0-9])', name)
    return m.group(1) if m else None


FINGERS_ALL = lambda s: ['%s%d_%s' % (nm, i, s) for nm in FINGER_NAMES + ('Thumb',) for i in (1, 2, 3)]
KIT_HIPS = ('Belt', 'Buckle', 'Holster', 'PistolGrip', 'DumpPouch')
RULES = [  # (base-name prefixes, rule) checked in order; S is the part's side
    (('Shirt',), ('blend', ['Hips', 'Spine', 'Spine1', 'Chest', 'Neck', 'Shoulder_L', 'Shoulder_R', 'UpperArm_L',
                            'UpperArm_R'])),
    (('Gaiter', 'NeckRing'), ('blend', ['Chest', 'Neck', 'Head'])),
    (('NeckRod',), ('rigid', 'Neck')),
    (('Neck',), ('blend', ['Chest', 'Neck', 'Head'])),
    (('Sleeve',), ('blend', ['Chest', 'Shoulder_S', 'UpperArm_S', 'Forearm_S', 'Hand_S'])),   # its end follows the glove
    (('Armband',), ('rigid', 'UpperArm_S')),
    (('Glove', 'CuffStrap'), ('blend', ['Forearm_S', 'Hand_S', '*fingers'])),
    (('Knuckle_',), ('rigid', 'Hand_S')),
    (('Trousers',), ('blend', ['Hips', 'Spine', 'Thigh_L', 'Shin_L', 'Thigh_R', 'Shin_R'])),
    (('KneePad',), ('split', [('Thigh_S', 0.35), ('Shin_S', 0.65)])),
    (('KneeStrapTop', 'Cargo', 'HipBall', 'ThighPanel', 'ThighPiston', 'Thigh'), ('rigid', 'Thigh_S')),
    (('KneeStrapLow', 'KneeHinge', 'KneePin', 'KneePlate', 'ShinPanel', 'CalfPiston', 'Shin'), ('rigid', 'Shin_S')),
    (('Boot', 'Sole', 'Lugs', 'Laces'), ('blend', ['Shin_S', 'Foot_S', 'Toe_S'])),
    (('ChestShell', 'ChestSeam', 'Sternum', 'Collar'), ('rigid', 'Chest')),
    (('Bellows',), ('blend', ['Hips', 'Spine', 'Spine1', 'Chest'])),
    (('Pelvis',), ('rigid', 'Hips')),
    (('LegCable',), ('blend', ['Thigh_S', 'Shin_S'])),
    (('AnkleYoke', 'Ankle', 'Foot'), ('rigid', 'Foot_S')),
    (('Tread',), ('blend', ['Foot_S', 'Toe_S'])),
    (('ToeHinge', 'Toe'), ('rigid', 'Toe_S')),
    (('ShoulderBall', 'Pauldron', 'UpperArm', 'ArmPanel'), ('rigid', 'UpperArm_S')),
    (('ElbowHinge', 'ElbowPin', 'ForearmPanel', 'ForearmPiston', 'Forearm'), ('rigid', 'Forearm_S')),
    (('ArmCable',), ('blend', ['UpperArm_S', 'Forearm_S'])),
    (('Wrist', 'Palm', 'HandPlate', 'KnuckleBar'), ('rigid', 'Hand_S')),
    (('ThumbBase',), ('rigid', 'Thumb1_S')),
]


def weight_part(o, bones, kind):
    """kind: 'head' (all to Head), 'kit' (the carrier and pouches to Chest, the belt kit to Hips) or 'body'."""
    base = o.name.split('.')[0]
    if kind == 'head':
        return _rigid(o, [('Head', 1.0)])
    if kind == 'kit':
        return _rigid(o, [('Hips' if base.startswith(KIT_HIPS) else 'Chest', 1.0)])
    m = re.match(r'Finger(\d)_([LR])(Seg|Knuckle)(\d)', base)
    if m:
        return _rigid(o, [('%s%d_%s' % (FINGER_NAMES[int(m.group(1))], int(m.group(4)) + 1, m.group(2)), 1.0)])
    m = re.match(r'Thumb_([LR])(Seg|Knuckle)(\d)', base)
    if m:
        return _rigid(o, [('Thumb%d_%s' % (int(m.group(3)) + 2, m.group(1)), 1.0)])
    s = _side(base)
    for prefixes, rule in RULES:
        if base.startswith(prefixes):
            sub = lambda n: n.replace('_S', '_' + (s or 'L'))
            if rule[0] == 'rigid':
                return _rigid(o, [(sub(rule[1]), 1.0)])
            if rule[0] == 'split':
                return _rigid(o, [(sub(n), w) for n, w in rule[1]])
            names = []
            for n in rule[1]:
                names += FINGERS_ALL(s) if n == '*fingers' else [sub(n)]
            return _blend(o, names, bones)
    raise KeyError('no skin rule for ' + o.name)


def weight_all(body, kit, heads):
    pts = {n: (h, t) for n, par, h, t, z in skeleton_points()}
    for o in body:
        weight_part(o, pts, 'body')
    for o in kit:
        weight_part(o, pts, 'kit')
    for o in heads:
        weight_part(o, pts, 'head')


# --- the rig -----------------------------------------------------------------------------------------------------
def build_rig(m, name='Rig'):
    """The armature in the figure's final space (m: build space to final space). Root sits on the ground."""
    old = bpy.data.objects.get(name)
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    arm = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, arm)
    coll().objects.link(rig)
    for q in bpy.context.selected_objects:
        q.select_set(False)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    root = eb.new('Root')
    root.head = (0, 0, 0)
    root.tail = (0, 0, 0.15)
    root.align_roll(FRONT_V)
    m3 = m.to_3x3()
    for n, par, h, t, z in skeleton_points():
        b = eb.new(n)
        b.head = m @ Vector(h)
        b.tail = m @ Vector(t)
        b.align_roll((m3 @ Vector(z)).normalized())
        b.parent = eb[par] if par else root
        b.use_connect = False
        b.use_deform = not n.startswith(('Grip', 'Root'))
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


def bind(objs, rig):
    for o in objs:
        o.parent = rig
        mod = o.modifiers.get('Armature') or o.modifiers.new('Armature', 'ARMATURE')
        mod.object = rig


# --- assembly: weights, scale, join, rig -------------------------------------------------------------------------
def _assemble(body, kit, heads, m):
    """heads: [(name, parts)] already in head space. Returns the joined objects (Body, Kit, Kit_Radio, Kit_Pack, one
    per head) and the rig."""
    weight_all(body, kit, [o for _, ps in heads for o in ps])
    for o in body + kit + [o for _, ps in heads for o in ps]:
        o.data.transform(m)
    kit_rest, groups = _split_kit(kit)
    out = [join('Body', body), join('Kit', kit_rest)] + [join(n, groups[n]) for n, _ in KIT_SPLIT]
    out += [join(n, ps) for n, ps in heads]
    rig = build_rig(m)
    bind(out, rig)
    return out, rig


def _scale(objs):
    zs = [(o.matrix_world @ Vector(c)).z for o in objs for c in o.bound_box]
    lo, hi = min(zs), max(zs)
    s = FIGURE_HEIGHT / (hi - lo)
    return s, Matrix.Scale(s, 4) @ Matrix.Translation((0, 0, -lo))


HM = lambda: Matrix.Translation(HEAD_TOP) @ Matrix.Scale(HEAD_SCALE, 4) @ Matrix.Translation(-HEAD_TOP)


def finalise():
    """The human figure: Body, Kit, Kit_Radio, Kit_Pack, four heads and the Rig, at 1.73 m."""
    b, k, h = build_all()
    s, m = _scale(b + k + h)
    heads = [('Head_HighCut', h)]
    for name, fn in HEADS_EXTRA:
        ps = fn()
        for o in ps:
            o.data.transform(HM())
        heads.append((name, ps))
    out, rig = _assemble(b, k, heads, m)
    return out + [rig], s


def finalise_robot():
    """The robot figure: the human build gives the kit and the scale; its body and heads are the robot's."""
    b, k, h = build_all()
    s, m = _scale(b + k + h)
    for o in b + h:
        bpy.data.objects.remove(o, do_unlink=True)
    rb = robot_body()
    heads = []
    for name, fn in ROBOT_HEADS:
        ps = fn()
        for o in ps:
            o.data.transform(HM())
        heads.append((name, ps))
    out, rig = _assemble(rb, k, heads, m)
    return out + [rig], s

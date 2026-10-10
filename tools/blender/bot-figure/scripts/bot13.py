# --- v5 (William, 10 October 14:27): one human head, a bare robot, hands that really hold the replicas ---
# Humans all wear the high-cut helmet; the boonie, balaclava-only and visor heads are dropped. The robot carries no
# vest, belt, pouches, holster, radio or pack: its team shows through the coloured panels on its shell.
HEADS_EXTRA = ()


def _assemble_bare(body, heads, m):
    """As _assemble, with no kit: the robot's Body and one object per head."""
    weight_all(body, [], [o for _, ps in heads for o in ps])
    for o in body + [o for _, ps in heads for o in ps]:
        o.data.transform(m)
    out = [join('Body', body)] + [join(n, ps) for n, ps in heads]
    rig = build_rig(m)
    bind(out, rig)
    return out, rig


def _robot_bare():
    """The robot figure: the human build gives the scale only; body and heads are the robot's, with no kit."""
    b, k, h = build_all()
    s, m = _scale(b + k + h)
    for o in b + k + h:
        bpy.data.objects.remove(o, do_unlink=True)
    rb = robot_body()
    heads = []
    for name, fn in ROBOT_HEADS:
        ps = fn()
        for o in ps:
            o.data.transform(HM())
        heads.append((name, ps))
    out, rig = _assemble_bare(rb, heads, m)
    return out + [rig], s


finalise_robot = _with_neck(_robot_bare, True)


# --- the bare robot's team colour: painted panels on the chest, back and ribs, alongside the arm and leg panels
# (named ChestShell* so they ride the Chest bone like the shell they sit on) ---
if not getattr(robot_torso, 'v13', False):
    _robot_torso_v8 = robot_torso


def robot_torso():
    p = _robot_torso_v8()
    for nm, a0, a1 in (('ChestShellTeam_L', FRONT + 0.30, FRONT + 0.85), ('ChestShellTeam_R', FRONT - 0.85, FRONT - 0.30)):
        p.append(panel(nm, RT, 1.296, 1.372, a0, a1, -0.003, 0.005, 2, 4, 'TeamPaint', inset=0.4, inner=False))
    p.append(panel('ChestShellBackTeam', RT, 1.200, 1.360, BACK - 0.42, BACK + 0.42, -0.003, 0.005, 3, 5, 'TeamPaint',
                   inset=0.4, inner=False))
    for i, a in enumerate((0.0, math.pi)):
        p.append(panel('ChestShellRibTeam%d' % i, RT, 1.140, 1.280, a - 0.12, a + 0.12, -0.003, 0.005, 2, 2, 'TeamPaint',
                       inset=0.4, inner=False))
    return p


robot_torso.v13 = True


# --- hands that hold the real replicas (bot13) ---------------------------------------------------------------------
# The replicas are the game's own files (aeg_rifle.glb, gas_pistol.glb). Replica space: X right, Y forward (muzzle),
# Z up. Each replica hangs off Grip_R: REPLICA_ON_GRIP is its offset in the Grip_R frame (X back of the right hand,
# Y barrel, Z up), so the right hand's fist sits round the real grip. SUPPORT_ON_REPLICA is where the left hand's
# Grip_L sits in replica space (point, barrel axis, up axis); HOLDS are the finger poses solved against the real
# meshes (solve_hold below), as quaternions per bone, for the replica being held and the side.
import math
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

REPLICA_ON_GRIP = {'rifle': Matrix.Translation((-0.015, 0.019, 0.078)),
                   'pistol': Matrix.Translation((-0.015, 0.031, 0.061))}     # replaced by the solved seats below
RIFLE_BUTT = Vector((0.0, -0.361, 0.0))          # the butt plate's centre on the real AEG, replica space
SUPPORT_ON_REPLICA = {}
HOLDS = {}
HOLD = ['rifle']                                 # which replica the hands hold while a clip frame is evaluated
FINGER_SET = ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb')


def seat_offset(key):
    """Where the replica's origin sits from the grip point, in the clip's frame (r, f, u): the clips give the right
    hand's grip point and the replica's barrel and top; the hand turns on the grip by the seat's rotation."""
    return -(REPLICA_ON_GRIP[key].inverted().translation)


def on_replica(key, g, f, u):
    """Map replica space to the world, for a right hand gripping replica `key` at g (barrel f, up u)."""
    r = f.cross(u)
    o = seat_offset(key)
    def pt(v):
        return g + r * (v[0] + o.x) + f * (v[1] + o.y) + u * (v[2] + o.z)
    def dr(v):
        return (r * v[0] + f * v[1] + u * v[2]).normalized()
    return pt, dr


def support_hand(key, g, f, u):
    if key not in SUPPORT_ON_REPLICA:
        return None
    pt, dr = on_replica(key, g, f, u)
    p, b, w = SUPPORT_ON_REPLICA[key]
    return pt(p), dr(b), dr(w)


def gun(butt, pitch=0.0, yaw=0.0, roll=0.0, length=None):
    """The rifle's grip frame from its butt in the shoulder: the real AEG's butt plate lands on `butt`."""
    f = Q(Z_AX, yaw) @ Q(X_AX, -pitch) @ Vector((0, -1, 0))      # positive pitch raises the muzzle
    u = Q(Z_AX, yaw) @ Q(X_AX, -pitch) @ Vector((0, 0, 1))
    u = Quaternion(f, math.radians(roll)) @ u
    r = f.cross(u)
    o = seat_offset('rifle')
    g = _twisted(butt) - r * (RIFLE_BUTT.x + o.x) - f * (RIFLE_BUTT.y + o.y) - u * (RIFLE_BUTT.z + o.z)
    return g, f, u


def rifle_hands(g, f, u, left_at=0.20, left=True):
    hands = {'R': (g, f, u)}
    if left:
        s = support_hand('rifle', g, f, u)
        if s:
            hands['L'] = s
        else:
            r = f.cross(u)
            across = (u * 0.5 + r * 0.85)
            hands['L'] = (g + f * left_at + u * 0.045, (across - f * f.dot(across)).normalized(), f)
    return hands


def pistol(grip, pitch=0.0, yaw=0.0, roll=0.0):
    f = Q(Z_AX, yaw) @ Q(X_AX, -pitch) @ Vector((0, -1, 0))
    u = Quaternion(f, math.radians(roll)) @ (Q(Z_AX, yaw) @ Q(X_AX, -pitch) @ Vector((0, 0, 1)))
    g = Vector(grip)
    r = f.cross(u)
    s = support_hand('pistol', g, f, u)
    return {'R': (g, f, u), 'L': s or (g - r * 0.030 - u * 0.012 + f * 0.004, f, (u - r * 1.2).normalized())}


def finger_quats(sd, kind):
    """{bone: Quaternion} for a finger pose: a solved hold for 'trigger' (right) and 'support' (left) when the held
    replica has one, else the angle table in FINGERS."""
    held = {'trigger': 'R', 'support': 'L'}.get(kind)
    h = HOLDS.get((HOLD[0], sd)) if held == sd else None
    if h:
        return {n: Quaternion(q) for n, q in h.items()}
    a = FINGERS[kind]
    return {'%s%d_%s' % (fn, i + 1, sd): Q(X_AX, a[fn][i]) for fn in a for i in range(3)}


def fingers(bones, sd, kind, blend=None, u=0.0):
    a = finger_quats(sd, kind)
    b = finger_quats(sd, blend) if blend else a
    for n in a:
        bones[n] = a[n].slerp(b[n], u) if blend else a[n]


# --- what the hands hold, and how far the chest turns, while each clip is evaluated ---
# The real AEG is longer than the old stand-in, so with a square chest the left hand could not reach its handguard.
# Shooters stand bladed: the chest turns so the support shoulder comes forward, the head stays on the target. The
# twist turns the spine (not the hips or feet), and gun() turns the rifle's butt with it so it stays in the shoulder.
RIFLE_TWIST = -30.0
TWIST_BY_CLIP = {'Rifle_AimUp': -60.0}            # aiming high pulls the handguard away: turn further
SUPPORT_REACH = 12.0                             # how far the support shoulder rolls forward, degrees
HEAD_UNTWIST = 35.0
TW = [0.0]


def clip_context(name, t):
    """(replica held, chest twist in degrees) for clip `name` at time t (0-1)."""
    if name.startswith('Pistol_'):
        return 'pistol', 0.0
    if name == 'Switch':
        return ('rifle' if t < 0.35 else 'pistol'), RIFLE_TWIST * (1 - ease(min(1.0, t / 0.35)))
    if name == 'HitCall':
        return 'rifle', RIFLE_TWIST * (1 - ease(min(1.0, t / 0.35)))
    if name in ('Sprint', 'WalkOff'):
        return 'rifle', 0.0
    return 'rifle', TWIST_BY_CLIP.get(name, RIFLE_TWIST)


def _in_context(name, clip, upper=False):
    frames, fn, loop = clip
    def g(t):
        HOLD[0], TW[0] = clip_context(name, t)
        try:
            pose = fn(t)
            pose['hold'] = HOLD[0]
            if upper and 'Hips' in pose['bones']:
                # upper-body clips play over the legs' own hips, so their hips turn moves into the spine: the replica
                # then points where the clip means it to over a still pelvis
                pose['bones']['Spine'] = pose['bones'].pop('Hips') @ pose['bones'].get('Spine', Quaternion())
            return pose
        finally:
            HOLD[0], TW[0] = 'rifle', 0.0
    return frames, g, loop


if not getattr(hand_target, 'v13', False):
    _hand_target11, _apply11 = hand_target, apply


def hand_target(c, sd, grip, barrel, up):
    """The right hand's grip frame from the replica's: the hand sits on the grip turned by the seat (REPLICA_ON_GRIP),
    so the replica still points along `barrel` while the palm wraps its grip."""
    if sd == 'R':
        f = Vector(barrel).normalized()
        u = Vector(up)
        u = (u - f * f.dot(u)).normalized()
        R = Matrix((f.cross(u), f, u)).transposed() @ REPLICA_ON_GRIP[HOLD[0]].to_3x3().inverted()
        barrel, up = R.col[1], R.col[2]
    return _hand_target11(c, sd, grip, barrel, up)


def apply(c, pose):
    HOLD[0] = pose.get('hold', 'rifle')
    try:
        _apply11(c, pose)
    finally:
        HOLD[0] = 'rifle'


hand_target.v13 = True


if not getattr(clips, 'v13', False):
    _clips11, _spine11 = clips, spine


def clips(c):
    return [(name, _in_context(name, clip, upper), upper) for name, clip, upper in _clips11(c)]


clips.v13 = True


def _spine_axis():
    h = bpy.data.objects['Rig'].data.bones['Spine'].head_local
    return Vector((h.x, h.y, 0.0))


def _twisted(p):
    """A point carried round the spine's axis by the current chest twist."""
    if not TW[0]:
        return Vector(p)
    a = _spine_axis()
    return a + Q(Z_AX, TW[0]) @ (Vector(p) - a)


def spine(bones, pitch=0.0, yaw=0.0, roll=0.0, head_pitch=None, head_yaw=None, w=(0.30, 0.35, 0.35)):
    hy = -yaw if head_yaw is None else head_yaw
    # the head turns back to the target, but no more than HEAD_UNTWIST: past that the neck would crank
    _spine11(bones, pitch, yaw + TW[0], roll, head_pitch, hy - max(TW[0], -HEAD_UNTWIST), w)
    if TW[0] and SUPPORT_REACH:
        rest = bpy.data.objects['Rig'].data.bones['Shoulder_L'].matrix_local.to_quaternion()
        k = TW[0] / RIFLE_TWIST
        bones['Shoulder_L'] = rest.inverted() @ Q(Z_AX, -SUPPORT_REACH * k) @ rest


# --- tools that solve the holds (run in Blender with the figure built, the replicas hung by proxies()) ----------------
def QX(deg):
    return Quaternion(X_AX, math.radians(deg))


def finger_radii(sd):
    """Median distance of each finger bone's skin from its axis (rest pose)."""
    body = bpy.data.objects['Body']
    db = bpy.data.objects['Rig'].data.bones
    gi = {g.index: g.name for g in body.vertex_groups}
    acc = {}
    for v in body.data.vertices:
        if not v.groups:
            continue
        g = max(v.groups, key=lambda g: g.weight)
        n = gi[g.group]
        if n.endswith('_' + sd) and n.startswith(FINGER_SET) and g.weight > 0.6:
            b = db[n]
            h, d = b.head_local, (b.tail_local - b.head_local)
            L = d.length
            d = d / L
            s = max(0, min(L, (v.co - h).dot(d)))
            acc.setdefault(n, []).append((v.co - (h + d * s)).length)
    return {n: sorted(v)[len(v) // 2] for n, v in acc.items()}


def chain(rig, names, rots):
    """Forward kinematics of a finger from its parent's current pose: (head, tail) per segment, armature space."""
    pb, db = rig.pose.bones, rig.data.bones
    par = db[names[0]].parent
    M, Pr = pb[par.name].matrix.copy(), par.matrix_local
    out = []
    for n, r in zip(names, rots):
        rest = db[n].matrix_local
        M = M @ (Pr.inverted() @ rest) @ r.to_matrix().to_4x4()
        Pr = rest
        out.append((M.translation.copy(), (M @ Vector((0, db[n].length, 0))).copy()))
    return out


class Contact:
    def __init__(s, objs):
        dg = bpy.context.evaluated_depsgraph_get()
        s.items = [(BVHTree.FromObject(o, dg), o.matrix_world.inverted()) for o in objs]

    def depth(s, pw, r):
        """>0: how far a sphere of radius r at world point pw is into the surfaces (or within r of them)."""
        worst = -1
        for bvh, inv in s.items:
            q = inv @ pw
            loc, nor, idx, dist = bvh.find_nearest(q)
            if loc is None:
                continue
            worst = max(worst, (r + dist) if (q - loc).dot(nor) < 0 else (r - dist))
        return worst


def seg_depth(C, rigw, seg, r, n=5):
    a, b = seg
    return max(C.depth(rigw @ (a.lerp(b, (i + 0.5) / n)), r) for i in range(n))


def _rots(z, a1, a2, a3):
    return [Quaternion(Z_AX, math.radians(z)) @ QX(-a1), QX(-a2), QX(-a3)]


def wrap_finger(rig, C, names, radii, lim=(90, 105, 80), tol=0.0015, spreads=(0,), along=None, wdir=0.1, lo=(0, 0, 0)):
    """Curl a finger round the surfaces: the clear pose (no segment deeper than tol) with the least total gap; with
    `along` (a world direction) it also keeps the finger's first bone parallel to it, so the fingers lie side by side."""
    rigw = rig.matrix_world
    best = None
    def ev(a, z):
        if a[1] < lo[1] or a[2] < lo[2]:              # a little curl in the outer joints reads as a relaxed hand
            return None
        segs = chain(rig, names, _rots(z, *a))
        ds = [seg_depth(C, rigw, s, radii[n], n=4) for s, n in zip(segs, names)]
        if max(ds) > tol:
            return None
        s = sum(-d for d in ds) - 0.0002 * sum(a) / 30 + 0.0001 * abs(z)
        if along is not None:
            s += wdir * (1 - (rigw.to_3x3() @ (segs[0][1] - segs[0][0])).normalized().dot(along))
        return s
    def search(r1, r2, r3, zs):
        nonlocal best
        for z in zs:
            for a1 in r1:
                for a2 in r2:
                    for a3 in r3:
                        s = ev((a1, a2, a3), z)
                        if s is not None and (best is None or s < best[0]):
                            best = (s, (a1, a2, a3), z)
    search(range(0, lim[0] + 1, 6), range(0, lim[1] + 1, 7), range(0, lim[2] + 1, 8), spreads)
    if best is None:
        return None
    b, z = best[1], best[2]
    cl = lambda v, m: [x for x in v if 0 <= x <= m]
    search(cl(range(b[0] - 6, b[0] + 7, 2), lim[0]), cl(range(b[1] - 7, b[1] + 8, 2), lim[1]),
           cl(range(b[2] - 8, b[2] + 9, 2), lim[2]), [z])
    a, z = best[1], best[2]
    segs = chain(rig, names, _rots(z, *a))
    return _rots(z, *a), (a, z), [round(seg_depth(C, rigw, s, radii[n]), 4) for s, n in zip(segs, names)]


def lay_finger(rig, C, names, radii, fwd, tol=0.004, zs=range(-30, 31, 3), a1s=range(-30, 61, 3),
               a2s=range(0, 61, 6), wdir=0.06, gap=0.002):
    """Lay a finger (or thumb) along the surface, pointing as near `fwd` as it can: a straight trigger finger or a
    thumb along the side."""
    rigw = rig.matrix_world
    best = None
    for z in zs:
        for a1 in a1s:
            for a2 in a2s:
                rots = _rots(z, a1, a2, a2 * 0.8)
                segs = chain(rig, names, rots)
                ds = [seg_depth(C, rigw, s, radii[n], n=4) for s, n in zip(segs, names)]
                if max(ds) > tol:
                    continue
                d = (rigw.to_3x3() @ (segs[2][1] - segs[0][0])).normalized()
                sc = sum(abs(x + gap) for x in ds) * 10 + wdir * (1 - d.dot(fwd)) + 0.0002 * a2
                if best is None or sc < best[0]:
                    best = (sc, rots, (z, a1, a2), [round(x, 4) for x in ds], round(d.dot(fwd), 3))
    return best


# --- the solved seats and holds ---
def _seat(o, yaw):
    return Matrix.Translation(o) @ Matrix.Rotation(math.radians(yaw), 4, 'Z')


# The right fist sits low and turned on the AEG grip so the web of the hand is on the backstrap, the thumb wraps
# the far side and the forearm lines up behind the replica. The pistol grip is fitted into the same fist: its grip
# top and rake (15.6 degrees) onto the rifle grip's (22.6 degrees).
RIFLE_SEAT = _seat((-0.0564, 0.045, 0.11), 40.0)
PISTOL_IN_RIFLE_GRIP = (Matrix.Translation((0, -0.057, -0.085)) @ Matrix.Rotation(math.radians(-7), 4, 'X') @
                        Matrix.Translation((0, 0.058, 0.045)))
REPLICA_ON_GRIP = {'rifle': RIFLE_SEAT, 'pistol': RIFLE_SEAT @ PISTOL_IN_RIFLE_GRIP}
# the left hand under the AEG's handguard, palm up and turned 15 degrees to the right, thumb forward
SUPPORT_ON_REPLICA['rifle'] = ((0.0245, 0.2261, -0.0007), (0.9513, 0.1736, -0.2549), (-0.1677, 0.9848, 0.0449))
# the left hand on the pistol: the right hand's seat mirrored, moved out and down so its fingers wrap over the right's
SUPPORT_ON_REPLICA['pistol'] = ((-0.0463, -0.0566, -0.0955), (-0.6428, 0.7603, 0.0934), (0.0, -0.1219, 0.9925))

HOLDS[('rifle', 'R')] = {
    'Index1_R': (0.92615, -0.27434, -0.07351, 0.24816),
    'Index2_R': (1.0, 0.0, 0.0, 0.0),
    'Index3_R': (1.0, 0.0, 0.0, 0.0),
    'Middle1_R': (0.95106, -0.30902, 0.0, 0.0),
    'Middle2_R': (0.96363, -0.26724, 0.0, 0.0),
    'Middle3_R': (0.99255, -0.12187, 0.0, 0.0),
    'Ring1_R': (0.97437, -0.22495, 0.0, 0.0),
    'Ring2_R': (0.9205, -0.39073, 0.0, 0.0),
    'Ring3_R': (0.99452, -0.10453, 0.0, 0.0),
    'Pinky1_R': (0.88295, -0.46947, 0.0, 0.0),
    'Pinky2_R': (0.99756, -0.06976, 0.0, 0.0),
    'Pinky3_R': (0.99863, -0.05234, 0.0, 0.0),
    'Thumb1_R': (0.81465, -0.51899, -0.13906, 0.21829),
    'Thumb2_R': (1.0, 0.0, 0.0, 0.0),
    'Thumb3_R': (1.0, 0.0, 0.0, 0.0),
}
HOLDS[('rifle', 'L')] = {
    'Index1_L': (0.84805, -0.52992, 0.0, 0.0),
    'Index2_L': (0.99255, -0.12187, 0.0, 0.0),
    'Index3_L': (0.99756, -0.06976, 0.0, 0.0),
    'Middle1_L': (0.87462, -0.48481, 0.0, 0.0),
    'Middle2_L': (0.99692, -0.07846, 0.0, 0.0),
    'Middle3_L': (0.99452, -0.10453, 0.0, 0.0),
    'Ring1_L': (0.90134, -0.4203, -0.04418, 0.09473),
    'Ring2_L': (0.9954, -0.09585, 0.0, 0.0),
    'Ring3_L': (0.99863, -0.05234, 0.0, 0.0),
    'Pinky1_L': (0.93969, -0.34202, 0.0, 0.0),
    'Pinky2_L': (0.99255, -0.12187, 0.0, 0.0),
    'Pinky3_L': (0.99756, -0.06976, 0.0, 0.0),
    'Thumb1_L': (0.88809, 0.25466, -0.10548, -0.36786),
    'Thumb2_L': (0.98769, -0.15643, 0.0, 0.0),
    'Thumb3_L': (0.99211, -0.12533, 0.0, 0.0),
}
HOLDS[('pistol', 'R')] = {
    'Index1_R': (0.94232, -0.33369, 0.00874, -0.02468),
    'Index2_R': (1.0, 0.0, 0.0, 0.0),
    'Index3_R': (1.0, 0.0, 0.0, 0.0),
    'Middle1_R': (0.95106, -0.30902, 0.0, 0.0),
    'Middle2_R': (0.98902, -0.14781, 0.0, 0.0),
    'Middle3_R': (0.93969, -0.34202, 0.0, 0.0),
    'Ring1_R': (0.96593, -0.25882, 0.0, 0.0),
    'Ring2_R': (0.98163, -0.19081, 0.0, 0.0),
    'Ring3_R': (0.95106, -0.30902, 0.0, 0.0),
    'Pinky1_R': (0.99255, -0.12187, 0.0, 0.0),
    'Pinky2_R': (0.98769, -0.15643, 0.0, 0.0),
    'Pinky3_R': (0.87462, -0.48481, 0.0, 0.0),
    'Thumb1_R': (0.78737, -0.50161, -0.19255, 0.30224),
    'Thumb2_R': (1.0, 0.0, 0.0, 0.0),
    'Thumb3_R': (1.0, 0.0, 0.0, 0.0),
}
HOLDS[('pistol', 'L')] = {
    'Index1_L': (0.70711, -0.70711, 0.0, 0.0),
    'Index2_L': (0.94264, -0.33381, 0.0, 0.0),
    'Index3_L': (0.96593, -0.25882, 0.0, 0.0),
    'Middle1_L': (0.70711, -0.70711, 0.0, 0.0),
    'Middle2_L': (0.83389, -0.55194, 0.0, 0.0),
    'Middle3_L': (0.99939, -0.0349, 0.0, 0.0),
    'Ring1_L': (0.71934, -0.69466, 0.0, 0.0),
    'Ring2_L': (0.83389, -0.55194, 0.0, 0.0),
    'Ring3_L': (0.99939, -0.0349, 0.0, 0.0),
    'Pinky1_L': (0.73135, -0.682, 0.0, 0.0),
    'Pinky2_L': (0.90259, -0.43051, 0.0, 0.0),
    'Pinky3_L': (0.99939, -0.0349, 0.0, 0.0),
    'Thumb1_L': (0.95304, -0.27328, 0.03598, -0.12547),
    'Thumb2_L': (1.0, 0.0, 0.0, 0.0),
    'Thumb3_L': (1.0, 0.0, 0.0, 0.0),
}

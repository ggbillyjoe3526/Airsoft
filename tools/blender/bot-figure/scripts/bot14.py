# --- v6 (William, 11 October 10:33): arms, wrists and hands that look and move naturally with the replicas ---
# 1. Forearm twist bones: turning the palm (pronation and supination) happens along the whole forearm, as the radius
#    rolls round the ulna, not at the wrist joint. ForearmTwist1-4 ride the Forearm and carry 1/4 to 4/4 of the hand's
#    turn; the forearm skin is shared out along them, so the wrist and forearm keep their thickness.
# 2. Arms solved with the wrist in mind: for every frame the elbow is swung round the shoulder-wrist line to the
#    place where the wrist bends and the forearm turns least (inside a real wrist's range), close to the clip's own
#    elbow, clear of the torso, and close to the previous frame's elbow (no snaps).
import math
from mathutils import Matrix, Quaternion, Vector

TWIST_N = 4
TWIST_START = 0.08               # how far along the forearm (0 elbow, 1 wrist) the turn starts to show
WRIST = {'flex': 60.0, 'ext': 50.0, 'radial': 18.0, 'ulnar': 28.0}    # comfortable limits, degrees
TURN = {'sup': 85.0, 'pro': 80.0}                                       # forearm turn from the rest (palm in)
TORSO_R = 0.19                    # metres: the elbow stays this far from the spine line
SWIVEL_PRIOR = 0.012              # cost per degree squared away from the clip's own elbow
SWIVEL_SMOOTH = 0.05              # cost per degree squared away from the previous frame's elbow
ELBOW_DOWN = 0.006                # cost per degree squared of the elbow swung up from hanging below the arm's line
UPPER = tuple(UPPER) + ('ForearmTwist',) if 'ForearmTwist' not in UPPER else UPPER
# bake_clip matches a bone by its name less trailing 1-3 digits, so ForearmTwist4 needs its own entry
UPPER = tuple(UPPER) + ('ForearmTwist4',) if 'ForearmTwist4' not in UPPER else UPPER
SWIVEL_STEP = 15.0                # the elbow swings at most this far round the arm's line per frame (no snaps)


def twist_names(sd):
    return ['ForearmTwist%d_%s' % (k, sd) for k in range(1, TWIST_N + 1)]


def add_twist_bones(rig):
    """ForearmTwist1-4 per side: children of the Forearm, along its axis, with its roll."""
    if 'ForearmTwist1_L' in rig.data.bones:
        return
    for q in bpy.context.selected_objects:
        q.select_set(False)
    rig.hide_set(False)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    for sd in 'LR':
        fa = eb['Forearm_' + sd]
        d = (fa.tail - fa.head)
        for k, n in enumerate(twist_names(sd), 1):
            b = eb.new(n)
            b.head = fa.head + d * ((k - 0.5) / TWIST_N)
            b.tail = b.head + d.normalized() * 0.04
            b.roll = fa.roll
            b.parent = fa
            b.use_connect = False
            b.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT')


def twist_weights(objs, rig):
    """Share each vertex's Forearm weight out along the twist bones by how far it is down the forearm."""
    for o in objs:
        for sd in 'LR':
            g0 = o.vertex_groups.get('Forearm_' + sd)
            if g0 is None:
                continue
            gs = [g0] + [o.vertex_groups.get(n) or o.vertex_groups.new(name=n) for n in twist_names(sd)]
            b = rig.data.bones['Forearm_' + sd]
            h, tl = b.head_local, b.tail_local
            ax = tl - h
            L2 = ax.length_squared
            mw = rig.matrix_world.inverted() @ o.matrix_world
            for v in o.data.vertices:
                w = next((g.weight for g in v.groups if g.group == g0.index), 0.0)
                if w <= 0.0:
                    continue
                t = (mw @ v.co - h).dot(ax) / L2
                s = max(0.0, min(1.0, (t - TWIST_START) / (1.0 - TWIST_START)))
                pos = s * TWIST_N
                i = min(TWIST_N - 1, int(pos))
                fr = pos - i
                g0.remove([v.index])
                if (1 - fr) * w > 1e-4:
                    gs[i].add([v.index], (1 - fr) * w, 'ADD')
                if fr * w > 1e-4:
                    gs[i + 1].add([v.index], fr * w, 'ADD')
    limit_weights(objs)


# --- the arm solve -----------------------------------------------------------------------------------------------
def _swing_twist(q):
    """q = twist about Y, then swing: (twist degrees, swing quaternion)."""
    t = Quaternion((q.w, 0.0, q.y, 0.0))
    if t.magnitude < 1e-9:
        return 0.0, q
    t.normalize()
    ang = 2 * math.degrees(math.atan2(t.y, t.w))
    ang = (ang + 540.0) % 360.0 - 180.0
    return ang, t.inverted() @ q


def arm_setup(c):
    """Rest measurements for the arm solve, on the Ctl from anim_setup."""
    rig = c.rig
    db = rig.data.bones
    c.arm = {}
    for sd in 'LR':
        ua, fa, ha = db['UpperArm_' + sd], db['Forearm_' + sd], db['Hand_' + sd]
        F, H = fa.matrix_local.to_3x3(), ha.matrix_local.to_3x3()
        S, E, W = ua.head_local, fa.head_local, ha.head_local
        y = (W - E).normalized()
        h = (E - S).cross(W - E).normalized()
        x = F.col[0]
        alpha = math.atan2(h.cross(x).dot(y), h.dot(x))     # forearm X from the hinge, about the forearm axis
        palm = -(H.col[2])
        fwd = Vector((0, -1, 0))
        sup = 1.0 if (Quaternion(y, math.radians(10)) @ palm).dot(fwd) > palm.dot(fwd) else -1.0
        thumb = db['Thumb1_' + sd].head_local - ha.head_local
        radial = 1.0 if thumb.dot(H.col[0]) > 0 else -1.0
        c.arm[sd] = {'a': ua.length, 'b': fa.length, 'alpha': alpha, 'FH': F.inverted() @ H, 'sup': sup,
                     'radial': radial}
    c.swivel = {}


def wrist_angles(c, sd, F_pose, H_pose):
    """(flex, radial deviation, forearm turn) in degrees, flex towards the palm, turn towards supination."""
    A = c.arm[sd]
    L = (F_pose @ A['FH']).inverted() @ H_pose
    tw, sw = _swing_twist(L.to_quaternion())
    d = sw @ Vector((0, 1, 0))
    flex = math.degrees(math.atan2(-d.z, d.y))
    dev = math.degrees(math.atan2(d.x, d.y)) * A['radial']
    return flex, dev, tw * A['sup']


def _excess(v, lo, hi):
    return max(0.0, v - hi) + max(0.0, lo - v)


def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length


def solve_swivel(c, sd, S, W, Hrot, prior, prev, spine):
    """Best elbow for a shoulder S, wrist W and hand rotation Hrot (3x3, world). prior: the clip's pole point (or None);
    prev: the previous frame's swivel angle (or None); spine: (a, b) the spine line. Returns (angle, elbow, pole)."""
    A = c.arm[sd]
    a, b = A['a'], A['b']
    dv = W - S
    d = min(dv.length, a + b - 1e-4)
    n = dv.normalized()
    x = (a * a - b * b + d * d) / (2 * d)
    r = math.sqrt(max(a * a - x * x, 1e-8))
    down = Vector((0, 0, -1))
    e1 = (down - n * n.dot(down))
    if e1.length < 1e-6:
        e1 = Vector((0, 1, 0)) - n * n.y
    e1.normalize()
    e2 = n.cross(e1)

    def at(phi):
        p = math.radians(phi)
        e = e1 * math.cos(p) + e2 * math.sin(p)
        E = S + n * x + e * r
        y = (W - E).normalized()
        h = e.cross(n).normalized()
        xa = Quaternion(y, A['alpha']) @ h
        F = Matrix((xa, y, xa.cross(y))).transposed()
        return E, e, F

    pphi = None
    if prior is not None:
        pv = prior - S - n * n.dot(prior - S)
        if pv.length > 1e-6:
            pphi = math.degrees(math.atan2(pv.dot(e2), pv.dot(e1)))

    def adiff(u, v):
        return (u - v + 540.0) % 360.0 - 180.0

    if prev is not None and not isinstance(prev, (int, float)):
        # the previous frame's elbow offset from the shoulder, measured in this frame's basis (robust when the
        # shoulder-wrist line swings past vertical and the basis turns)
        pv = Vector(prev) - n * n.dot(Vector(prev))
        prev = math.degrees(math.atan2(pv.dot(e2), pv.dot(e1))) if pv.length > 1e-6 else None

    def cost(phi):
        E, e, F = at(phi)
        flex, dev, turn = wrist_angles(c, sd, F, Hrot)
        k = (_excess(flex, -WRIST['ext'], WRIST['flex']) ** 2 + _excess(dev, -WRIST['ulnar'], WRIST['radial']) ** 2
             + _excess(turn, -TURN['pro'], TURN['sup']) ** 2) * 4.0
        k += 0.004 * (flex * flex + dev * dev) + 0.002 * turn * turn
        cl = _seg_dist(E, *spine)
        if cl < TORSO_R:
            k += ((TORSO_R - cl) * 100.0) ** 2 * 20.0
        if pphi is not None:
            k += SWIVEL_PRIOR * adiff(phi, pphi) ** 2
        if prev is not None:
            k += SWIVEL_SMOOTH * adiff(phi, prev) ** 2
        k += ELBOW_DOWN * phi * phi
        return k

    if prev is None:
        best = float(min(range(-180, 180, 6), key=cost))
    else:
        best = min((prev + i * 3.0 for i in range(-int(SWIVEL_STEP // 3), int(SWIVEL_STEP // 3) + 1)), key=cost)
    lo = best
    for step in (2.0, 0.5):
        lo = min((lo + i * step for i in range(-3, 4)), key=cost)
    E, e, F = at(lo)
    return lo, E, E + e * 0.6


if not getattr(apply, 'v14', False):
    _apply13 = apply
    _bake_clip13 = bake_clip
    _anim_setup13 = anim_setup


def anim_setup(rig):
    c = _anim_setup13(rig)
    arm_setup(c)
    return c


def bake_clip(c, name, frames, fn, upper_only=False, loop=True):
    c.swivel = {}
    return _bake_clip13(c, name, frames, fn, upper_only, loop)


def apply(c, pose):
    _apply13(c, pose)
    if not hasattr(c, 'arm'):
        arm_setup(c)
    rig = c.rig
    pb = rig.pose.bones
    mw = rig.matrix_world
    spine = (mw @ pb['Spine'].head, mw @ pb['Neck'].head)
    moved = False
    for sd in pose.get('hands', {}):
        S = mw @ pb['UpperArm_' + sd].head
        e = c.e['Hand' + sd].matrix_world
        W, Hrot = e.translation.copy(), e.to_3x3().normalized()
        prior = Vector(pose['elbows'][sd]) if sd in pose.get('elbows', {}) else c.e['Elbow' + sd].location.copy()
        phi, E, pole = solve_swivel(c, sd, S, W, Hrot, prior, c.swivel.get(sd), spine)
        c.swivel[sd] = E - S
        c.e['Elbow' + sd].location = pole
        moved = True
    if moved:
        bpy.context.view_layer.update()
    for sd in 'LR':
        hl = rig.convert_space(pose_bone=pb['Hand_' + sd], matrix=pb['Hand_' + sd].matrix, from_space='POSE',
                               to_space='LOCAL').to_quaternion()
        tw, _ = _swing_twist(hl)
        for k, n in enumerate(twist_names(sd), 1):
            if n in pb:
                pb[n].rotation_quaternion = Quaternion((0, 1, 0), math.radians(tw * k / TWIST_N))
    bpy.context.view_layer.update()


apply.v14 = True


# --- seat search: how the hands sit on the replicas so the wrists can stay natural ---------------------------------
# The right fist turns round the AEG grip's own (raked) axis; the left hand rolls round the handguard and slides
# along it. For each candidate, every sample frame is solved for its best elbow; the candidate with the least wrist
# strain over the frames wins. Finger holds are then re-solved for the chosen seats.
GRIP_POINT = Vector((0.0, -0.075, -0.09))                       # on the AEG grip's axis, at the fist (replica space)
GRIP_AXIS = Vector((0.0, math.sin(math.radians(22.6)), math.cos(math.radians(22.6))))
GUARD_AXIS_Z = 0.041                                              # the handguard's centre line (x 0, z), replica space
SEAT_FRAMES = [('Idle', 0.0), ('Idle', 0.5), ('Rifle_Aim', 0.3), ('Rifle_AimUp', 0.3), ('Rifle_AimDown', 0.3),
               ('Run_F', 0.2), ('Walk_F', 0.4), ('CrouchIdle', 0.3), ('Jump', 0.4), ('CrouchWalk', 0.3)]


def wrist_best(c, sd, S, W, Hrot, spine):
    """The least wrist strain any elbow gives: (cost, (flex, deviation, turn), swivel)."""
    keep_p, keep_s = SWIVEL_PRIOR, SWIVEL_SMOOTH
    try:
        globals()['SWIVEL_PRIOR'] = globals()['SWIVEL_SMOOTH'] = 0.0
        phi, E, pole = solve_swivel(c, sd, S, W, Hrot, None, None, spine)
    finally:
        globals()['SWIVEL_PRIOR'], globals()['SWIVEL_SMOOTH'] = keep_p, keep_s
    A = c.arm[sd]
    y = (W - E).normalized()
    n = (W - S).normalized()
    e = (E - S - n * n.dot(E - S)).normalized()
    h = e.cross(n).normalized()
    xa = Quaternion(y, A['alpha']) @ h
    F = Matrix((xa, y, xa.cross(y))).transposed()
    fl, dv, tw = wrist_angles(c, sd, F, Hrot)
    k = (_excess(fl, -WRIST['ext'], WRIST['flex']) ** 2 + _excess(dv, -WRIST['ulnar'], WRIST['radial']) ** 2
         + _excess(tw, -TURN['pro'], TURN['sup']) ** 2)
    cl = _seg_dist(E, *spine)
    if cl < TORSO_R:
        k += ((TORSO_R - cl) * 100.0) ** 2 * 20.0
    k += ELBOW_DOWN * phi * phi
    return k, (round(fl), round(dv), round(tw)), round(phi)


def seat_samples(c, frames=None):
    """Shoulder points and spine lines per sample frame (they do not depend on the seats)."""
    rig = c.rig
    pb = rig.pose.bones
    mw = rig.matrix_world
    cl = {n: clip for n, clip, up in clips(c)}
    out = []
    for name, t in (frames or SEAT_FRAMES):
        fr, fn, loop = cl[name]
        pose = fn(t)
        _apply13(c, pose)
        out.append((name, t, fn, {sd: mw @ pb['UpperArm_' + sd].head for sd in 'LR'},
                    (mw @ pb['Spine'].head, mw @ pb['Neck'].head)))
    return out


def seat_score(c, samples, sides='LR'):
    tot = {sd: 0.0 for sd in sides}
    rows = []
    for name, t, fn, S, spine in samples:
        pose = fn(t)
        HOLD[0] = pose.get('hold', 'rifle')
        try:
            for sd in sides:
                if sd not in pose['hands']:
                    continue
                W, rot = hand_target(c, sd, *pose['hands'][sd])
                k, ang, phi = wrist_best(c, sd, S[sd], W, rot.to_matrix(), spine)
                tot[sd] += k
                rows.append((name, t, sd, round(k), ang, phi))
        finally:
            HOLD[0] = 'rifle'
    return tot, rows


def seat_rifle(d_psi, base=None):
    """The rifle seat turned d_psi degrees round the grip's axis (the replica turns in the fist)."""
    base = base or RIFLE_SEAT
    return base @ Matrix.Translation(GRIP_POINT) @ Matrix.Rotation(math.radians(d_psi), 4, GRIP_AXIS) @ \
        Matrix.Translation(-GRIP_POINT)


def support_rolled(base, roll, slide=0.0, yaw=0.0):
    """SUPPORT_ON_REPLICA entry turned `yaw` degrees on the palm (round the replica's up through the hand), rolled round
    the handguard's centre line and slid along it."""
    p, b, u = (Vector(x) for x in base)
    Y = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    b, u = Y @ b, Y @ u
    R = Matrix.Rotation(math.radians(roll), 3, 'Y')
    o = Vector((0.0, 0.0, GUARD_AXIS_Z))
    return (tuple(R @ (p - o) + o + Vector((0, slide, 0))), tuple(R @ b), tuple(R @ u))


# The grips measured on the real replicas (ray casts at x = 0): the AEG grip is raked 24.8 degrees, its top (under the
# receiver) at z -0.085 with its centre line at y -0.0515; the gas pistol's is raked 15.4 degrees, top at z -0.055,
# centre y -0.057. A seat puts that top point on the Grip_R bone's head (the top of the closed fist) and the grip's
# centre line along the bone's Z (the line a held bar takes through the fist), then turns the replica round it.
GRIPS = {'rifle': (Vector((0.0, -0.0515, -0.085)), 24.8), 'pistol': (Vector((0.0, -0.057, -0.055)), 15.4)}
# A bar held in a fist crosses the palm on a slant: from the heel of the hand (near the wrist) up to the base of the
# index finger. The Grip bones were built with that slant the wrong way round (going up the bar moved towards the
# wrist), which pointed the knuckles 36 degrees too far down and bent every wrist. The seat now turns the grip by
# GRIP_SLANT round the middle of the fist, so the bar runs up towards the knuckles as it does in a real hand.
GRIP_SLANT = 36.0
FIST_MID = 0.04                  # metres below the Grip bone's head (the top of the fist) to the fist's middle


def seat_from(key, psi, down=0.0, slant=None):
    p, rake = GRIPS[key]
    sl = GRIP_SLANT if slant is None else slant
    mid = Vector((0.0, 0.0, -FIST_MID))
    fix = Matrix.Translation(mid) @ Matrix.Rotation(math.radians(-sl), 4, 'X') @ Matrix.Translation(-mid)
    return (fix @ Matrix.Translation((0.0, 0.0, -down)) @ Matrix.Rotation(math.radians(psi), 4, 'Z') @
            Matrix.Rotation(math.radians(rake), 4, 'X') @ Matrix.Translation(-p))


# --- finger holds re-solved for the new seats (run with the figure posed on a frame that holds the replica) --------
def holds_from_pose(rig, sd):
    return {n: tuple(round(x, 5) for x in rig.pose.bones[n].rotation_quaternion)
            for n in FINGERS_ALL(sd)}


def solve_fingers(rig, objs, sd, plan):
    """plan: {finger: ('wrap', kwargs) | ('lay', fwd, kwargs)}. Poses the fingers in order (a finger's contact is
    checked against the replica surfaces in `objs`) and returns {finger: result}."""
    C = Contact(objs)
    radii = finger_radii(sd)
    out = {}
    pb = rig.pose.bones
    for f, how in plan.items():
        names = ['%s%d_%s' % (f, i, sd) for i in (1, 2, 3)]
        if how[0] == 'wrap':
            r = wrap_finger(rig, C, names, radii, **how[1])
            if r is None:
                out[f] = None
                continue
            rots, a, depth = r
            out[f] = (a, depth)
        else:
            r = lay_finger(rig, C, names, radii, how[1], **how[2])
            if r is None:
                out[f] = None
                continue
            rots = r[1]
            out[f] = (r[2], r[3], r[4])
        for n, q in zip(names, rots):
            pb[n].rotation_quaternion = q
        bpy.context.view_layer.update()
    return out


# --- v6 seats and holds (solved 11 October against the real replicas) -----------------------------------------------
# How they were found: the right fist is placed round the grip in the hand's own frame (grip axis along the knuckle
# line, front strap ahead of the fingers, palm on the right side, web of the hand high on the backstrap) and every
# candidate is scored on the finger wrap (no finger more than 2-2.5 mm into the surface, the middle and end segments
# touching, the fingertips on the far side) plus the wrist strain the arm solve needs over the sample frames. The
# trigger finger rests on the trigger (pad on the blade); the thumb lies along the right side of the receiver, as
# shooters do on an AEG. The support hand cups the handguard from below: palm under it, fingers up its right side,
# thumb up the left. On the pistol the left hand is the right hand's grip mirrored, moved forward over the right
# fingers and turned in, its fingers wrapping the right hand's.
RIFLE_SEAT = Matrix([[0.805781, 0.382011, -0.452531, -0.038293], [-0.2159, 0.901037, 0.37619, 0.080339],
                     [0.551456, -0.205425, 0.808515, 0.050959], [0.0, 0.0, 0.0, 1.0]])
PISTOL_SEAT = Matrix([[0.805781, 0.450791, -0.384062, -0.019122], [-0.2159, 0.827497, 0.518301, 0.079554],
                      [0.551456, -0.334718, 0.764107, 0.026286], [0.0, 0.0, 0.0, 1.0]])
REPLICA_ON_GRIP['rifle'] = RIFLE_SEAT
REPLICA_ON_GRIP['pistol'] = PISTOL_SEAT
SUPPORT_ON_REPLICA['rifle'] = ((0.00939, 0.26244, 0.00144), (0.58131, 0.79864, 0.15576), (-0.77142, 0.60181, -0.2067))
SUPPORT_ON_REPLICA['pistol'] = ((-0.02536, 0.00583, -0.06983), (0.3794, 0.75194, 0.53911), (-0.6687, -0.17985, 0.72145))

# finger angles (MCP, PIP, DIP curl in degrees; spread at the MCP in degrees) for each hold
FINGER_ANGLES = {
    ('rifle', 'R'): {'Index': ((0, 10, 6), 5), 'Middle': ((20, 25, 17.5), -5), 'Ring': ((30, 35, 24.5), -10),
                     'Pinky': ((45, 25, 17.5), 5), 'Thumb': ((-4, 0, 0), -18)},
    ('rifle', 'L'): {'Index': ((10, 10, 7), 20), 'Middle': ((15, 15, 10.5), 5), 'Ring': ((20, 20, 14), -15),
                     'Pinky': ((40, 35, 24.5), -15), 'Thumb': ((8, 30, 24), -18)},
    ('pistol', 'R'): {'Index': ((0, 0, 0), 5), 'Middle': ((25, 35, 24.5), -15), 'Ring': ((40, 35, 24.5), -5),
                      'Pinky': ((45, 30, 21), 20), 'Thumb': ((2, 0, 0), 0)},
    ('pistol', 'L'): {'Index': ((54, 48, 33.6), -10), 'Middle': ((36, 36, 25), 0), 'Ring': ((42, 60, 42), 10),
                      'Pinky': ((54, 48, 33.6), 0), 'Thumb': ((26, 6, 4.8), 0)},
}
TRIGGER_PRESS = (6.0, 18.0, 12.0)      # extra index curl (MCP, PIP, DIP) at full trigger press


def finger_rots(sd, angles, extra=None):
    """{bone: Quaternion} from FINGER_ANGLES-style angles; `extra` adds degrees per finger: {finger: (a1, a2, a3)}."""
    out = {}
    for f, (angs, sp) in angles.items():
        add = (extra or {}).get(f, (0.0, 0.0, 0.0))
        for k, a in enumerate(angs):
            q = Quaternion((1, 0, 0), -math.radians(a + add[k]))
            if k == 0 and sp:
                q = Quaternion((0, 0, 1), math.radians(sp if sd == 'R' else sp)) @ q
            out['%s%d_%s' % (f, k + 1, sd)] = q
    return out


def set_holds():
    for key, angles in FINGER_ANGLES.items():
        HOLDS[key] = {n: tuple(q) for n, q in finger_rots(key[1], angles).items()}


set_holds()


# --- the magazine in the left hand during the reloads ---------------------------------------------------------------
# The replicas' own Reload clips move the magazine node (replica space, no turn): the old one drops free, the new one
# appears below the well and is pushed home with a small overshoot. The left hand fetches a magazine from the belt,
# carries it to where the replica's new magazine appears, then follows it up to the seat. MAG_IN_HAND is where the
# magazine node sits in the Hand_L bone frame while held, so the game can show a spare magazine in the hand between
# the pouch and the moment the replica's own magazine reappears (sidecar 'magazineInHand').
AEG_MAG = [(0.0000, (0.0, 0.0620, -0.0760)), (0.0370, (0.0, 0.0620, -0.0760)), (0.0556, (0.0, 0.0622, -0.0767)),
           (0.0741, (0.0, 0.0635, -0.0818)), (0.0926, (0.0, 0.0678, -0.0985)), (0.1111, (0.0, 0.0755, -0.1284)),
           (0.1296, (0.0, 0.0856, -0.1674)), (0.1481, (0.0, 0.0969, -0.2115)), (0.1667, (0.0, 0.1086, -0.2567)),
           (0.1852, (0.0, 0.1194, -0.2989)), (0.2037, (0.0, 0.1285, -0.3340)), (0.2222, (0.0, 0.1347, -0.3581)),
           (0.2407, (0.0, 0.1370, -0.3670)), (0.5000, (0.0, 0.1370, -0.3670)), (0.5093, (0.0, 0.1020, -0.2312)),
           (0.5185, (0.0, 0.0978, -0.2148)), (0.5370, (0.0, 0.0904, -0.1863)), (0.5556, (0.0, 0.0845, -0.1633)),
           (0.5741, (0.0, 0.0798, -0.1451)), (0.5926, (0.0, 0.0762, -0.1310)), (0.6111, (0.0, 0.0734, -0.1203)),
           (0.6296, (0.0, 0.0714, -0.1124)), (0.6481, (0.0, 0.0699, -0.1067)), (0.6667, (0.0, 0.0688, -0.1025)),
           (0.6852, (0.0, 0.0680, -0.0991)), (0.7037, (0.0, 0.0671, -0.0960)), (0.7222, (0.0, 0.0662, -0.0923)),
           (0.7407, (0.0, 0.0650, -0.0876)), (0.7593, (0.0, 0.0635, -0.0817)), (0.7778, (0.0, 0.0621, -0.0764)),
           (0.7963, (0.0, 0.0615, -0.0741)), (0.8148, (0.0, 0.0616, -0.0746)), (0.8333, (0.0, 0.0619, -0.0755)),
           (0.8519, (0.0, 0.0620, -0.0760)), (1.0000, (0.0, 0.0620, -0.0760))]
PISTOL_MAG = [(0.0000, (0.0, -0.0670, -0.0200)), (0.0417, (0.0, -0.0670, -0.0200)),
              (0.0556, (0.0, -0.0671, -0.0202)), (0.0833, (0.0, -0.0689, -0.0247)),
              (0.1111, (0.0, -0.0760, -0.0426)), (0.1389, (0.0, -0.0884, -0.0738)),
              (0.1667, (0.0, -0.1038, -0.1125)), (0.1944, (0.0, -0.1198, -0.1527)),
              (0.2222, (0.0, -0.1341, -0.1888)), (0.2500, (0.0, -0.1444, -0.2147)),
              (0.2778, (0.0, -0.1484, -0.2246)), (0.5000, (0.0, -0.1484, -0.2246)),
              (0.5139, (0.0, -0.1188, -0.1502)), (0.5278, (0.0, -0.1122, -0.1336)),
              (0.5556, (0.0, -0.1010, -0.1056)), (0.5833, (0.0, -0.0924, -0.0838)),
              (0.6111, (0.0, -0.0858, -0.0673)), (0.6389, (0.0, -0.0810, -0.0553)),
              (0.6667, (0.0, -0.0777, -0.0469)), (0.6944, (0.0, -0.0754, -0.0411)),
              (0.7222, (0.0, -0.0738, -0.0372)), (0.7500, (0.0, -0.0726, -0.0342)),
              (0.7778, (0.0, -0.0715, -0.0312)), (0.8056, (0.0, -0.0700, -0.0274)),
              (0.8333, (0.0, -0.0680, -0.0225)), (0.8611, (0.0, -0.0665, -0.0187)),
              (0.8889, (0.0, -0.0663, -0.0183)), (0.9167, (0.0, -0.0667, -0.0193)),
              (0.9444, (0.0, -0.0670, -0.0200)), (1.0000, (0.0, -0.0670, -0.0200))]
MAG_APPEARS = {'rifle': 0.5093, 'pistol': 0.5139}       # the replica's new magazine shows from here
MAG_SEATED = {'rifle': 0.7963, 'pistol': 0.8889}         # the overshoot peak (the push home)


def mag_at(key, t):
    """The replica's magazine node position (replica space), linear between the sampled keys like the glb."""
    tr = AEG_MAG if key == 'rifle' else PISTOL_MAG
    if t <= tr[0][0]:
        return Vector(tr[0][1])
    for (t0, v0), (t1, v1) in zip(tr, tr[1:]):
        if t <= t1:
            u = (t - t0) / max(t1 - t0, 1e-9)
            return Vector(v0).lerp(Vector(v1), u)
    return Vector(tr[-1][1])


# where the left hand holds each magazine (Hand_L frame in the magazine node's frame): round the AEG magazine's body
# like a fist on a grip (index at the top, thumb behind); under the pistol magazine's base plate, palm up, fingers
# forward along its front, ready to push it home
L_IN_MAG = {'rifle': Matrix([[-0.457749, 0.375742, -0.805781, -0.059176], [-0.367837, 0.745067, 0.556392, -0.030154],
                             [0.809421, 0.551084, -0.202842, -0.111909], [0.0, 0.0, 0.0, 1.0]]),
            'pistol': Matrix([[-1.0, 0.0, 0.0, -0.000819], [0.0, 0.930033, -0.367476, -0.112491],
                              [0.0, -0.367476, -0.930033, -0.10257], [0.0, 0.0, 0.0, 1.0]])}
MAG_FINGERS = {'rifle': {'Index': ((18, 20, 14), 0), 'Middle': ((28, 35, 24.5), 5), 'Ring': ((38, 45, 31.5), 10),
                         'Pinky': ((53, 35, 24.5), -5), 'Thumb': ((10, 15, 10), 10)},
               'pistol': {'Index': ((8, 10, 7), 5), 'Middle': ((20, 25, 17), 0), 'Ring': ((25, 30, 21), -5),
                          'Pinky': ((30, 30, 21), -10), 'Thumb': ((10, 10, 8), 0)}}
OPEN_L = {f: ((4, 6, 3), 0) for f in ('Index', 'Middle', 'Ring', 'Pinky')}
OPEN_L['Thumb'] = ((0, 4, 2), 0)
POUCH = Vector((0.06, -0.20, 1.17))     # where a spare magazine's top sits on the belt/chest, world (figure faces -Y)
MAG_IN_HAND_TIMES = {'Rifle_Reload': (0.33, 0.5093), 'Pistol_Reload': (0.33, 0.5139)}


def _gl_rel(c):
    """Grip_L's rest frame in Hand_L's (for turning a hand frame into the clip's grip/barrel/up)."""
    bones = c.rig.data.bones
    return bones['Hand_L'].matrix_local.inverted() @ bones['Grip_L'].matrix_local


def _grip_from_rep(pt, dr, M):
    """(grip, barrel, up) in the world for a Grip_L frame M given in replica space."""
    return pt(M.translation), dr(M.col[1].xyz), dr(M.col[2].xyz)


def _frame_q(barrel, up):
    b = Vector(barrel).normalized()
    u = (Vector(up) - b * b.dot(Vector(up))).normalized()
    return Matrix((b.cross(u), b, u)).transposed().to_quaternion()


def _blend_hand(a, b, u):
    """Blend two (grip, barrel, up) hand frames: position linear, turn by slerp (shortest way)."""
    qa, qb = _frame_q(a[1], a[2]), _frame_q(b[1], b[2])
    if qa.dot(qb) < 0:
        qb = -qb
    q = qa.slerp(qb, u).to_matrix()
    return Vector(a[0]).lerp(Vector(b[0]), u), q.col[1], q.col[2]


def _hand_path(track, t):
    """track: [(time, frame or callable(t) -> frame)], eased between keys; a callable key is followed exactly."""
    if t <= track[0][0]:
        k = track[0][1]
        return k(t) if callable(k) else k
    for (t0, a), (t1, b) in zip(track, track[1:]):
        if t <= t1:
            if callable(a) and callable(b):
                return a(t)
            fa = a(t0) if callable(a) else a
            fb = b(t1) if callable(b) else b
            return _blend_hand(fa, fb, ease((t - t0) / max(t1 - t0, 1e-9)))
    k = track[-1][1]
    return k(t) if callable(k) else k


def _fingers_blend(bones, sd, a, b, u):
    ra, rb = finger_rots(sd, a), finger_rots(sd, b)
    for n in ra:
        qa, qb = ra[n], rb[n]
        if qa.dot(qb) < 0:
            qb = -qb
        bones[n] = qa.slerp(qb, u)


def _finger_track(bones, sd, track, t):
    """track: [(time, angles)] eased between keys (angles in FINGER_ANGLES form)."""
    if t <= track[0][0]:
        _fingers_blend(bones, sd, track[0][1], track[0][1], 0.0)
        return
    for (t0, a), (t1, b) in zip(track, track[1:]):
        if t <= t1:
            _fingers_blend(bones, sd, a, b, ease((t - t0) / max(t1 - t0, 1e-9)))
            return
    _fingers_blend(bones, sd, track[-1][1], track[-1][1], 0.0)


# the left hand takes the rifle magazine a little round its front (thumb towards the well) and draws it from the
# pouch tipped out towards the hand: the wrist stays under 45 degrees all through the reload
MAG_HAND_TURN = 30.0
POUCH_TURN = {'rifle': (30.0, -30.0, 0.0), 'pistol': (0.0, 0.0, 0.0)}   # degrees about world X, Y, Z
L_IN_MAG['rifle'] = Matrix.Rotation(math.radians(MAG_HAND_TURN), 4, Vector((0, 0.37, -0.93)).normalized()) @ L_IN_MAG['rifle']
L_IN_MAG['pistol'] = Matrix.Rotation(math.radians(-20.0), 4, Vector((0, 0, -1))) @ L_IN_MAG['pistol']   # and the pistol's


def _pouch_frame(key, c):
    """The left hand's grip frame (world) closing on a spare magazine drawn from its pouch."""
    rep_to_world = Matrix(((-1, 0, 0), (0, -1, 0), (0, 0, 1))).to_4x4()
    rx, ry, rz = POUCH_TURN[key]
    R = (Matrix.Rotation(math.radians(rz), 4, 'Z') @ Matrix.Rotation(math.radians(ry), 4, 'Y') @
         Matrix.Rotation(math.radians(rx), 4, 'X'))
    M = Matrix.Translation(POUCH) @ R @ rep_to_world @ L_IN_MAG[key] @ _gl_rel(c)
    return M.translation, M.col[1].xyz, M.col[2].xyz


def _mag_frame(key, c, pt, dr, t):
    M = Matrix.Translation(mag_at(key, t)) @ L_IN_MAG[key] @ _gl_rel(c)
    return _grip_from_rep(pt, dr, M)


def clip_rifle_reload14(c):
    """The AEG reload in step with the replica's own Reload clip (1.8 s): the old magazine drops free, the left hand
    fetches a new one from the pouch, brings it under the well as the replica's magazine reappears, pushes it home
    (the replica's small overshoot is the tap) and goes back to the handguard. The head dips to watch the well."""
    key = 'rifle'
    def f(t):
        bones = {'Hips': Q(Y_AX, -10)}
        spine(bones, pitch=keys([(0, 2.0), (0.2, 8.0), (0.8, 8.0), (1, 2.0)], t), yaw=12,
              head_pitch=keys([(0, -6.0), (0.14, -22.0), (0.84, -22.0), (1.0, -6.0)], t),
              head_yaw=keys([(0, -4.0), (0.14, -10.0), (0.84, -10.0), (1.0, -4.0)], t))
        tilt = keys([(0, 0.0), (0.12, 28.0), (0.80, 28.0), (0.95, 0.0)], t)
        g, fdir, u = gun(Vector((-0.125, -0.06, 1.33)), pitch=keys([(0, -30.0), (0.12, -12.0), (0.85, -12.0),
                                                                    (1, -30.0)], t), yaw=8, roll=tilt)
        pt, dr = on_replica(key, g, fdir, u)
        sup = rifle_hands(g, fdir, u, left_at=0.19)['L']
        strip = _grip_from_rep(pt, dr, Matrix.Translation(Vector((-0.02, 0.04, -0.18))) @ L_IN_MAG[key] @ _gl_rel(c))
        pouch = _pouch_frame(key, c)
        a = MAG_APPEARS[key]
        below = _mag_frame(key, c, pt, dr, a)
        lift = _lift_frame(pouch, below)
        track = [(0.0, sup), (0.04, sup), (0.13, strip), (0.30, pouch), (0.36, pouch), (0.42, lift),
                 (a - 0.03, below), (a, lambda tt: _mag_frame(key, c, pt, dr, tt)),
                 (0.85, lambda tt: _mag_frame(key, c, pt, dr, tt)), (0.97, sup), (1.0, sup)]
        hands = {'R': (g, fdir, u), 'L': _hand_path(track, t)}
        hold = FINGER_ANGLES[(key, 'L')]
        _finger_track(bones, 'L', [(0.0, hold), (0.05, hold), (0.12, OPEN_L), (0.30, OPEN_L), (0.36, MAG_FINGERS[key]),
                                   (0.85, MAG_FINGERS[key]), (0.90, OPEN_L), (0.97, hold), (1.0, hold)], t)
        rh = FINGER_ANGLES[(key, 'R')]
        rh_off = dict(rh)
        rh_off['Index'] = ((0, 0, 0), rh['Index'][1])          # off the trigger while the magazine is out
        _finger_track(bones, 'R', [(0.0, rh), (0.06, rh_off), (0.90, rh_off), (1.0, rh)], t)
        return stand(c, bones, hands, elbows(c, left=0.35, down=0.4))
    return 54, f, False


# the pistol held low and close for the reload, elbows down by the sides (not winged out), the left forearm turned palm
# up under the grip (it needs a little more turn than the holds)
PISTOL_RELOAD = {'pos': (-0.06, -0.40, 1.26), 'roll': 0.0, 'pitch': -18.0,
                 'elbow': {'L': (0.10, -0.12, -0.32), 'R': (-0.12, -0.05, -0.32)}, 'sup': 72.0, 'elbow_down': 0.05}
PISTOL_RETURN = (0.88, 1.00)      # the left hand leaves the seated magazine and takes the two-hand grip again
PISTOL_RETURN_MID = None          # optional in-between key (fraction of the return, offset, blend to the grip)


def _return_keys(a, b):
    """Keys from the magazine back to the grip: straight, or through an in-between frame part-way round."""
    if not PISTOL_RETURN_MID:
        return [(1.0, b), (1.0 + 1e-6, b)]
    k, off, w = PISTOL_RETURN_MID
    m = _blend_hand(a, b, w)
    return [(k, (m[0] + Vector(off), m[1], m[2])), (1.0, b), (1.0 + 1e-6, b)]


def clip_pistol_reload14(c):
    """The pistol reload in step with the replica's Reload clip (1.2 s): the left thumb presses the release, the
    magazine drops, the left hand brings a new one from the pouch and pushes it into the grip with the heel of the
    palm, then takes the two-hand grip again."""
    key = 'pistol'
    r0, r1 = PISTOL_RETURN
    def f(t):
        bones = {'Hips': Q(Y_AX, -6)}
        spine(bones, pitch=keys([(0, 0.0), (0.2, 8.0), (0.8, 8.0), (1, 0.0)], t), yaw=6,
              head_pitch=keys([(0, -10.0), (0.16, -24.0), (0.86, -24.0), (1.0, -10.0)], t), head_yaw=-2)
        P = PISTOL_RELOAD
        pos = keys([(0, (-0.03, -0.45, 1.44)), (0.16, P['pos']), (0.84, P['pos']), (1.0, (-0.03, -0.45, 1.44))], t)
        roll = keys([(0, 0.0), (0.16, P['roll']), (0.84, P['roll']), (1.0, 0.0)], t)
        pitch = keys([(0, 0.0), (0.16, P['pitch']), (0.84, P['pitch']), (1.0, 0.0)], t)
        hands = pistol(Vector(pos), pitch=pitch, roll=roll)
        g, fdir, u = hands['R']
        pt, dr = on_replica(key, g, fdir, u)
        sup = hands['L']
        pouch = _pouch_frame(key, c)
        a = MAG_APPEARS[key]
        below = _mag_frame(key, c, pt, dr, a)
        below = (below[0] - dr(Vector((0, 0.37, 0.93))) * 0.06, below[1], below[2])
        lift = _lift_frame(pouch, below)
        track = [(0.0, sup), (0.07, sup), (0.30, pouch), (0.36, pouch), (0.42, lift), (a - 0.03, below),
                 (a, lambda tt: _mag_frame(key, c, pt, dr, tt)), (r0, lambda tt: _mag_frame(key, c, pt, dr, tt))]
        track += [(r0 + (r1 - r0) * k, m) for k, m in _return_keys(_mag_frame(key, c, pt, dr, r0), sup)]
        hands['L'] = _hand_path(track, t)
        hold = FINGER_ANGLES[(key, 'L')]
        press = dict(hold)
        press['Thumb'] = ((hold['Thumb'][0][0] + 22, hold['Thumb'][0][1] + 10, hold['Thumb'][0][2] + 6), hold['Thumb'][1])
        _finger_track(bones, 'L', [(0.0, hold), (0.03, press), (0.06, hold), (0.12, OPEN_L), (0.30, OPEN_L),
                                   (0.36, MAG_FINGERS[key]), (r0, MAG_FINGERS[key]), (r0 + (r1 - r0) * 0.5, OPEN_L),
                                   (r1, hold), (1.0, hold)], t)
        rh = FINGER_ANGLES[(key, 'R')]
        rh_off = dict(rh)
        rh_off['Index'] = ((0, -4, 0), rh['Index'][1])
        _finger_track(bones, 'R', [(0.0, rh), (0.08, rh_off), (0.92, rh_off), (1.0, rh)], t)
        el = elbows(c, out=0.35, back=-0.05, down=0.45)
        k = keys([(0, 0.0), (0.16, 1.0), (0.84, 1.0), (1.0, 0.0)], t)
        for sd in 'LR':
            el[sd] = el[sd].lerp(c.rest['UpperArm_' + sd].translation + Vector(P['elbow'][sd]), k)
        pose = stand(c, bones, hands, el)
        pose['turn'] = {'sup': TURN['sup'] + (P['sup'] - TURN['sup']) * k}
        pose['elbow_down'] = ELBOW_DOWN + (P['elbow_down'] - ELBOW_DOWN) * k
        return pose
    return 36, f, False


def clip_pistol_aim14(c, pitch):
    """Pistol aim up/down: the arms swing round the shoulders with the pistol (the wrists stay straight), instead of
    the pistol tipping in still hands."""
    sh = (c.rest['UpperArm_L'].translation + c.rest['UpperArm_R'].translation) * 0.5
    gp = pitch * 0.55
    rot = Q(X_AX, -gp)
    def f(t):
        br = math.sin(2 * math.pi * t)
        bones = {'Hips': Q(Y_AX, -14)}
        spine(bones, pitch=-pitch * 0.45, yaw=6, head_pitch=-pitch * 0.25, head_yaw=-2)
        p0 = Vector((-0.03, -0.45, 1.44 + 0.002 * br))
        hands = pistol(sh + rot @ (p0 - sh), pitch=gp)
        el = {sd: sh + rot @ (v - sh) for sd, v in elbows(c, out=0.35, back=-0.05, down=0.45).items()}
        return stand(c, bones, hands, el, hips=Vector((0, 0, -0.015)))
    return 30, f, True


def _with_fingers(fn, edit):
    def g(t):
        pose = fn(t)
        edit(pose['bones'], t)
        return pose
    return g


def clip_fire14(aim_fn, key):
    """One trigger press (0.2 s) over the aim pose's first frame: the game plays it per shot, as an additive layer
    (three.js AnimationUtils.makeClipAdditive against its first frame), in step with the replica's own Fire clip."""
    rh = FINGER_ANGLES[(key, 'R')]
    def edit(bones, t):
        k = keys([(0.0, 0.0), (0.3, 1.0), (0.55, 1.0), (1.0, 0.0)], t)
        bones.update(finger_rots('R', {'Index': rh['Index']}, {'Index': tuple(x * k for x in TRIGGER_PRESS)}))
    return 6, _with_fingers(lambda t: aim_fn(0.0), edit), False


def _idle_regrip(bones, t):
    """Idle: halfway through, the left hand loosens on the handguard and takes it again; the right index lifts off the
    trigger a little and settles back."""
    k = keys([(0.0, 0.0), (0.45, 0.0), (0.58, 1.0), (0.72, 0.0), (1.0, 0.0)], t)
    if k <= 0.0:
        return
    hl = FINGER_ANGLES[('rifle', 'L')]
    bones.update(finger_rots('L', hl, {f: (-7 * k, -6 * k, -3 * k) for f in ('Index', 'Middle', 'Ring', 'Pinky')}))
    hr = FINGER_ANGLES[('rifle', 'R')]
    bones.update(finger_rots('R', {'Index': hr['Index']}, {'Index': (-4 * k, -8 * k, -4 * k)}))


if not getattr(clips, 'v14', False):
    _clips13 = clips


def clips(c):
    out = []
    by = {}
    for name, clip, upper in _clips13(c):
        by[name] = clip
        if name == 'Rifle_Reload':
            clip = _in_context(name, clip_rifle_reload14(c), upper)
        elif name == 'Pistol_Reload':
            clip = _in_context(name, clip_pistol_reload14(c), upper)
        elif name in ('Pistol_AimUp', 'Pistol_AimDown'):
            clip = _in_context(name, clip_pistol_aim14(c, 60.0 if name.endswith('Up') else -60.0), upper)
        elif name == 'Idle':
            fr, fn, loop = clip
            clip = (fr, _with_fingers(fn, _idle_regrip), loop)
        out.append((name, clip, upper))
    for name, src, key in (('Rifle_Fire', 'Rifle_Aim', 'rifle'), ('Pistol_Fire', 'Pistol_Aim', 'pistol')):
        fr, fn, loop = by[src]
        out.append((name, clip_fire14(fn, key), True))
    return out


clips.v14 = True


# --- rebuilding a figure with the v6 arms ---------------------------------------------------------------------------
def build14(kind='human'):
    """build_human_full / build_robot_full with the forearm twist bones and their weights added before the clips are
    baked. Returns (meshes, lods, info) like those."""
    keep = B['remake']
    B['remake'] = lambda only=None: None          # the first bake would be thrown away
    try:
        meshes, lods, _ = (B['build_human_full'] if kind == 'human' else B['build_robot_full'])()
    finally:
        B['remake'] = keep
    rig = bpy.data.objects['Rig']
    add_twist_bones(rig)
    twist_weights([o for o in meshes + lods if o.type == 'MESH'], rig)
    limit_weights([o for o in meshes + lods if o.type == 'MESH'])
    info = B['remake']()
    return meshes, lods, info


def grip_info14():
    """grip_info plus where the left hand holds a spare magazine during the reloads."""
    out = B['grip_info']()
    rows = lambda m: [[round(x, 5) for x in r] for r in m]
    out['magazineInHand'] = {
        name: {'replica': 'rifle' if name.startswith('Rifle') else 'pistol', 'bone': 'Hand_L',
               'from': a, 'to': b,
               'magazineOnBone': rows(L_IN_MAG['rifle' if name.startswith('Rifle') else 'pistol'].inverted())}
        for name, (a, b) in MAG_IN_HAND_TIMES.items()}
    out['magazineInHandNote'] = ('Between from and to (fractions of the clip) show a copy of the replica\'s Magazine '
                                 'mesh on the bone: magazineOnBone is the replica magazine node\'s frame in the bone '
                                 'frame (row-major, Blender axes, origin at the bone head), as replicaOnGrip. From "to" '
                                 'on, the replica\'s own Reload clip shows its magazine in the same place.')
    out['fireClips'] = {'Rifle_Fire': 'rifle', 'Pistol_Fire': 'pistol'}
    out['fireClipsNote'] = ('One trigger press each (0.2 s). Play additively per shot: '
                            'AnimationUtils.makeClipAdditive(clip, 0) and blend over the aim clips.')
    return out


# --- v6 round 2: the last arm limits (forearm turn, snaps, sprint carry, elbow volume) -----------------------------
TURN['sup'] = 72.0               # the solver's turn and the check's differ by about 15 degrees: keep the left under 95
UPPER = tuple(UPPER) + ('ElbowHelper',) if 'ElbowHelper' not in UPPER else UPPER
ELBOW_SHARE = 0.9                # how much of the elbow crease the helper bone takes (it turns half as far as the forearm)
SPRINT_GUN = (Vector((-0.11, -0.07, 1.26)), -48.0, 6.0)   # grip point, pitch, yaw: muzzle well down, rifle close in


def add_elbow_helpers(rig):
    """ElbowHelper_L/R: children of the UpperArm at the elbow with the Forearm's rest frame. apply() turns them half as
    far as the forearm, so the skin in the crease follows a bone half-way round instead of averaging two (which pinches
    the elbow in a deep bend)."""
    if 'ElbowHelper_L' in rig.data.bones:
        return
    for q in bpy.context.selected_objects:
        q.select_set(False)
    rig.hide_set(False)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    for sd in 'LR':
        fa = eb['Forearm_' + sd]
        b = eb.new('ElbowHelper_' + sd)
        b.head = fa.head.copy()
        b.tail = fa.head + (fa.tail - fa.head).normalized() * 0.05
        b.roll = fa.roll
        b.parent = eb['UpperArm_' + sd]
        b.use_connect = False
        b.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT')


def elbow_weights(objs):
    """Move ELBOW_SHARE x 2 x min(upper arm, forearm) of each crease vertex's weight onto the helper, taken evenly from
    the two sides."""
    for o in objs:
        for sd in 'LR':
            gu = o.vertex_groups.get('UpperArm_' + sd)
            if gu is None:
                continue
            gf = [g for g in (o.vertex_groups.get(n) for n in ['Forearm_' + sd] + twist_names(sd)) if g]
            gh = o.vertex_groups.get('ElbowHelper_' + sd) or o.vertex_groups.new(name='ElbowHelper_' + sd)
            fi = {g.index: g for g in gf}
            for v in o.data.vertices:
                wu = next((g.weight for g in v.groups if g.group == gu.index), 0.0)
                fw = {g.group: g.weight for g in v.groups if g.group in fi}
                wf = sum(fw.values())
                h = ELBOW_SHARE * 2.0 * min(wu, wf)
                if h < 1e-3:
                    continue
                gu.add([v.index], wu - h * 0.5, 'REPLACE')
                for gi, w in fw.items():
                    fi[gi].add([v.index], w - h * 0.5 * w / wf, 'REPLACE')
                gh.add([v.index], h, 'ADD')
    limit_weights(objs)


if not getattr(apply, 'v14b', False):
    _apply14 = apply


def apply(c, pose):
    global ELBOW_DOWN
    keep = dict(TURN), ELBOW_DOWN
    TURN.update(pose.get('turn', {}))                 # a clip may allow a little more turn or pull the elbows down
    ELBOW_DOWN = pose.get('elbow_down', ELBOW_DOWN)
    try:
        _apply14(c, pose)
    finally:
        TURN.update(keep[0])
        ELBOW_DOWN = keep[1]
    pb = c.rig.pose.bones
    for sd in 'LR':
        n = 'ElbowHelper_' + sd
        if n in pb:
            q = pb['Forearm_' + sd].matrix_basis.to_quaternion()
            pb[n].rotation_mode = 'QUATERNION'
            pb[n].rotation_quaternion = Quaternion().slerp(q, 0.5)
    bpy.context.view_layer.update()


apply.v14 = True
apply.v14b = True


def _sprint_upper(c, t, bones, b):
    """Sprint: the rifle held close at a low carry, muzzle down, both hands on it (the old port-arms carry turned the
    right forearm 144 degrees)."""
    p, pitch, yaw = SPRINT_GUN
    g, f, u = gun(p + b, pitch=pitch, yaw=yaw)
    fingers(bones, 'R', 'trigger')
    fingers(bones, 'L', 'support')
    return rifle_hands(g, f, u, left_at=0.19), elbows(c, out=0.40, back=0.2, down=0.40)


HIT_RAISE = 0.45                 # seconds for the hand to go up (it turns the palm forward on the way)
HIT_MID = (0.5, (0.15, 0.0, 0.05), (0.2, -0.3, 1.0), (0.0, 1.0, 0.2))    # in-between: palm in, thumb back
SWIVEL_SEED = {'WalkOff': 'HitCall'}                                     # start from the end of that clip's elbows


def _hit_upper(c, u, bones, b=Vector()):
    """The hit call: the free hand goes up high, open, palm forward; the rifle hangs muzzle down in the other. The
    left hand passes through a palm-in frame (HIT_MID) on the way up, so the forearm turns the natural way round
    instead of flipping, and both hands turn by slerp."""
    lr = low_ready(c, b)
    up = (Vector((0.21, -0.05, 1.90)) + b, Vector((0, 0.15, 1)).normalized(), Vector((-1, 0, 0)))
    df = Vector((0, -0.35, -1)).normalized()
    du = (Vector((0, -1, 0.3)) - df * df.dot(Vector((0, -1, 0.3)))).normalized()
    down = (Vector((-0.235, -0.07, 1.00)) + b, df, du)
    um, off, md, mu = HIT_MID
    m = (lr['L'][0].lerp(up[0], 0.5) + Vector(off), Vector(md).normalized(), Vector(mu).normalized())
    L = _blend_hand(lr['L'], m, u / um) if u < um else _blend_hand(m, up, (u - um) / (1 - um))
    hands = {'L': L, 'R': _blend_hand(lr['R'], down, u)}
    fingers(bones, 'L', 'support', 'open', u)
    fingers(bones, 'R', 'trigger')
    el = elbows(c)
    el['L'] = el['L'].lerp(c.rest['UpperArm_L'].translation + Vector((0.55, 0.05, 0.10)), u)
    el['R'] = el['R'].lerp(c.rest['UpperArm_R'].translation + Vector((-0.25, 0.35, -0.3)), u)
    return hands, el


def clip_hit14(c):
    def f(t):
        u = ease(t / HIT_RAISE)
        bones = {'Hips': Q(Y_AX, -8 * (1 - u))}
        flinch = keys([(0, 0.0), (0.08, -6.0), (0.25, 2.0), (1.0, -3.0)], t)
        spine(bones, pitch=flinch, yaw=10 * (1 - u), head_pitch=keys([(0, 0.0), (0.1, 8.0), (0.4, -10.0),
                                                                      (1.0, -6.0)], t))
        hands, el = _hit_upper(c, u, bones)
        return stand(c, bones, hands, el, hips=Vector((0, 0, -0.012)))
    return 30, f, False


def bake_clip(c, name, frames, fn, upper_only=False, loop=True):
    """As before, but a clip the game plays straight after another (WalkOff after HitCall) starts from that clip's
    last elbows, so the forearms don't roll round during the crossfade."""
    seed = getattr(c, 'swivel_end', {}).get(SWIVEL_SEED.get(name))
    c.swivel = dict(seed) if seed else {}
    out = _bake_clip13(c, name, frames, fn, upper_only, loop)
    if not hasattr(c, 'swivel_end'):
        c.swivel_end = {}
    c.swivel_end[name] = dict(c.swivel)
    return out


# the left hand waits flat on the chest while the right draws; the hands meet at the chest and press out to the aim
SWITCH = {'chest': ((0.06, -0.21, 1.22), (-1.0, -0.1, 0.25), (0.0, -0.3, 1.0)), 'press': (0.72, (-0.05, -0.30, 1.30))}


def clip_switch14(c):
    """Rifle to pistol: the rifle drops to its sling (the game hides it at 0.35) while the right hand goes to the
    holster and draws; the left hand waits on the chest, meets the pistol there and both press out to the aim. Hands
    turn by slerp."""
    def f(t):
        bones = {'Hips': Q(Y_AX, -8)}
        spine(bones, pitch=keys([(0, 1.5), (0.4, 6.0), (1, 0.0)], t), yaw=keys([(0, 10.0), (0.4, 4.0), (1, 6.0)], t),
              head_pitch=-6)
        lr = low_ready(c)
        aim = pistol(Vector((-0.03, -0.45, 1.44)))
        holster = Vector((-0.215, -0.010, 0.985))
        hd = Vector((0, -0.2, -1)).normalized()
        hu = Vector((0, -1, 0.2)).normalized()
        chest = (Vector(SWITCH['chest'][0]), Vector(SWITCH['chest'][1]).normalized(), Vector(SWITCH['chest'][2]).normalized())
        tp, pp = SWITCH['press']
        press = pistol(Vector(pp))
        R = [(0.0, lr['R']), (0.35, (holster + Vector((0, 0, 0.05)), hd, hu)),
             (0.42, (holster + Vector((0, -0.02, 0.06)), hd, hu)), (tp, press['R']), (1.0, aim['R'])]
        L = [(0.0, lr['L']), (0.35, chest), (tp - 0.12, chest), (tp, press['L']), (1.0, aim['L'])]
        hands = {'R': _hand_path(R, t), 'L': _hand_path(L, t)}
        if t < 0.35:
            u = ease(t / 0.35)
            fingers(bones, 'R', 'trigger', 'relax', u)
            fingers(bones, 'L', 'support', 'relax', u)
        else:
            u = ease((t - 0.35) / 0.65)
            fingers(bones, 'R', 'relax', 'trigger', u)
            fingers(bones, 'L', 'relax', 'support', ease((t - SWITCH['press'][0] + 0.12) / 0.12))
        return stand(c, bones, hands, elbows(c, out=0.4, back=0.1, down=0.4))
    return 18, f, False


# head and neck turns (degrees about the bone's X, then Z) laid over a clip: the cheek rests on the stock aiming low
# instead of the stock passing into it, and aiming high the head stays down on the stock instead of thrown back
HEAD_FIX = {'Rifle_AimDown': ((0.0, -12.0), (0.0, -8.0)), 'Rifle_AimUp': ((25.0, 0.0), (20.0, 0.0)),
            'Pistol_AimUp': ((12.0, 0.0), (10.0, 0.0))}


def _head_fix(clip, fix):
    (hx, hz), (nx, nz) = fix
    fr, fn, lp = clip
    def g(t):
        pose = fn(t)
        bs = pose['bones']
        bs['Head'] = bs.get('Head', Quaternion()) @ Q(Z_AX, hz) @ Q(X_AX, hx)
        bs['Neck'] = bs.get('Neck', Quaternion()) @ Q(Z_AX, nz) @ Q(X_AX, nx)
        return pose
    return fr, g, lp


if not getattr(clips, 'v14b', False):
    _clips14 = clips


def clips(c):
    out = []
    for name, clip, upper in _clips14(c):
        if name == 'Sprint':
            clip = _in_context(name, clip_gait(c, SPEEDS['sprint'], 0.30, 0.95, 0.22, (0, -1, 0), drop=0.07, bob=0.035,
                                               lean=15.0, yaw_amp=8.0, upper=_sprint_upper), upper)
        elif name == 'Switch':
            clip = _in_context(name, clip_switch14(c), upper)
        elif name == 'HitCall':
            clip = _in_context(name, clip_hit14(c), upper)
        if name in HEAD_FIX:
            clip = _head_fix(clip, HEAD_FIX[name])
        out.append((name, clip, upper))
    return out


clips.v14 = True
clips.v14b = True


def arms_quick(names=None, limit=None):
    """The arms check's angle rows, measured in Blender on the baked actions (no skin rows): wrist bend, wrist-joint
    twist, forearm turn and the biggest per-frame snap. Returns {clip: row} and prints the rows over the limits."""
    limit = limit or {'bend': 75, 'tw': 60, 'turn': 95, 'snap': 40}
    rig = bpy.data.objects['Rig']
    pb, db = rig.pose.bones, rig.data.bones
    mw = rig.matrix_world
    last = lambda sd: ('ForearmTwist4_' + sd) if ('ForearmTwist4_' + sd) in pb else ('Forearm_' + sd)
    twist = lambda q: ((2 * math.degrees(math.atan2(q.y, q.w)) + 540) % 360) - 180

    def rel(a, b, m):
        return (m(a).to_quaternion().inverted() @ m(b).to_quaternion()).normalized()
    rest = {sd: (rel(last(sd), 'Hand_' + sd, lambda n: db[n].matrix_local),
                 rel('Forearm_' + sd, 'Hand_' + sd, lambda n: db[n].matrix_local)) for sd in 'LR'}
    arm = ['UpperArm_L', 'Forearm_L', 'Hand_L', 'UpperArm_R', 'Forearm_R', 'Hand_R']
    out = {}
    keep = rig.animation_data.action
    sc = bpy.context.scene
    muted = [(k, k.mute) for p in pb for k in p.constraints]     # the bake's IK targets would override the action
    for k, _ in muted:
        k.mute = True
    for tr in rig.animation_data.nla_tracks:
        if names and tr.name not in names:
            continue
        act = tr.strips[0].action
        rig.animation_data.action = act
        f0, f1 = (int(round(x)) for x in act.frame_range)
        row = {'bend': {'L': 0, 'R': 0}, 'tw': {'L': 0, 'R': 0}, 'turn': {'L': 0, 'R': 0}, 'snap': (0, '', 0)}
        prev = None
        for fr in range(f0, f1 + 1):
            sc.frame_set(fr)
            m = lambda n: mw @ pb[n].matrix
            for sd in 'LR':
                fh = m('Hand_' + sd).translation - m('Forearm_' + sd).translation
                hm = m('Middle1_' + sd).translation - m('Hand_' + sd).translation
                row['bend'][sd] = max(row['bend'][sd], math.degrees(fh.angle(hm)))
                q1 = rest[sd][0].inverted() @ rel(last(sd), 'Hand_' + sd, m)
                q2 = rest[sd][1].inverted() @ rel('Forearm_' + sd, 'Hand_' + sd, m)
                row['tw'][sd] = max(row['tw'][sd], abs(twist(q1)))
                row['turn'][sd] = max(row['turn'][sd], abs(twist(q2)))
            cur = {n: m(n).to_quaternion() for n in arm}
            if prev:
                for n in arm:
                    d = math.degrees(2 * math.acos(min(1.0, abs(prev[n].dot(cur[n])))))
                    if d > row['snap'][0]:
                        row['snap'] = (d, n, (fr - f0) / 30.0)
            prev = cur
        out[tr.name] = row
        bad = [f'{k} {sd} {row[k][sd]:.0f}' for k in ('bend', 'tw', 'turn') for sd in 'LR' if row[k][sd] > limit[k]]
        if row['snap'][0] > limit['snap']:
            bad.append('snap %.0f %s @%.2f' % row['snap'])
        if bad:
            print(tr.name, '; '.join(bad))
    rig.animation_data.action = keep
    for k, m in muted:
        k.mute = m
    return out


HAND_HARD_R = 0.07              # metres from the wrist: the glove's wrist strap and knuckle guard


def smooth_hand_hard(objs, rig):
    """The glove's wrist strap and knuckle guard (Hard, round the hands) take one flat texel of the stipple normal map:
    the world-axis UVs smeared the stipple into a scribble on those small curved parts."""
    img = bpy.data.materials['Hard'].node_tree.nodes['dress_nrm'].image
    w, h = img.size
    px = img.pixels[:]
    best, uv = 9.0, (0.5, 0.5)
    for i in range(0, w * h):
        d = abs(px[4 * i] - 0.5) + abs(px[4 * i + 1] - 0.5)
        if d < best:
            best, uv = d, (((i % w) + 0.5) / w, ((i // w) + 0.5) / h)
    db = rig.data.bones
    for o in objs:
        slots = [k for k, s in enumerate(o.material_slots) if s.material and s.material.name == 'Hard']
        if not slots or not o.data.uv_layers:
            continue
        inv = o.matrix_world.inverted() @ rig.matrix_world
        wr = [inv @ db['Hand_' + sd].head_local for sd in 'LR']
        uvl = o.data.uv_layers.active.data
        for p in o.data.polygons:
            if p.material_index in slots and min((p.center - x).length for x in wr) < HAND_HARD_R:
                for li in p.loop_indices:
                    uvl[li].uv = uv


def build14(kind='human'):
    """build_human_full / build_robot_full with the forearm twist bones, the elbow helpers and their weights added
    before the clips are baked. Returns (meshes, lods, info) like those."""
    keep = B['remake']
    B['remake'] = lambda only=None: None          # the first bake would be thrown away
    try:
        meshes, lods, _ = (B['build_human_full'] if kind == 'human' else B['build_robot_full'])()
    finally:
        B['remake'] = keep
    rig = bpy.data.objects['Rig']
    objs = [o for o in meshes + lods if o.type == 'MESH']
    add_twist_bones(rig)
    add_elbow_helpers(rig)
    twist_weights(objs, rig)
    elbow_weights(objs)
    smooth_hand_hard(objs, rig)
    info = B['remake']()
    return meshes, lods, info


# --- round 3 (v14c): crouch walk elbows, the hit call's rifle hand, the magazine in the palm ------------------------
# Crouch walking, the chest leans well forward, so the low ready sits a little further out and lower than standing:
# the elbows then hang by the sides instead of winging out (offset in metres, elbow_down cost)
CROUCH_GUN = ((0.0, -0.08, -0.04), 0.05)
# the hit call's right hand: the arm hangs nearly straight and the rifle hangs muzzle down by the right thigh, elbow
# by the side (grip position,
# barrel, and the elbow prior from the upper arm's rest)
HIT_DOWN = ((-0.21, -0.10, 0.90), (0.0, -0.35, -1.0), (-0.05, 0.05, -0.40))
MAG_SLIDE = {'rifle': 0.025, 'pistol': 0.0}      # the left hand further down the magazine body (metres along it)
L_IN_MAG['rifle'] = Matrix.Translation(Vector((0, 0.37, -0.93)).normalized() * MAG_SLIDE['rifle']) @ L_IN_MAG['rifle']
POUCH = Vector((0.06, -0.24, 1.14))  # the spare magazine half drawn when the hand closes on it: the elbow stays forward
MAG_FINGERS['pistol']['Index'] = ((20, 24, 16), 2)   # the index wraps the magazine too, not straight up beside it


def _crouch_upper(c, t, bones, b):
    hands = low_ready(c, b + Vector(CROUCH_GUN[0]))
    fingers(bones, 'R', 'trigger')
    fingers(bones, 'L', 'support')
    return hands, elbows(c)


def _crouch_extra(pose, t):
    pose['elbow_down'] = CROUCH_GUN[1]


def _hit_upper(c, u, bones, b=Vector()):
    """The hit call: the free hand goes up high, open, palm forward; the rifle hangs muzzle down in front of the right
    hip. The left hand passes through a palm-in frame (HIT_MID) on the way up, so the forearm turns the natural way
    round instead of flipping, and both hands turn by slerp."""
    lr = low_ready(c, b)
    up = (Vector((0.21, -0.05, 1.90)) + b, Vector((0, 0.15, 1)).normalized(), Vector((-1, 0, 0)))
    dp, dfv, del_ = HIT_DOWN
    df = Vector(dfv).normalized()
    du = (Vector((0, -1, 0.3)) - df * df.dot(Vector((0, -1, 0.3)))).normalized()
    down = (Vector(dp) + b, df, du)
    um, off, md, mu = HIT_MID
    m = (lr['L'][0].lerp(up[0], 0.5) + Vector(off), Vector(md).normalized(), Vector(mu).normalized())
    L = _blend_hand(lr['L'], m, u / um) if u < um else _blend_hand(m, up, (u - um) / (1 - um))
    hands = {'L': L, 'R': _blend_hand(lr['R'], down, u)}
    fingers(bones, 'L', 'support', 'open', u)
    fingers(bones, 'R', 'trigger')
    el = elbows(c)
    el['L'] = el['L'].lerp(c.rest['UpperArm_L'].translation + Vector((0.55, 0.05, 0.10)), u)
    el['R'] = el['R'].lerp(c.rest['UpperArm_R'].translation + Vector(del_), u)
    return hands, el


if not getattr(clips, 'v14c', False):
    _clips14b = clips


def clips(c):
    out = []
    for name, clip, upper in _clips14b(c):
        if name == 'CrouchWalk':
            clip = _in_context(name, clip_gait(c, SPEEDS['crouch'], 0.62, 0.52, 0.06, (0, -1, 0), drop=0.0, bob=0.012,
                                               lean=6.0, yaw_amp=5.0, crouch=0.42, upper=_crouch_upper,
                                               extra=_crouch_extra), upper)
        out.append((name, clip, upper))
    return out


clips.v14 = clips.v14b = clips.v14c = True


def build14(kind='human'):
    """build_human_full / build_robot_full with the forearm twist bones and the elbow helpers. The human's skin is
    shared out along them; the robot's forearm shells stay rigid on the forearm (a machine part doesn't wring, and
    spreading a rigid shell over the twist bones opens its end caps). Returns (meshes, lods,
    info) like those."""
    keep = B['remake']
    B['remake'] = lambda only=None: None          # the first bake would be thrown away
    try:
        meshes, lods, _ = (B['build_human_full'] if kind == 'human' else B['build_robot_full'])()
    finally:
        B['remake'] = keep
    rig = bpy.data.objects['Rig']
    objs = [o for o in meshes + lods if o.type == 'MESH']
    add_twist_bones(rig)
    add_elbow_helpers(rig)
    if kind == 'human':
        twist_weights(objs, rig)
    elbow_weights(objs)                           # only skin shared by both bones (the robot's arm cable) moves
    smooth_hand_hard(objs, rig)
    info = B['remake']()
    return meshes, lods, info


# --- round 4 (v14d): the support hand's C-grip, the magazine carried tipped towards the well, one magazine at a time --
# The support hand sits 14 mm further under the handguard (towards the near side) so the knuckles hug the far bottom
# corner; the fingers rise up the far side with their tips below the side rail and the thumb lies along the near side
# (solved against the AEG's handguard: no segment more than 2 mm into it, tips within 2 mm of it).
_p, _b, _u = SUPPORT_ON_REPLICA['rifle']
SUPPORT_ON_REPLICA['rifle'] = ((_p[0] - 0.014, _p[1], _p[2]), _b, _u)
FINGER_ANGLES[('rifle', 'L')] = {'Index': ((-5, 5, 3), 12), 'Middle': ((-5, 20, 14), 3), 'Ring': ((-5, 30, 21), -6),
                                 'Pinky': ((20, 20, 14), -14), 'Thumb': ((15, 20, 16), -18)}
set_holds()
LIFT_TURN = 0.5          # lifted from the pouch, the magazine is already turned half-way towards the well
# the replica's own dropped magazine hangs under the gun until the new one is pushed in: a figure hides it from here
# (fraction of the clip, once it has fallen clear of the hand) until MAG_APPEARS
MAG_HIDE_FROM = {'rifle': 0.22, 'pistol': 0.22}


def _lift_frame(pouch, below):
    """Out of the pouch: 7 cm up, already turned part-way towards the well (the magazine tips towards the gun instead
    of standing upright in the fist)."""
    f = _blend_hand(pouch, below, LIFT_TURN)
    return pouch[0] + Vector((0, 0, 0.07)), f[1], f[2]


if not getattr(grip_info14, 'v14d', False):
    _grip_info14c = grip_info14


def grip_info14():
    out = _grip_info14c()
    for name, row in out['magazineInHand'].items():
        key = row['replica']
        row['replicaMagazineHidden'] = [MAG_HIDE_FROM[key], MAG_APPEARS[key]]
    out['magazineInHandNote'] += (' replicaMagazineHidden: between these fractions hide the replica\'s own magazine '
                                  '(the dropped one, which its Reload clip leaves hanging under the gun).')
    return out


grip_info14.v14d = True


# Switch: the left hand waits low on the stomach (not flat on the chest with the elbow out) and the right elbow stays
# down and behind the hip on the draw; both ease back to the clip's own arms for the press out to the aim
SWITCH['chest'] = ((0.03, -0.17, 1.10), (-1.0, -0.1, 0.25), (0.0, -0.3, 1.0))
SWITCH_TUCK = {'elbow_down': 0.3, 'R': (0.04, 0.10, -0.34), 'until': (0.6, 0.9)}


def _switch_tuck(clip, c):
    fr, fn, lp = clip
    a, b = SWITCH_TUCK['until']
    def g(t):
        pose = fn(t)
        k = keys([(0.0, 1.0), (a, 1.0), (b, 0.0), (1.0, 0.0)], t)
        pose['elbow_down'] = pose.get('elbow_down', ELBOW_DOWN) + (SWITCH_TUCK['elbow_down'] - ELBOW_DOWN) * k
        pose['elbows']['R'] = pose['elbows']['R'].lerp(c.rest['UpperArm_R'].translation + Vector(SWITCH_TUCK['R']), k)
        return pose
    return fr, g, lp


if not getattr(clips, 'v14d', False):
    _clips14c = clips


# extra head and neck turns (bone, axis, degrees) after HEAD_FIX: aiming low, the neck turns and the head tips away
# from the stock so the ear cup clears it (measured: 6.6 mm into it before, 4.7 mm clear after)
HEAD_EXTRA = {'Rifle_AimDown': [('Neck', 'Z', -8.0), ('Head', 'Y', 8.0)]}
_AXES = {'X': X_AX, 'Y': Y_AX, 'Z': Z_AX}


def _head_extra(clip, turns):
    fr, fn, lp = clip
    def g(t):
        pose = fn(t)
        bs = pose['bones']
        for bone, ax, deg in turns:
            bs[bone] = bs.get(bone, Quaternion()) @ Q(_AXES[ax], deg)
        return pose
    return fr, g, lp


def clips(c):
    out = []
    for n, cl, u in _clips14c(c):
        if n == 'Switch':
            cl = _switch_tuck(cl, c)
        if n in HEAD_EXTRA:
            cl = _head_extra(cl, HEAD_EXTRA[n])
        out.append((n, cl, u))
    return out


clips.v14 = clips.v14b = clips.v14c = clips.v14d = True

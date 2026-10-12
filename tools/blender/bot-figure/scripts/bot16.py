# bot16.py: v8 round (11 October): fixes from the v7 QA and critic. The rifle trigger finger hooks the blade with its
# tip, the support hand grips the AEG handguard (thumb along its near side), the left arm stays outside the body in
# the pistol reload, the hand opens before the old magazine leaves it, and the robot's fingers wrap the magazines.
# Loaded after bot15.py into the same namespace.
# marker: V16_START
import math
import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

# --- the rifle trigger finger --------------------------------------------------------------------------------------
# The AEG leaves 9 mm between the blade's front face and the magazine, so the finger crosses the blade at its middle
# (y 6 mm, 51 mm under the receiver) and its last joint curls round it, the tip on the far side: the pad pulls the
# blade instead of the finger lying straight towards the magazine (searched over the index's three joints, no segment
# more than 1.2 mm into the guard, grip or magazine; the blade itself sits in the pad's crease).
FINGER_ANGLES[('rifle', 'R')]['Index'] = ((-4, 15, 23), 5)

# --- the support hand on the AEG handguard -------------------------------------------------------------------------
# The fingers already wrapped the far side; the thumb stood off the near side by up to 14 mm and read as an open
# palm. The thumb now lies up the near side (no segment more than 1.7 mm in or 2.2 mm off it), the pinky no longer
# sits 4 mm into the handguard and the middle finger closes its 5 mm gap.
for _f, _a in {'Index': ((-10, 6, 6.0), 12), 'Middle': ((-5, 18, 10.8), 4), 'Ring': ((5, 18, 18.0), -6),
               'Pinky': ((15, 12, 7.2), -28), 'Thumb': ((24, 32, 16.0), 18)}.items():
    FINGER_ANGLES[('rifle', 'L')][_f] = _a
set_holds()
# marker: V16_FINGERS

# --- the hand opens before the throw -------------------------------------------------------------------------------
# The fingers now open over the two frames before the release instead of after it, so the thrown magazine never
# passes through them.
OPEN_BEFORE_RELEASE = 0.04          # fraction of the clip


# --- arms clear of the body ----------------------------------------------------------------------------------------
# The elbow solve kept only the elbow itself 0.19 m from the spine line, so in the pistol reload the forearm crossed
# the belly and the upper arm went into the vest (83 vertices inside at worst). Clips that flag `torso_clear` also
# score each candidate elbow on the upper arm and forearm against the body's own torso surface at that frame.
TORSO_BONES = ('Hips', 'Spine', 'Spine1', 'Chest')
ARM_RADIUS = {'human': (0.040, 0.034), 'robot': (0.042, 0.038)}      # upper arm, forearm (metres)
TORSO_SLACK = 0.006                 # metres the sleeve may press into the vest before it costs anything
TORSO_COST = 6.0                    # per millimetre squared beyond the slack
_TORSO = {'faces': None, 'tree': None, 'kind': 'human', 'on': False}


def _torso_faces():
    out = {}
    for on in ('Body', 'Kit'):
        o = bpy.data.objects.get(on)
        if o is None:
            continue
        names = {g.index: g.name for g in o.vertex_groups}
        ok = set(v.index for v in o.data.vertices
                 if v.groups and names[max(v.groups, key=lambda g: g.weight).group] in TORSO_BONES)
        out[on] = [p.index for p in o.data.polygons if all(i in ok for i in p.vertices)]
    return out


def _torso_tree():
    # the face lists belong to one build of one figure: rebuild them when the meshes change (human <-> robot)
    fkey = tuple((on, len(o.data.vertices)) for on in ('Body', 'Kit') for o in [bpy.data.objects.get(on)] if o)
    if _TORSO['faces'] is None or _TORSO.get('fkey') != fkey:
        _TORSO['faces'] = _torso_faces()
        _TORSO['fkey'] = fkey
    dg = bpy.context.evaluated_depsgraph_get()
    V, P = [], []
    for on, fl in _TORSO['faces'].items():
        o = bpy.data.objects[on]
        oe = o.evaluated_get(dg)
        me = oe.to_mesh()
        M = o.matrix_world
        idx = {}
        for fi in fl:
            tup = []
            for vi in me.polygons[fi].vertices:
                if vi not in idx:
                    idx[vi] = len(V)
                    V.append(M @ me.vertices[vi].co)
                tup.append(idx[vi])
            P.append(tup)
        oe.to_mesh_clear()
    return BVHTree.FromPolygons(V, P)


def _torso_cost(S, E, W):
    T = _TORSO['tree']
    if T is None:
        return 0.0
    ru, rf = ARM_RADIUS.get(_TORSO['kind'], ARM_RADIUS['human'])
    k = 0.0
    for a, b, r, ss in ((S, E, ru, (0.5, 0.75, 1.0)), (E, W, rf, (0.15, 0.4, 0.65, 0.9))):
        for s in ss:
            p = a.lerp(b, s)
            loc, n, i, d = T.find_nearest(p)
            if loc is None:
                continue
            sd = (d if (p - loc).dot(n) >= 0 else -d) - r
            slack = TORSO_SLACK_KIND.get(_TORSO['kind'], TORSO_SLACK)
            if sd < -slack:
                k += ((-sd - slack) * 1000.0) ** 2 * TORSO_COST
    return k


if not getattr(solve_swivel, 'v16', False):
    _solve_swivel14 = solve_swivel


def solve_swivel(c, sd, S, W, Hrot, prior, prev, spine):
    """The v14 elbow solve, plus (in flagged clips) the arm's distance from the torso: the best elbow is searched again
    with the torso cost added, starting from v14's answer."""
    if not _TORSO['on'] or sd != 'L' or TORSO_COST <= 0.0:
        return _solve_swivel14(c, sd, S, W, Hrot, prior, prev, spine)
    if _TORSO['tree'] is None:
        _TORSO['tree'] = _torso_tree()
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

    def elbow(phi):
        p = math.radians(phi)
        return S + n * x + (e1 * math.cos(p) + e2 * math.sin(p)) * r

    base = _solve_swivel14(c, sd, S, W, Hrot, prior, prev, spine)
    def total(phi):
        E = elbow(phi)
        return _torso_cost(S, E, W) + _wrist_cost(c, sd, S, E, W, Hrot, prior, prev, spine)

    pphi = None
    if prev is not None and not isinstance(prev, (int, float)):
        pv = Vector(prev) - n * n.dot(Vector(prev))
        if pv.length > 1e-6:
            pphi = math.degrees(math.atan2(pv.dot(e2), pv.dot(e1)))
    if pphi is None:
        best = min((base[0] + i * 6.0 for i in range(-30, 31)), key=total)
    else:                           # no snaps: at most twice v14's step per frame from the previous elbow
        span = int(2 * SWIVEL_STEP // 3)
        best = min((pphi + i * 3.0 for i in range(-span, span + 1)), key=total)
    for step in (2.0, 0.5):
        best = min((best + i * step for i in range(-3, 4)), key=total)
    E = elbow(best)
    e = (E - S - n * n.dot(E - S)).normalized()
    return best, E, E + e * 0.6


def _wrist_cost(c, sd, S, E, W, Hrot, prior, prev, spine):
    """v14's elbow cost (wrist limits, elbow to spine, prior, smoothing, elbow down) for the elbow E."""
    A = c.arm[sd]
    n = (W - S).normalized()
    y = (W - E).normalized()
    e = (E - S - n * n.dot(E - S))
    e = e.normalized() if e.length > 1e-9 else Vector((0, 0, -1))
    h = e.cross(n).normalized()
    xa = Quaternion(y, A['alpha']) @ h
    F = Matrix((xa, y, xa.cross(y))).transposed()
    flex, dev, turn = wrist_angles(c, sd, F, Hrot)
    k = (_excess(flex, -WRIST['ext'], WRIST['flex']) ** 2 + _excess(dev, -WRIST['ulnar'], WRIST['radial']) ** 2
         + _excess(turn, -TURN['pro'], TURN['sup']) ** 2) * 4.0
    k += 0.004 * (flex * flex + dev * dev) + 0.002 * turn * turn
    down = Vector((0, 0, -1))
    e1 = (down - n * n.dot(down))
    e1 = e1.normalized() if e1.length > 1e-6 else Vector((0, 1, 0))
    phi = math.degrees(math.atan2(e.dot(n.cross(e1)), e.dot(e1)))
    k += ELBOW_DOWN * phi * phi
    cl = _seg_dist(E, *spine)
    if cl < TORSO_R:
        k += ((TORSO_R - cl) * 100.0) ** 2 * 20.0
    if prior is not None:
        pv = prior - S - n * n.dot(prior - S)
        if pv.length > 1e-6:
            k += SWIVEL_PRIOR * math.degrees(pv.normalized().angle(e)) ** 2
    if prev is not None:
        pv = Vector(prev) - n * n.dot(Vector(prev)) if not isinstance(prev, (int, float)) else None
        if pv is not None and pv.length > 1e-6:
            dphi = math.degrees(pv.normalized().angle(e))
            k += SWIVEL_SMOOTH * dphi * dphi
    return k


solve_swivel.v16 = True

if not getattr(apply, 'v16', False):
    _apply_base16 = apply


def apply(c, pose):
    _TORSO['on'] = bool(pose.get('torso_clear'))
    _TORSO['tree'] = None
    try:
        _apply_base16(c, pose)
    finally:
        _TORSO['on'] = False
        _TORSO['tree'] = None


apply.v16 = True
# marker: V16_TORSO


# --- the reload clips again: the hand opens before the release, the pistol reload keeps the arm off the body --------
def clip_rifle_reload14(c):
    """The AEG reload in step with the replica's own Reload clip (1.8 s): the left hand catches the old magazine as it
    drops, pulls it out and throws it away, takes a new one from the pouch, brings it under the well as the
    replica's magazine reappears, pushes it home (the replica's overshoot is the tap) and goes back to the handguard."""
    key = 'rifle'
    grab, pulled, rel, follow = (_rl(key, n) for n in ('grab', 'pulled', 'release', 'follow'))
    p0, p1 = _rl(key, 'pouch')
    lift_t = _rl(key, 'lift')
    def f(t):
        bones = {'Hips': Q(Y_AX, -10)}
        spine(bones, pitch=keys([(0, 2.0), (0.2, 8.0), (0.8, 8.0), (1, 2.0)], t), yaw=12,
              head_pitch=keys([(0, -6.0), (0.10, -22.0), (0.84, -22.0), (1.0, -6.0)], t),
              head_yaw=keys([(0, -4.0), (0.10, -10.0), (0.84, -10.0), (1.0, -4.0)], t))
        tilt = keys([(0, 0.0), (0.10, 28.0), (0.80, 28.0), (0.95, 0.0)], t)
        g, fdir, u = gun(Vector((-0.125, -0.06, 1.33)), pitch=keys([(0, -30.0), (0.10, -12.0), (0.85, -12.0),
                                                                    (1, -30.0)], t), yaw=8, roll=tilt)
        pt, dr = on_replica(key, g, fdir, u)
        sup = rifle_hands(g, fdir, u, left_at=0.19)['L']
        on_mag = lambda tt: _mag_frame(key, c, pt, dr, tt)
        pouch = _pouch_frame(key, c)
        a = MAG_APPEARS[key]
        below = _mag_frame(key, c, pt, dr, a)
        lift = _lift_frame(pouch, below)
        on_old = lambda tt: _old_frame(key, c, pt, dr, tt)
        track = [(0.0, sup), (0.02, sup), (grab, on_old), (pulled, on_old), (follow, _toss_frame(on_old(pulled), pouch)),
                 (p0, pouch), (p1, pouch), (lift_t, lift), (a - 0.03, below), (a, on_mag), (0.85, on_mag),
                 (0.97, sup), (1.0, sup)]
        hands = {'R': (g, fdir, u), 'L': _hand_path(track, t)}
        hold = FINGER_ANGLES[(key, 'L')]
        mf = MAG_FINGERS[key]
        _finger_track(bones, 'L', [(0.0, hold), (0.03, OPEN_L), (grab, mf), (rel - OPEN_BEFORE_RELEASE, mf), (rel, OPEN_L),
                                   (p0, OPEN_L), (p1, mf), (0.85, mf), (0.90, OPEN_L), (0.97, hold), (1.0, hold)], t)
        rh = FINGER_ANGLES[(key, 'R')]
        rh_off = dict(rh)
        rh_off['Index'] = ((0, 0, 0), rh['Index'][1])          # off the trigger while the magazine is out
        _finger_track(bones, 'R', [(0.0, rh), (0.06, rh_off), (0.90, rh_off), (1.0, rh)], t)
        return stand(c, bones, hands, elbows(c, left=0.35, down=0.4))
    return RELOAD15[key]['frames'], f, False


def clip_pistol_reload14(c):
    """The pistol reload in step with the replica's Reload clip (1.2 s): the left thumb presses the release, the left
    hand catches the dropping magazine by its base plate, strips it out and throws it away, brings a new one from the
    pouch and pushes it into the grip with the heel of the palm, then takes the two-hand grip again."""
    key = 'pistol'
    r0, r1 = PISTOL_RETURN
    grab, pulled, rel, follow = (_rl(key, n) for n in ('grab', 'pulled', 'release', 'follow'))
    p0, p1 = _rl(key, 'pouch')
    lift_t = _rl(key, 'lift')
    def f(t):
        bones = {'Hips': Q(Y_AX, -6)}
        spine(bones, pitch=keys([(0, 0.0), (0.2, 8.0), (0.8, 8.0), (1, 0.0)], t), yaw=6,
              head_pitch=keys([(0, -10.0), (0.16, -24.0), (0.86, -24.0), (1.0, -10.0)], t), head_yaw=-2)
        P = PISTOL_RELOAD
        pos = keys([(0, (-0.03, -0.45, 1.44)), (0.16, P['pos']), (0.84, P['pos']), (1.0, (-0.03, -0.45, 1.44))], t)
        roll = keys([(0, 0.0), (0.16, P['roll']), (0.84, P['roll']), (1.0, 0.0)], t)
        pitch = keys([(0, 0.0), (0.16, P['pitch']), (0.84, P['pitch']), (1.0, 0.0)], t)
        yaw = keys([(0, 0.0), (0.16, P.get('yaw', 0.0)), (0.84, P.get('yaw', 0.0)), (1.0, 0.0)], t)
        hands = pistol(Vector(pos), pitch=pitch, roll=roll, yaw=yaw)
        g, fdir, u = hands['R']
        pt, dr = on_replica(key, g, fdir, u)
        sup = hands['L']
        on_mag = lambda tt: _mag_frame(key, c, pt, dr, tt)
        pouch = _pouch_frame(key, c)
        a = MAG_APPEARS[key]
        below = _mag_frame(key, c, pt, dr, a)
        below = (below[0] - dr(Vector((0, 0.37, 0.93))) * 0.06, below[1], below[2])
        lift = _lift_frame(pouch, below)
        on_old = lambda tt: _old_frame(key, c, pt, dr, tt)
        track = [(0.0, sup), (0.04, sup), (grab, on_old), (pulled, on_old), (follow, _toss_frame(on_old(pulled), pouch)),
                 (p0, pouch), (p1, pouch), (lift_t, lift), (a - 0.03, below), (a, on_mag), (r0, on_mag)]
        track += [(r0 + (r1 - r0) * k, m) for k, m in _return_keys(on_mag(r0), sup)]
        hands['L'] = _hand_path(track, t)
        hold = FINGER_ANGLES[(key, 'L')]
        press = dict(hold)
        press['Thumb'] = ((hold['Thumb'][0][0] + 22, hold['Thumb'][0][1] + 10, hold['Thumb'][0][2] + 6), hold['Thumb'][1])
        mf = MAG_FINGERS[key]
        _finger_track(bones, 'L', [(0.0, hold), (0.03, press), (0.06, OPEN_L), (grab, mf), (rel - OPEN_BEFORE_RELEASE, mf),
                                   (rel, OPEN_L), (p0, OPEN_L), (p1, mf), (a, mf), (a + PUSH_OPEN, OPEN_L),
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
        pose['torso_clear'] = True          # the left arm crosses in front of the body: keep it outside
        return pose
    return RELOAD15[key]['frames'], f, False


# marker: V16_RELOAD



# --- the old magazine's hold no longer follows the new one's -----------------------------------------------------
# l_old_mag was OLD_GRAB_TURN applied to L_IN_MAG, so re-seating the new magazine in the hand also moved the hand on
# the old one. The old one's hold is now pinned to the v7 seat (what QA measured), turned by OLD_GRAB_TURN.
L_OLD_BASE = {k: v.copy() for k, v in L_IN_MAG.items()} if 'L_OLD_BASE' not in globals() else L_OLD_BASE


def l_old_mag(key):
    rx, ry, rz = OLD_GRAB_TURN[key]
    R = (Matrix.Rotation(math.radians(rz), 4, 'Z') @ Matrix.Rotation(math.radians(ry), 4, 'Y') @
         Matrix.Rotation(math.radians(rx), 4, 'X'))
    return R @ L_OLD_BASE[key]
# marker: V16_OLDMAG


# --- the pistol reload: new magazine seated in the palm, gun held level, arm outside the body ---------------------
# With the v7 seat (fingers pointing forward under the base plate) the left forearm had to run straight back into the
# chest to reach the grip. The hand now turns 80 degrees about the magazine's long axis through the base plate (same
# palm-under-base-plate grip, fingers wrapping the side) and the pistol is held level (pitch 5) instead of tipped
# down, so the forearm comes in from the left with the palm up: no torso contact, wrist bend <= 50, forearm turn as
# the rifle support hand (palm up, about 95 degrees).
BASE_PLATE = {'pistol': Vector((0.0, -0.015, -0.126))}      # magazine-node space: centre of the base plate


def seat_on_base(key, turn_x, turn_z):
    c = BASE_PLATE[key]
    R = Matrix.Rotation(math.radians(turn_z), 4, 'Z') @ Matrix.Rotation(math.radians(turn_x), 4, 'X')
    return Matrix.Translation(c) @ R @ Matrix.Translation(-c) @ L_OLD_BASE[key]


L_IN_MAG['pistol'] = seat_on_base('pistol', 0.0, -80.0)
PISTOL_RELOAD.update({'roll': 0.0, 'pitch': 5.0, 'yaw': 0.0})
MAG_FINGERS['pistol'] = {'Index': ((5, 60, 42.0), 2), 'Middle': ((-10, 36, 36.0), -15),
                         'Ring': ((-10, 42, 42.0), -20), 'Pinky': ((-10, 48, 33.6), -30),
                         'Thumb': ((0, 20, 16.0), 50)}       # solved against the real magazine mesh (human hand)
TORSO_COST = 6.0
# marker: V16_PSEAT


# --- the vest's shoulder straps follow the shoulders --------------------------------------------------------------
# The Kit was weighted to the Chest only, so when the left arm reached for a pouch the shoulder under the strap
# (Shoulder/UpperArm weighted) pushed out through it. Kit vertices lying on the shoulders now copy the weights of the
# nearest Body vertex, so the strap moves with the skin it sits on.
from mathutils.kdtree import KDTree


def kit_follow_shoulders(kit, body, maxd=0.06):
    bm = body.data
    kd = KDTree(len(bm.vertices))
    for v in bm.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    bg = {g.index: g.name for g in body.vertex_groups}
    n = 0
    for v in kit.data.vertices:
        if abs(v.co.x) < 0.06 or v.co.z < 1.25:
            continue
        co, i, d = kd.find(v.co)
        if d > maxd:
            continue
        ws = {bg[g.group]: g.weight for g in bm.vertices[i].groups if g.weight > 0.001}
        if not any(k.startswith(('Shoulder_', 'UpperArm_')) for k in ws):
            continue
        for g in list(v.groups):
            kit.vertex_groups[g.group].remove([v.index])
        tot = sum(ws.values())
        for k, w in ws.items():
            grp = kit.vertex_groups.get(k) or kit.vertex_groups.new(name=k)
            grp.add([v.index], w / tot, 'REPLACE')
        n += 1
    return n


_build14_base16 = globals().get('_build14_base16') or build14


def build14(kind, *a, **kw):
    out = _build14_base16(kind, *a, **kw)
    for sfx in ('', '_LOD1', '_LOD2'):
        kit, body = bpy.data.objects.get('Kit' + sfx), bpy.data.objects.get('Body' + sfx)
        if kit and body:
            print('kit straps follow shoulders', sfx or 'LOD0', kit_follow_shoulders(kit, body))
    return out
# marker: V16_STRAPS


# --- robot finger tables and per-figure magazine grips --------------------------------------------------------------
# Solved on each figure's own mesh against the real replica and magazine meshes (finger capsules no more than 1.5 mm
# into the surface, gaps along the fingers kept to a millimetre or two). The robot keeps the human's rifle index,
# ring and thumb on the handguard; only its middle and pinky differ.
FINGER_KIND['robot'][('rifle', 'R')] = {'Index': ((-4, 15, 23), 5)}
FINGER_KIND['robot'][('rifle', 'L')] = {'Middle': ((-5, 6, 3.6), -8), 'Pinky': ((5, 78, 78.0), -28)}
MAG_FINGERS['rifle'] = {'Index': ((5, 18, 18.0), 15), 'Middle': ((5, 36, 25.2), 0), 'Ring': ((10, 36, 25.2), -10),
                        'Pinky': ((10, 30, 30.0), -25), 'Thumb': ((6, 36, 36.0), 40)}
MAG_KIND = {'robot': {
    'pistol': {'Index': ((5, 48, 48.0), 7), 'Middle': ((-10, 36, 36.0), -10), 'Ring': ((-10, 36, 36.0), -25),
               'Pinky': ((-10, 24, 24.0), -40), 'Thumb': ((-6, 30, 21.0), 50)},
    'rifle': {'Index': ((10, 0, 0.0), -10), 'Middle': ((5, 30, 30.0), -5), 'Ring': ((10, 36, 25.2), -10),
              'Pinky': ((10, 30, 21.0), -25), 'Thumb': ((0, 42, 42.0), 40)}}}

_apply_kind15 = globals().get('_apply_kind15') or apply_kind


def apply_kind(kind):
    restore15 = _apply_kind15(kind)
    keep = {k: dict(v) for k, v in MAG_FINGERS.items()}
    _TORSO['kind'] = kind                   # arm radii for the torso clearance
    for key, fs in MAG_KIND.get(kind, {}).items():
        MAG_FINGERS[key].update(fs)

    def restore():
        for k, v in keep.items():
            MAG_FINGERS[k] = v
        _TORSO['kind'] = 'human'
        restore15()
    return restore
# The robot's smooth shell has no vest to press into, so its arm capsules are the human's and they may come 12 mm
# into the torso hull before it costs anything (else its forearm turned 97 degrees pushing the magazine home).
ARM_RADIUS['robot'] = (0.040, 0.034)
TORSO_SLACK_KIND = {'robot': 0.012}
# The hand flicks 15 degrees (pronation) as it throws, so the open hand does not over-turn on its way to the pouch
# (the human's forearm reached 98 degrees there).
TOSS_TURN = -15.0
# marker: V16_KIND


# --- v8 QA round ---------------------------------------------------------------------------------------------------
# Rifle support thumb: it stood straight up the handguard's near side like a horn; it now lies forward along the
# lower near edge (tip on the edge, pointing to the muzzle), the usual cupped support grip. Shared by both figures.
FINGER_ANGLES[('rifle', 'L')]['Thumb'] = ((0, -10, -6.0), -18)
set_holds()
# Rifle reload: the hand took the spare from the pouch turned 30 degrees about X as well, which threw the left elbow
# 13-18 cm behind the shoulder (a chicken wing behind the vest). Without that turn it stays 4-9 cm back, beside the body.
POUCH_TURN['rifle'] = (0.0, -30.0, 0.0)
# The thrown magazine left the hand at the hand's own speed, so it lay across the open fingers for a few frames (the
# AEG's for 4 frames). It now also leaves at TOSS_SPEED along TOSS_DIR, a direction in the left hand's bone space
# found by a search over directions that stay outward (to the figure's left) and not upward: the one that keeps the
# magazine furthest from the finger and hand bones over the 5 frames after the release, while the hand goes on to the
# pouch. The AEG's goes down to the left (a flick to the ground), the pistol's out to the left.
TOSS_DIR = {'rifle': Vector((-0.789, -0.444, -0.425)), 'pistol': Vector((-0.355, -0.846, 0.398))}   # Hand_L space
TOSS_SPEED = {'rifle': 2.0, 'pistol': 1.5}             # m/s, relative to the hand

_old_mag_flight15 = globals().get('_old_mag_flight15') or old_mag_flight


def old_mag_flight(clip, key):
    v, w = _old_mag_flight15(clip, key)
    rig = bpy.data.objects['Rig']
    pb = rig.pose.bones
    for p in pb:
        for k in p.constraints:
            k.mute = True
    keep = rig.animation_data.action
    rig.animation_data.action = bpy.data.actions[clip]
    bpy.context.scene.frame_set(RELOAD15[key]['release'])
    d = (rig.matrix_world @ pb['Hand_L'].matrix).to_3x3() @ TOSS_DIR[key]
    rig.animation_data.action = keep
    for p in pb:
        for k in p.constraints:
            k.mute = False
    return v + d.normalized() * TOSS_SPEED[key], w
# marker: V16_QA1


# --- QA 2 (12 Oct): the new pistol magazine in the fist, the fingers open for the push ----------------------------
# Critic: the new pistol magazine was held only by its base plate (the plate at the finger roots, the fingers curled
# on it). The base plate now sits in the middle of the palm and the fingers close round the magazine's lower body
# (index along the front, thumb on the far side), solved together so no two fingers overlap. The hand is also turned
# 12 degrees about its own long axis: forearm turn 90 (was 94), no more arm-torso contact than before. The fingers
# held the magazine until it was home and went 1 cm into the grip; they now open as it goes in (PUSH_OPEN after the
# top enters) and the palm alone pushes it home.
PUSH_OPEN = 0.07                       # fraction of the clip
L_IN_MAG_V8 = {'pistol': seat_on_base('pistol', 0.0, -80.0)}
PALM_SEAT = {'pistol': (Vector((0.004, 0.06, -0.017)), 0.0, -12.0)}   # base plate centre (Hand_L space), tilt, turn


def seat_in_palm(key):
    base, tilt, turn = PALM_SEAT[key]
    Mi = L_IN_MAG_V8[key].inverted()
    b0 = Mi @ BASE_PLATE[key]
    Mi = (Matrix.Translation(base) @ Matrix.Rotation(math.radians(turn), 4, 'Y') @
          Matrix.Rotation(math.radians(tilt), 4, 'X') @ Matrix.Translation(-b0) @ Mi)
    return Mi.inverted()


L_IN_MAG['pistol'] = seat_in_palm('pistol')
MAG_FINGERS['pistol'] = {'Index': ((90, 18, 12.6), -10), 'Middle': ((65, 42, 42.0), 10), 'Ring': ((80, 24, 16.8), -10),
                         'Pinky': ((95, 6, 6.0), 0), 'Thumb': ((60, 0, 0.0), 70)}    # human hand, solved jointly
MAG_KIND['robot']['pistol'] = {'Index': ((90, 18, 12.6), -10), 'Middle': ((60, 48, 33.6), 10), 'Ring': ((90, 0, 0.0), -5),
                               'Pinky': ((95, 6, 4.2), 0), 'Thumb': ((60, 6, 6.0), 70)}  # the robot's own hand
# marker: V16_QA2


# --- QA 3 (12 Oct): the new magazine comes from the vest pouch -------------------------------------------------------
# Critic: the new magazine popped into an open, palm-up hand 6-9 cm in front of and below the vest pouches. The left
# hand now goes to the top of the figure's left chest pouch and closes on it there (palm towards the vest, tipped
# down over the pouch; roll and tip searched for the least forearm turn, wrist bend and finger contact with the
# kit), comes away from the vest (DRAW_OUT) turning towards the well, and the magazine shows in the hand only once
# it is clear of the vest (DRAW_SHOW). The throw before it still turns towards the v9 pouch frame, so it is unchanged.
POUCH_MOUTH = {'rifle': Vector((0.09, -0.255, 1.215)), 'pistol': Vector((0.09, -0.225, 1.185))}   # world: palm here (pistol: on the left magazine pouch)
POUCH_HOLD = {'rifle': (180.0, 60.0), 'pistol': (180.0, 75.0)}   # degrees: roll about the palm normal, tip down
PALM_PT = Vector((0.0, 0.05, -0.02))                               # Hand_L space: the middle of the palm
DRAW_OUT = Vector((0.0, -0.10, 0.02))                              # world: the hand comes this far off the vest
DRAW_TURN = 0.4                                                    # of the way from the pouch hold to the well
DRAW_TOWARD = 0.3              # and of the way to the well's position (the forearm turned 37 degrees in a frame without)
DRAW_SHOW = {'rifle': 21, 'pistol': 15}                            # frame: the magazine is clear of the vest
_pouch_frame14 = globals().get('_pouch_frame14') or _pouch_frame
_lift_frame14 = globals().get('_lift_frame14') or _lift_frame
_toss_frame15 = globals().get('_toss_frame15') or _toss_frame


class _PouchFrame(tuple):
    """A hand frame at the pouch that also carries the v9 pouch frame the throw turns towards (`toss`)."""


def _pouch_frame(key, c):
    roll, tip = POUCH_HOLD[key]
    R = (Matrix.Rotation(math.radians(tip), 4, 'X') @ Matrix.Rotation(math.radians(roll), 4, 'Y') @
         Matrix.Rotation(math.radians(-90.0), 4, 'X'))
    t = POUCH_MOUTH[key] - (R @ (L_IN_MAG[key] @ PALM_PT))
    M = Matrix.Translation(t) @ R @ L_IN_MAG[key] @ _gl_rel(c)
    f = _PouchFrame((M.translation, M.col[1].xyz, M.col[2].xyz))
    f.toss = _pouch_frame14(key, c)
    return f


def _lift_frame(pouch, below):
    f = _blend_hand(pouch, below, DRAW_TURN)
    return (Vector(pouch[0]) + DRAW_OUT).lerp(Vector(below[0]), DRAW_TOWARD), f[1], f[2]


def _toss_frame(frame, towards):
    return _toss_frame15(frame, getattr(towards, 'toss', towards))


MAG_IN_HAND_TIMES = {'Rifle_Reload': (DRAW_SHOW['rifle'] / RELOAD15['rifle']['frames'], MAG_APPEARS['rifle']),
                     'Pistol_Reload': (DRAW_SHOW['pistol'] / RELOAD15['pistol']['frames'], MAG_APPEARS['pistol'])}
# marker: V16_POUCH

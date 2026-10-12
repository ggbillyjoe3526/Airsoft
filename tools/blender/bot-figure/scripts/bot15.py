# bot15.py: v7 round (11 October): fingers on the replicas measured against the real meshes, the trigger press in step
# with the replica's own trigger, the sprint carry the left hand can reach, and the reload that pulls the old
# magazine out and throws it away. Loaded after bot14.py into the same namespace.
# marker: V15_START

# --- the trigger finger -------------------------------------------------------------------------------------------
# Solved 11 October against the replicas' trigger blades (FK of the index bones, the pad vertex on the blade's front
# face, no index vertex more than 1 mm into the replica). The pistol's old straight index sat inside its trigger
# (the pad 5 mm into the blade, at the top by the pivot); the rifle's sat 0.7 mm in.
FINGER_ANGLES[('rifle', 'R')]['Index'] = ((2, 15, 10.5), 5)        # pad on the blade's front face, 13 mm down
FINGER_ANGLES[('pistol', 'R')]['Index'] = ((-4, 15, 10.5), -10)    # pad on the blade's front face, 12 mm down
# the support hand's fingers on the pistol: with the new trigger finger the left middle finger lay 9 mm into the
# right index; re-solved against the pistol and the right hand together (no vertex more than 1.5 mm into either,
# fingertips touching, as close to the old curl as that allows)
for _f, _a in {'Index': (34, 72, 50.4), 'Middle': (30, 60, 42.0), 'Pinky': (62, 48, 33.6), 'Thumb': (42, 6, 4.2)}.items():
    FINGER_ANGLES[('pistol', 'L')][_f] = (_a, FINGER_ANGLES[('pistol', 'L')][_f][1])
# the support hand on the AEG handguard, re-solved the same way (the index lay 3 mm into the handguard, the thumb
# 2.5 mm off it)
for _f, _a in {'Index': (-10, 12, 8.4), 'Middle': (-6, 18, 12.6), 'Ring': (-2, 24, 16.8), 'Pinky': (22, 18, 12.6),
               'Thumb': (18, 12, 8.4)}.items():
    FINGER_ANGLES[('rifle', 'L')][_f] = (_a, FINGER_ANGLES[('rifle', 'L')][_f][1])
set_holds()
# extra index curl at full press: the pad follows the replica's trigger blade as its Fire clip turns it back
# (AEG 17.2 degrees, pistol 16 degrees about the pivot), so the finger never goes through the trigger
TRIGGER_PRESS15 = {'rifle': (0.0, 5.0, 3.5), 'pistol': (0.0, 7.5, 5.25)}
FIRE_FRAMES = 3                    # 0.1 s at 30 fps, the replicas' Fire clips' length
FIRE_KEYS = [(0.0, 0.0), (1.0 / 3.0, 1.0), (2.0 / 3.0, 0.74), (1.0, 0.0)]   # the replica trigger's own turn, sampled


def clip_fire14(aim_fn, key):
    """One trigger press in step with the replica's Fire clip (0.1 s: full press at 0.033 s, held to 0.05 s, back by
    0.1 s). The game plays it per shot as an additive layer over the aim clips."""
    rh = FINGER_ANGLES[(key, 'R')]
    press = TRIGGER_PRESS15[key]
    def edit(bones, t):
        k = keys(FIRE_KEYS, t)
        bones.update(finger_rots('R', {'Index': rh['Index']}, {'Index': tuple(x * k for x in press)}))
    return FIRE_FRAMES, _with_fingers(lambda t: aim_fn(0.0), edit), False


# --- pistol aim up/down: the hands kept their fingers open (the clip never set them), and aiming high the left hand
# fell 24 mm short of its grip (the arms swing round the shoulders, but the chest leans back): the pistol comes in a
# little closer when it is raised
PISTOL_AIM_IN = {60.0: 0.03, -60.0: 0.0}


def clip_pistol_aim14(c, pitch):
    """Pistol aim up/down: the arms swing round the shoulders with the pistol (the wrists stay straight), instead of
    the pistol tipping in still hands."""
    sh = (c.rest['UpperArm_L'].translation + c.rest['UpperArm_R'].translation) * 0.5
    gp = pitch * 0.55
    rot = Q(X_AX, -gp)
    inward = PISTOL_AIM_IN.get(pitch, 0.0)
    def f(t):
        br = math.sin(2 * math.pi * t)
        bones = {'Hips': Q(Y_AX, -14)}
        spine(bones, pitch=-pitch * 0.45, yaw=6, head_pitch=-pitch * 0.25, head_yaw=-2)
        p0 = Vector((-0.03, -0.45 + inward, 1.44 + 0.002 * br))
        hands = pistol(sh + rot @ (p0 - sh), pitch=gp)
        el = {sd: sh + rot @ (v - sh) for sd, v in elbows(c, out=0.35, back=-0.05, down=0.45).items()}
        fingers(bones, 'R', 'trigger')
        fingers(bones, 'L', 'support')
        return stand(c, bones, hands, el, hips=Vector((0, 0, -0.015)))
    return 30, f, True


# marker: V15_TRIGGER


# --- sprint: a low carry across the body the left hand can reach ----------------------------------------------------
# The v6 sprint carry put the handguard 13 cm past the left hand's reach (the arm hung straight, the hand inside the
# receiver) and the stock 37 mm into the vest. Now the muzzle points down and across to the left, the left hand
# 3 cm further back on the handguard (still ahead of the receiver), the stock against the right chest.
SPRINT_GUN = (Vector((-0.18, -0.18, 1.24)), -25.0, 58.0)   # grip point, pitch, yaw
SPRINT_SLIDE = 0.03       # the left hand this far back along the handguard from its aim position (metres)


def _sprint_upper(c, t, bones, b):
    p, pitch, yaw = SPRINT_GUN
    g, f, u = gun(p + b, pitch=pitch, yaw=yaw)
    fingers(bones, 'R', 'trigger')
    fingers(bones, 'L', 'support')
    hands = rifle_hands(g, f, u, left_at=0.19)
    pt, dr = on_replica('rifle', g, f, u)
    sp, sb, sw = SUPPORT_ON_REPLICA['rifle']
    hands['L'] = (pt(Vector(sp) - Vector((0, SPRINT_SLIDE, 0))), dr(Vector(sb)), dr(Vector(sw)))
    return hands, elbows(c, out=0.40, back=0.2, down=0.40)
# marker: V15_SPRINT


# --- the reloads: pull the old magazine out, throw it away, insert a new one ----------------------------------------
# The replicas' own Reload clips only slide their magazine down and back up (it never leaves the replica), so in v6 a
# magazine stayed under the gun while the hand went for the new one. Now the left hand catches the old magazine as it
# drops from the well, pulls it clear along the well, throws it out to the left and goes on to the pouch. The game
# hides the replica's own magazine from the catch until the new one shows (replicaMagazineHidden), shows a copy on
# the hand from the catch to the release (oldMagazine) and lets that copy fly from the release (releaseVelocity,
# releaseSpin, gravity) and lie on the ground for a while. Times are fractions of the clip on whole frames.
RELOAD15 = {
    'rifle': {'frames': 54, 'grab': 5, 'pulled': 7, 'release': 10, 'follow': 12, 'pouch': (17, 19), 'lift': 22},
    'pistol': {'frames': 36, 'grab': 5, 'pulled': 7, 'release': 9, 'follow': 11, 'pouch': (13, 14), 'lift': 16},
}
TOSS_OFF = Vector((0.12, -0.12, 0.02))     # world (figure faces -Y, its left is +X): out to the left and ahead
TOSS_TURN = 0.0                            # degrees about the figure's forward axis (an extra flick of the wrist)
OLD_MAG_LIFETIME = 3.0                     # seconds an empty magazine lies on the ground before the game removes it


# how the hand takes the OLD magazine, turned from the way it holds a new one (degrees about the magazine's own X, Y
# and Z): the pistol's new magazine sits palm up under its base plate for the push home, but catching the old one as
# it drops, palm up would bend the wrist back past 100 degrees
OLD_GRAB_TURN = {'rifle': (-20.0, -20.0, -20.0), 'pistol': (15.0, 30.0, -30.0)}   # searched: least wrist strain


def l_old_mag(key):
    ax, ay, az = OLD_GRAB_TURN[key]
    R = (Matrix.Rotation(math.radians(az), 4, 'Z') @ Matrix.Rotation(math.radians(ay), 4, 'Y') @
         Matrix.Rotation(math.radians(ax), 4, 'X'))
    return R @ L_IN_MAG[key]


def _old_frame(key, c, pt, dr, t):
    M = Matrix.Translation(mag_at(key, t)) @ l_old_mag(key) @ _gl_rel(c)
    return _grip_from_rep(pt, dr, M)


def _rl(key, name):
    r = RELOAD15[key]
    v = r[name]
    return tuple(x / r['frames'] for x in v) if isinstance(v, tuple) else v / r['frames']


def _toss_frame(frame, towards):
    """Where the throw ends: out to the left of the pull, the hand already turned the way it will take the next
    magazine from the pouch (`towards`), so the wrist unwinds as it throws instead of bending further."""
    p = frame[0]
    R = Matrix.Rotation(math.radians(TOSS_TURN), 3, 'Y')
    return p + TOSS_OFF, R @ Vector(towards[1]), R @ Vector(towards[2])


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
        _finger_track(bones, 'L', [(0.0, hold), (0.03, OPEN_L), (grab, mf), (rel, mf), (rel + 0.04, OPEN_L),
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
        hands = pistol(Vector(pos), pitch=pitch, roll=roll)
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
        _finger_track(bones, 'L', [(0.0, hold), (0.03, press), (0.06, OPEN_L), (grab, mf), (rel, mf),
                                   (rel + 0.04, OPEN_L), (p0, OPEN_L), (p1, mf), (r0, mf), (r0 + (r1 - r0) * 0.5, OPEN_L),
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
    return RELOAD15[key]['frames'], f, False


MAG_IN_HAND_TIMES = {'Rifle_Reload': (_rl('rifle', 'pouch')[0], MAG_APPEARS['rifle']),
                     'Pistol_Reload': (_rl('pistol', 'pouch')[0], MAG_APPEARS['pistol'])}
MAG_HIDE_FROM = {'rifle': _rl('rifle', 'grab'), 'pistol': _rl('pistol', 'grab')}


def old_mag_flight(clip, key):
    """Release velocity and spin of the thrown magazine (figure space, Blender axes, metres and radians per second)
    from the baked clip: central differences of the held copy's frame about the release frame."""
    rig = bpy.data.objects['Rig']
    pb = rig.pose.bones
    r = RELOAD15[key]
    on_bone = l_old_mag(key).inverted()
    for p in pb:
        for k in p.constraints:
            k.mute = True
    keep = rig.animation_data.action
    rig.animation_data.action = bpy.data.actions[clip]
    M = []
    for fr in (r['release'] - 1, r['release'] + 1):
        bpy.context.scene.frame_set(fr)
        M.append(rig.matrix_world @ pb['Hand_L'].matrix @ on_bone)
    rig.animation_data.action = keep
    for p in pb:
        for k in p.constraints:
            k.mute = False
    dt = 2.0 / 30.0
    v = (M[1].translation - M[0].translation) / dt
    dq = M[0].to_quaternion().rotation_difference(M[1].to_quaternion())
    axis, ang = dq.to_axis_angle()
    w = (M[0].to_3x3() @ axis) * (ang / dt) if ang > 1e-6 else Vector()
    return v, w


if not getattr(grip_info14, 'v15', False):
    _grip_info14d = grip_info14


def grip_info14():
    out = _grip_info14d()
    rows = lambda m: [[round(x, 5) for x in r] for r in m]
    for name, row in out['magazineInHand'].items():
        key = row['replica']
        r = RELOAD15[key]
        v, w = old_mag_flight(name, key)
        row['replicaMagazineHidden'] = [round(MAG_HIDE_FROM[key], 5), MAG_APPEARS[key]]
        row['oldMagazine'] = {'from': round(r['grab'] / r['frames'], 5), 'release': round(r['release'] / r['frames'], 5),
                              'releaseVelocity': [round(x, 4) for x in v], 'releaseSpin': [round(x, 4) for x in w],
                              'magazineOnBone': rows(l_old_mag(key).inverted()),
                              'gravity': 9.81, 'lifetime': OLD_MAG_LIFETIME}
    out['oldMagazineNote'] = ('oldMagazine: from "from" to "release" show a second copy of the replica\'s Magazine on '
                              'the same bone with its own magazineOnBone (the old magazine being pulled out). At '
                              '"release" detach it in place and let it fly: releaseVelocity (m/s) and releaseSpin '
                              '(rad/s, axis times rate) are in the figure\'s space with Blender axes (three.js: x, z, -y), '
                              'plus the figure\'s own movement; fall with gravity, stop on the ground lying on its '
                              'side, remove after lifetime seconds. The replica\'s own magazine stays hidden over '
                              'replicaMagazineHidden, so only one magazine is ever in view.')
    out['fireClipsNote'] = ('One trigger press each (0.1 s, the same timing as the replicas\' own Fire clips). Play '
                            'additively per shot: AnimationUtils.makeClipAdditive(clip, 0) and blend over the aim clips.')
    return out


grip_info14.v15 = True
# marker: V15_RELOAD


# --- per-figure finger tables -------------------------------------------------------------------------------------
# The robot's fingers are thicker and longer on the same skeleton: with the human's trigger finger its index lay on
# the pistol's trigger guard (2.5 mm into it). Solved the same way on the robot's own mesh.
FINGER_KIND = {'robot': {('rifle', 'R'): {'Index': ((4, 17.5, 12.25), 5)},
                         ('pistol', 'R'): {'Index': ((2, 15, 10.5), 0)},
                         ('pistol', 'L'): {'Index': ((34, 54, 37.8), -10), 'Middle': ((26, 60, 42.0), 0),
                                           'Pinky': ((54, 48, 33.6), 0), 'Thumb': ((46, 6, 4.2), 0)},
                         ('rifle', 'L'): {'Ring': ((2, 24, 16.8), -6), 'Thumb': ((10, 0, 0.0), -18)}}}
TRIGGER_PRESS_KIND = {'robot': {'rifle': (0.0, 7.5, 5.25), 'pistol': (0.0, 5.0, 3.5)}}

def apply_kind(kind):
    """Put the figure's own finger tables in place (for a build, or a remake while checking that figure); returns a
    function that puts the shared ones back."""
    keep_f = {k: dict(v) for k, v in FINGER_ANGLES.items()}
    keep_p = dict(TRIGGER_PRESS15)
    for key, fs in FINGER_KIND.get(kind, {}).items():
        FINGER_ANGLES[key].update(fs)
    TRIGGER_PRESS15.update(TRIGGER_PRESS_KIND.get(kind, {}))
    set_holds()
    def restore():
        for k, v in keep_f.items():
            FINGER_ANGLES[k] = v
        TRIGGER_PRESS15.update(keep_p)
        set_holds()
    return restore


if not getattr(build14, 'v15', False):
    _build14d = build14


def build14(kind='human'):
    restore = apply_kind(kind)
    try:
        return _build14d(kind)
    finally:
        restore()


build14.v15 = True
# marker: V15_KIND

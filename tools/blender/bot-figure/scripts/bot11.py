# --- v4 animations: 21 clips on the shared skeleton, made in code and baked to plain bone keys ---
# Legs and arms are placed by reaching for targets (feet on the ground, hands on a replica), then every bone's
# result is written as keys, so the clips need nothing but the skeleton. Strides are worked out from the game's
# speeds (config/movement.ts) so planted feet do not slide when the game moves the figure at that speed.
# Upper-body clips (aims, reloads, switch) key only the upper body, so the game can lay them over the legs' clips.
import json
from mathutils import Quaternion

FPS = 30
CTL = 'AnimCtl'
SPEEDS = {'run': 4.2, 'walk': 2.3, 'sprint': 6.3, 'crouch': 2.1, 'walkoff': 1.5}   # m/s, config/movement.ts
UPPER = ('Spine', 'Spine1', 'Chest', 'Neck', 'Head', 'Shoulder', 'UpperArm', 'Forearm', 'Hand', 'Index', 'Middle',
         'Ring', 'Pinky', 'Thumb', 'Grip')
X_AX, Y_AX, Z_AX = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
GA = math.radians(GRIP_ANGLE)


def Q(axis, deg):
    return Quaternion(Vector(axis), math.radians(deg))


def ease(u):
    u = max(0.0, min(1.0, u))
    return u * u * (3 - 2 * u)


def lerp(a, b, u):
    return a + (b - a) * u


def keys(track, t):
    """Piecewise eased interpolation through [(time, value), ...]; values are numbers, Vectors or tuples."""
    if t <= track[0][0]:
        return track[0][1]
    for (t0, v0), (t1, v1) in zip(track, track[1:]):
        if t <= t1:
            u = ease((t - t0) / max(t1 - t0, 1e-9))
            if isinstance(v0, tuple):
                return tuple(lerp(a, b, u) for a, b in zip(v0, v1))
            return lerp(v0, v1, u)
    return track[-1][1]


# --- rig set-up: targets for the feet and hands --------------------------------------------------------------
class Ctl:
    pass


def _empty(name):
    c = bpy.data.collections.get(CTL)
    if c is None:
        c = bpy.data.collections.new(CTL)
        bpy.context.scene.collection.children.link(c)
    e = bpy.data.objects.get(name) or bpy.data.objects.new(name, None)
    if not e.users_collection:
        c.objects.link(e)
    e.empty_display_size = 0.05
    e.rotation_mode = 'QUATERNION'
    e.parent = None
    return e


def _world(rig, bone, at='head'):
    b = rig.data.bones[bone]
    m = rig.matrix_world @ b.matrix_local
    if at == 'tail':
        m = m @ Matrix.Translation((0, b.length, 0))
    return m


def anim_setup(rig):
    """Feet and hands reach for empties; returns the rest measurements the clips are built from."""
    bpy.context.scene.render.fps = FPS
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    c = Ctl()
    c.rig = rig
    c.rest = {pb.name: _world(rig, pb.name) for pb in rig.pose.bones}
    c.tail = {pb.name: _world(rig, pb.name, 'tail').translation for pb in rig.pose.bones}
    c.e = {}
    for sd in 'LR':
        for nm, bone in (('Foot', 'Foot'), ('Hand', 'Hand')):
            e = _empty('C_%s_%s' % (nm, sd))
            e.matrix_world = c.rest['%s_%s' % (bone, sd)]
            c.e[nm + sd] = e
        kp = _empty('C_Knee_' + sd)
        kp.location = c.rest['Shin_' + sd].translation + Vector((0, -0.6, 0))
        c.e['Knee' + sd] = kp
        ep = _empty('C_Elbow_' + sd)
        ep.location = c.rest['Forearm_' + sd].translation + Vector((0, 0.5, 0))
        c.e['Elbow' + sd] = ep
        for chain, tgt, pole in (('Shin', 'Foot', 'Knee'), ('Forearm', 'Hand', 'Elbow')):
            ik = rig.pose.bones['%s_%s' % (chain, sd)].constraints.new('IK')
            ik.target = c.e[tgt + sd]
            ik.pole_target = c.e[pole + sd]
            ik.chain_count = 2
            ik.name = 'AnimIK'
        for bone, tgt in (('Foot', 'Foot'), ('Hand', 'Hand')):
            cr = rig.pose.bones['%s_%s' % (bone, sd)].constraints.new('COPY_ROTATION')
            cr.target = c.e[tgt + sd]
            cr.name = 'AnimRot'
    # the pole angle that leaves the rest pose as it is
    bpy.context.view_layer.update()
    for sd in 'LR':
        for chain, upper in (('Shin', 'Thigh'), ('Forearm', 'UpperArm')):
            ik = rig.pose.bones['%s_%s' % (chain, sd)].constraints['AnimIK']
            best = None
            for ang in range(-180, 180, 5):
                ik.pole_angle = math.radians(ang)
                bpy.context.view_layer.update()
                pm = rig.pose.bones['%s_%s' % (upper, sd)].matrix
                err = sum((pm.col[i].to_3d() - rig.data.bones['%s_%s' % (upper, sd)].matrix_local.col[i].to_3d()).length
                          for i in range(3))
                if best is None or err < best[0]:
                    best = (err, ang)
            ik.pole_angle = math.radians(best[1])
    # rest frames for the hands: (L, W) and the grip point's offset from the wrist
    c.hand = {}
    for sd in 'LR':
        hm = c.rest['Hand_' + sd].to_3x3()
        L = hm.col[1].to_3d().normalized()
        gm = c.rest['Grip_' + sd].to_3x3()
        barrel, gup = gm.col[1].to_3d().normalized(), gm.col[2].to_3d().normalized()
        c.hand[sd] = (hm, barrel, gup, c.rest['Grip_' + sd].translation - c.rest['Hand_' + sd].translation)
    c.ankle = {sd: c.rest['Foot_' + sd].translation.copy() for sd in 'LR'}
    c.hips = c.rest['Hips'].translation.copy()
    return c


def _frame(a, b):
    a = a.normalized()
    b = (b - a * a.dot(b)).normalized()
    return Matrix((a, b, a.cross(b))).transposed()


def hand_target(c, sd, grip, barrel, up):
    """Wrist position and hand rotation that put the hand's grip point at `grip` with the replica's barrel along
    `barrel` and its top along `up` (for the left hand on a handguard, barrel/up describe the handguard)."""
    hm, b0, u0, off = c.hand[sd]
    d = _frame(Vector(barrel), Vector(up)) @ _frame(b0, u0).inverted()
    rot = (d @ hm).to_quaternion()
    return Vector(grip) - d @ off, rot


# --- one frame of a clip -------------------------------------------------------------------------------------
def apply(c, pose):
    """pose: {'bones': {name: Quaternion}, 'hips': Vector (world offset), 'feet': {sd: (pos, pitch, yaw)},
    'hands': {sd: (grip, barrel, up)}, 'knees': {sd: Vector}, 'elbows': {sd: Vector}}"""
    rig = c.rig
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
    for n, q in pose.get('bones', {}).items():
        rig.pose.bones[n].rotation_quaternion = q
    hp = pose.get('hips')
    if hp is not None:
        rig.pose.bones['Hips'].location = c.rest['Hips'].to_3x3().inverted() @ Vector(hp)
    for sd, (pos, pitch, yaw) in pose['feet'].items():
        e = c.e['Foot' + sd]
        rot = Q(Z_AX, yaw) @ Q(X_AX, -pitch) @ c.rest['Foot_' + sd].to_quaternion()
        e.matrix_world = Matrix.Translation(pos) @ rot.to_matrix().to_4x4()
    for sd, v in pose.get('knees', {}).items():
        c.e['Knee' + sd].location = v
    for sd, (grip, barrel, up) in pose['hands'].items():
        pos, rot = hand_target(c, sd, grip, barrel, up)
        c.e['Hand' + sd].matrix_world = Matrix.Translation(pos) @ rot.to_matrix().to_4x4()
    for sd, v in pose.get('elbows', {}).items():
        c.e['Elbow' + sd].location = v
    bpy.context.view_layer.update()


def bake_clip(c, name, frames, fn, upper_only=False, loop=True):
    """Evaluate fn(t) for each frame, read every bone's result and key it into a new action named `name`."""
    rig = c.rig
    if rig.animation_data:
        rig.animation_data.action = None
    names = [pb.name for pb in rig.pose.bones if pb.name != 'Root' and
             (not upper_only or pb.name.split('_')[0].rstrip('123') in UPPER)]
    store = []
    n = frames + 1                              # keys at both ends, so a clip lasts exactly frames / FPS seconds
    for i in range(n):
        t = (i % frames) / frames if loop else i / frames
        apply(c, fn(t))
        fr = {}
        for nm in names:
            pb = rig.pose.bones[nm]
            m = rig.convert_space(pose_bone=pb, matrix=pb.matrix, from_space='POSE', to_space='LOCAL')
            fr[nm] = (m.to_translation(), m.to_quaternion())
        store.append(fr)
    for pb in rig.pose.bones:
        for con in pb.constraints:
            con.mute = True
    act = bpy.data.actions.get(name)
    if act is not None:
        bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    for i, fr in enumerate(store):
        for nm, (loc, q) in fr.items():
            pb = rig.pose.bones[nm]
            if nm == 'Hips':
                pb.location = loc
                pb.keyframe_insert('location', frame=i, group=nm)
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=i, group=nm)
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        for con in pb.constraints:
            con.mute = False
    return act, n


# --- poses and gaits ---------------------------------------------------------------------------------------
FINGERS = {
    'trigger': {'Index': (-12, -28, -18), 'Middle': (-62, -72, -40), 'Ring': (-66, -74, -42), 'Pinky': (-70, -74, -42),
                'Thumb': (-6, -14, -8)},
    'support': {'Index': (-38, -48, -28), 'Middle': (-46, -54, -30), 'Ring': (-50, -56, -32), 'Pinky': (-54, -58, -34),
                'Thumb': (0, -6, -4)},
    'open': {'Index': (-3, -4, -2), 'Middle': (-3, -4, -2), 'Ring': (-4, -5, -2), 'Pinky': (-5, -6, -3),
             'Thumb': (4, -4, -2)},
    'relax': {'Index': (-14, -20, -10), 'Middle': (-18, -24, -12), 'Ring': (-22, -26, -14), 'Pinky': (-26, -28, -16),
              'Thumb': (-4, -10, -6)},
}


def fingers(bones, sd, kind, blend=None, u=0.0):
    a = FINGERS[kind]
    b = FINGERS[blend] if blend else a
    for f in a:
        for i in range(3):
            bones['%s%d_%s' % (f, i + 1, sd)] = Q(X_AX, lerp(a[f][i], b[f][i], u))


def spine(bones, pitch=0.0, yaw=0.0, roll=0.0, head_pitch=None, head_yaw=None, w=(0.30, 0.35, 0.35)):
    for n, k in zip(('Spine', 'Spine1', 'Chest'), w):
        bones[n] = Q(X_AX, pitch * k) @ Q(Y_AX, yaw * k) @ Q(Z_AX, roll * k)
    hp = -pitch if head_pitch is None else head_pitch
    hy = -yaw if head_yaw is None else head_yaw
    bones['Neck'] = Q(X_AX, hp * 0.5) @ Q(Y_AX, hy * 0.5)
    bones['Head'] = Q(X_AX, hp * 0.5) @ Q(Y_AX, hy * 0.5)


def gun(butt, pitch=0.0, yaw=0.0, roll=0.0, length=0.28):
    """A rifle-sized replica frame from its butt: returns grip point, barrel, up, and points along it."""
    f = Q(Z_AX, yaw) @ Q(X_AX, -pitch) @ Vector((0, -1, 0))      # positive pitch raises the muzzle
    u = Q(Z_AX, yaw) @ Q(X_AX, -pitch) @ Vector((0, 0, 1))
    u = Quaternion(f, math.radians(roll)) @ u
    g = Vector(butt) + f * length - u * 0.035
    return g, f, u


def rifle_hands(g, f, u, left_at=0.21, left=True):
    r = f.cross(u)
    hands = {'R': (g, f, u)}
    if left:
        # the support hand cups the handguard: the handguard runs through the closed hand (the grip frame's up axis,
        # thumb side forward), the forearm comes in from below on the left and the fingers wrap over the far side
        pl = g + f * left_at + u * 0.045
        across = (u * 0.5 + r * 0.85)
        across = (across - f * f.dot(across)).normalized()
        hands['L'] = (pl, across, f)
    return hands


def pistol(grip, pitch=0.0, yaw=0.0, roll=0.0):
    f = Q(Z_AX, yaw) @ Q(X_AX, -pitch) @ Vector((0, -1, 0))
    u = Quaternion(f, math.radians(roll)) @ (Q(Z_AX, yaw) @ Q(X_AX, -pitch) @ Vector((0, 0, 1)))
    g = Vector(grip)
    r = f.cross(u)
    return {'R': (g, f, u), 'L': (g - r * 0.030 - u * 0.012 + f * 0.004, f, (u - r * 1.2).normalized())}


def elbows(c, out=0.45, back=0.25, down=0.30, left=None):
    e = {}
    for sd, s in (('L', 1.0), ('R', -1.0)):
        sh = c.rest['UpperArm_' + sd].translation
        o = out if (sd == 'R' or left is None) else left
        e[sd] = sh + Vector((s * o, back, -down))
    return e


def low_ready(c, bob=Vector()):
    g, f, u = gun(Vector((-0.125, -0.040, 1.34)) + bob, pitch=-34, yaw=6)
    return rifle_hands(g, f, u, left_at=0.19)


def aim_rifle(c, pitch=0.0, bob=Vector()):
    pivot = Vector((-0.120, -0.100, 1.478))         # the butt in the shoulder pocket, sights under the eye
    g, f, u = gun(pivot + bob, pitch=pitch, yaw=6)
    return rifle_hands(g, f, u, left_at=0.20)


def foot_cycle(c, sd, p, D, lift, stance, direction, hip_drop=0.0, toe_off=22.0, strike=10.0):
    """One foot over a stride: planted and moving back for `stance` of the cycle, then lifted forward."""
    a0 = c.ankle[sd]
    d = Vector(direction).normalized()
    if p < stance:
        u = p / stance
        off = d * (D * (0.5 - u))
        z = 0.0
        pitch = strike * max(0.0, 1 - u / 0.18) - toe_off * max(0.0, (u - 0.72) / 0.28)
        z += 0.10 * math.sin(math.radians(max(0.0, -pitch)))
    else:
        u = (p - stance) / (1 - stance)
        e = 0.5 - 0.5 * math.cos(math.pi * u)
        off = d * (D * (-0.5 + e))
        z = lift * math.sin(math.pi * min(1.0, u * 1.1)) ** 0.8
        pitch = -toe_off * (1 - u) ** 2 + strike * u ** 3
        z += 0.10 * math.sin(math.radians(max(0.0, -pitch))) * (1 - u)
    z += 0.045 * math.sin(math.radians(max(0.0, pitch)))   # toes up at heel strike: lift so the heel stays on the floor
    return a0 + off + Vector((0, 0, z)), pitch, 0.0


def gait(c, t, v, stance, D, lift, direction=(0, -1, 0), drop=0.02, bob=0.025, lean=6.0, yaw_amp=6.0,
         upper='low', crouch=0.0, extra=None):
    bones = {}
    p = t
    toe = 22.0 + crouch * 90.0                  # crouched, the rear heel comes right up so the knee stays off the floor
    feet = {'L': foot_cycle(c, 'L', p % 1.0, D, lift, stance, direction, toe_off=toe),
            'R': foot_cycle(c, 'R', (p + 0.5) % 1.0, D, lift, stance, direction, toe_off=toe)}
    for sd in 'LR':                              # the toes stay flat on the floor while the heel lifts off
        bones['Toe_' + sd] = Q(X_AX, max(0.0, -feet[sd][1]))
    dz = -drop - crouch - bob * 0.5 * (1 + math.cos(4 * math.pi * (p - stance / 2)))
    side = Vector(direction).cross(Z_AX)
    sway = 0.012 * math.sin(2 * math.pi * p) if abs(direction[0]) < 0.5 else 0.0
    hips = Vector((0, 0, dz)) + side * sway
    fwd = -direction[1] if abs(direction[1]) > 0.5 else 0.0
    yaw = yaw_amp * math.sin(2 * math.pi * p) * (1 if abs(direction[1]) > 0.5 else 0.3)
    bones['Hips'] = Q(Y_AX, yaw) @ Q(X_AX, lean * 0.4 * fwd + crouch * 60)
    spine(bones, pitch=lean * fwd * 0.6 + crouch * 50, yaw=-yaw * 1.2, head_pitch=-(lean * fwd * 0.6 + crouch * 105 +
                                                                                     lean * 0.4 * fwd))
    b = Vector((0, 0, dz * 0.8))
    if upper == 'low':
        hands = low_ready(c, b)
        fingers(bones, 'R', 'trigger')
        fingers(bones, 'L', 'support')
        el = elbows(c)
    elif upper == 'sprint':
        g = Vector((-0.10, -0.21, 1.14)) + b
        f = Vector((0.62, -0.30, 0.72)).normalized()
        u = (Vector((0.2, -1.0, -0.1)) - f * f.dot(Vector((0.2, -1.0, -0.1)))).normalized()
        hands = rifle_hands(g, f, u, left_at=0.20)
        fingers(bones, 'R', 'trigger')
        fingers(bones, 'L', 'support')
        el = elbows(c, out=0.35, back=0.3, down=0.45)
    else:
        hands, el = upper(c, t, bones, b)
    knees = {sd: Vector((c.ankle[sd].x * 1.2, -0.7, 0.55 - crouch)) for sd in 'LR'}
    pose = {'bones': bones, 'hips': hips, 'feet': feet, 'hands': hands, 'elbows': el, 'knees': knees}
    if extra:
        extra(pose, t)
    return pose


def _cycle(v, stance, D):
    frames = max(10, round(D / (v * stance) * FPS))
    return frames, v * stance * frames / FPS


def stand(c, bones, hands, el, hips=Vector(), feet_extra=None):
    feet = {sd: (c.ankle[sd] + Vector((0.012 if sd == 'L' else -0.012, -0.04 if sd == 'L' else 0.05, 0)), 0.0,
                 6.0 if sd == 'L' else -10.0) for sd in 'LR'}
    if feet_extra:
        feet.update(feet_extra)
    knees = {sd: Vector((c.ankle[sd].x * 1.4, -0.7, 0.55)) for sd in 'LR'}
    return {'bones': bones, 'hips': hips, 'feet': feet, 'hands': hands, 'elbows': el, 'knees': knees}


# --- the clips -----------------------------------------------------------------------------------------------
def clip_idle(c):
    def f(t):
        br = math.sin(2 * math.pi * t)
        bones = {'Hips': Q(Y_AX, -8)}
        spine(bones, pitch=1.5 + 0.6 * br, yaw=10, head_yaw=-12 + 3 * math.sin(2 * math.pi * t + 1))
        fingers(bones, 'R', 'trigger')
        fingers(bones, 'L', 'support')
        b = Vector((0, 0, 0.003 * br))
        return stand(c, bones, low_ready(c, b), elbows(c), hips=Vector((0, 0, -0.012)) + b)
    return 60, f, True


def clip_aim(c, kind, pitch):
    def f(t):
        br = math.sin(2 * math.pi * t)
        bones = {'Hips': Q(Y_AX, -14)}
        if kind == 'rifle':
            spine(bones, pitch=-pitch * 0.45, yaw=16, head_pitch=12 - pitch * 0.25, head_yaw=-10)
            bones['Head'] = bones['Head'] @ Q(Z_AX, 8)
            hands = aim_rifle(c, pitch=pitch * 0.55, bob=Vector((0, 0, 0.002 * br)))
            fingers(bones, 'R', 'trigger')
            fingers(bones, 'L', 'support')
            el = elbows(c, out=0.45, back=0.0, down=0.55, left=0.12)
        else:
            spine(bones, pitch=-pitch * 0.45, yaw=6, head_pitch=-pitch * 0.25, head_yaw=-2)
            hands = pistol(Vector((-0.03, -0.45, 1.44 + 0.002 * br)), pitch=pitch * 0.55)
            fingers(bones, 'R', 'trigger')
            fingers(bones, 'L', 'support')
            el = elbows(c, out=0.35, back=-0.05, down=0.45)
        return stand(c, bones, hands, el, hips=Vector((0, 0, -0.015)))
    return 30, f, True


def clip_gait(c, v, stance, D, lift, direction, **kw):
    frames, D = _cycle(v, stance, D)
    return frames, (lambda t: gait(c, t, v, stance, D, lift, direction, **kw)), True


def clip_crouch_idle(c):
    def f(t):
        br = math.sin(2 * math.pi * t)
        bones = {'Hips': Q(Y_AX, -10) @ Q(X_AX, 14), 'Toe_R': Q(X_AX, 70)}    # rear toes tucked under
        spine(bones, pitch=24 + 0.6 * br, yaw=8, head_pitch=-34)
        fingers(bones, 'R', 'trigger')
        fingers(bones, 'L', 'support')
        drop = c.hips.z - 0.42                      # sitting back on the rear heel, head near the game's crouch (1.13)
        hp = Vector((0, 0.05, -drop + 0.003 * br))
        feet = {'L': (c.ankle['L'] + Vector((0.025, -0.40, 0.0)), 0.0, 4.0),
                'R': (Vector((c.ankle['R'].x - 0.01, 0.22, 0.170)), -75.0, -4.0)}
        knees = {'L': Vector((0.30, -0.9, 0.9)), 'R': Vector((-0.14, -0.9, 0.05))}
        hands = low_ready(c, Vector((0, 0.03, -drop)))
        return {'bones': bones, 'hips': hp, 'feet': feet, 'hands': hands, 'elbows': elbows(c, down=0.5 + drop),
                'knees': knees}
    return 60, f, True


def clip_jump(c):
    def f(t):
        bones = {}
        # 0-0.18 crouch, 0.18-0.26 push off, 0.26-0.78 in the air (legs tucked), 0.78-1 land and recover
        dz = keys([(0, 0.0), (0.18, -0.12), (0.26, 0.03), (0.40, 0.04), (0.70, 0.04), (0.80, -0.14), (1.0, -0.01)], t)
        tuck = keys([(0, 0.0), (0.22, 0.0), (0.38, 0.30), (0.62, 0.30), (0.78, 0.04), (1.0, 0.0)], t)
        pitch = keys([(0, 0.0), (0.2, 0.0), (0.26, -30.0), (0.40, 10.0), (0.70, 14.0), (0.80, 0.0), (1.0, 0.0)], t)
        lean = keys([(0, 0.0), (0.18, 14.0), (0.30, 4.0), (0.7, 8.0), (0.82, 16.0), (1.0, 2.0)], t)
        spine(bones, pitch=lean, head_pitch=-lean)
        bones['Hips'] = Q(X_AX, lean * 0.6)
        fingers(bones, 'R', 'trigger')
        fingers(bones, 'L', 'support')
        feet = {sd: (c.ankle[sd] + Vector((0, 0.02 * (1 if sd == 'L' else -1) + tuck * 0.15,
                                           max(0.0, dz) + tuck * 1.0 + (0.0 if t < 0.24 else 0.0))), pitch, 0.0)
                for sd in 'LR'}
        if t >= 0.26 and t <= 0.78:
            feet = {sd: (c.ankle[sd] + Vector((0, tuck * 0.15 + (0.04 if sd == 'L' else -0.06), dz + tuck)), pitch, 0.0)
                    for sd in 'LR'}
        knees = {sd: Vector((c.ankle[sd].x * 1.3, -0.7, 0.6)) for sd in 'LR'}
        b = Vector((0, 0, dz * 0.8))
        return {'bones': bones, 'hips': Vector((0, 0, dz)), 'feet': feet, 'hands': low_ready(c, b),
                'elbows': elbows(c), 'knees': knees}
    return 30, f, False


def clip_rifle_reload(c):
    def f(t):
        bones = {'Hips': Q(Y_AX, -10)}
        spine(bones, pitch=keys([(0, 2.0), (0.2, 8.0), (0.8, 8.0), (1, 2.0)], t), yaw=12, head_pitch=-10, head_yaw=-6)
        tilt = keys([(0, 0.0), (0.12, 28.0), (0.80, 28.0), (0.95, 0.0)], t)
        g, fdir, u = gun(Vector((-0.125, -0.06, 1.33)), pitch=keys([(0, -30.0), (0.12, -12.0), (0.85, -12.0),
                                                                    (1, -30.0)], t), yaw=8, roll=tilt)
        r = fdir.cross(u)
        well = g + fdir * 0.085 - u * 0.065
        pouch = Vector((0.02, -0.215, 1.12))
        grip_l, gf, gu = rifle_hands(g, fdir, u, left_at=0.19)['L']
        path = [(0.0, grip_l), (0.14, well - u * 0.02), (0.22, well - u * 0.16 + r * 0.04), (0.38, pouch),
                (0.50, pouch + Vector((0, 0, 0.01))), (0.64, well - u * 0.12), (0.72, well - u * 0.01),
                (0.80, well - u * 0.04 - r * 0.05), (0.90, grip_l), (1.0, grip_l)]
        pl = keys([(a, tuple(b)) for a, b in path], t)
        on_gun = t < 0.08 or t > 0.88
        lf = gf if on_gun else Vector((0, 0, 1)).cross(r).normalized() * -1
        lu = gu if on_gun else -u
        hands = {'R': (g, fdir, u), 'L': (Vector(pl), lf, lu)}
        fingers(bones, 'R', 'trigger')
        fingers(bones, 'L', 'support' if on_gun else 'relax')
        return stand(c, bones, hands, elbows(c, left=0.35, down=0.4))
    return 54, f, False


def clip_pistol_reload(c):
    def f(t):
        bones = {'Hips': Q(Y_AX, -6)}
        spine(bones, pitch=keys([(0, 0.0), (0.2, 8.0), (0.8, 8.0), (1, 0.0)], t), yaw=6, head_pitch=-14, head_yaw=-2)
        pos = keys([(0, (-0.03, -0.45, 1.44)), (0.16, (-0.05, -0.32, 1.30)), (0.80, (-0.05, -0.32, 1.30)),
                    (1.0, (-0.03, -0.45, 1.44))], t)
        roll = keys([(0, 0.0), (0.16, -25.0), (0.80, -25.0), (1.0, 0.0)], t)
        pitch = keys([(0, 0.0), (0.16, -18.0), (0.80, -18.0), (1.0, 0.0)], t)
        hands = pistol(Vector(pos), pitch=pitch, roll=roll)
        g, fdir, u = hands['R']
        r = fdir.cross(u)
        base = g - u * 0.075
        pouch = Vector((0.02, -0.215, 1.12))
        sup = hands['L'][0]
        path = [(0.0, sup), (0.16, sup), (0.26, base - u * 0.03 + r * 0.03), (0.42, pouch), (0.52, pouch),
                (0.66, base - u * 0.06), (0.74, base - u * 0.005), (0.86, sup), (1.0, sup)]
        pl = keys([(a, tuple(b)) for a, b in path], t)
        on_gun = t < 0.18 or t > 0.84
        lf = hands['L'][1] if on_gun else Vector((0, -1, 0.3)).normalized()
        lu = hands['L'][2] if on_gun else Vector((-1, 0, 0))
        hands['L'] = (Vector(pl), lf, lu)
        fingers(bones, 'R', 'trigger')
        fingers(bones, 'L', 'support' if on_gun else 'relax')
        return stand(c, bones, hands, elbows(c, out=0.35, back=-0.05, down=0.45))
    return 36, f, False


def clip_switch(c):
    def f(t):
        bones = {'Hips': Q(Y_AX, -8)}
        spine(bones, pitch=keys([(0, 1.5), (0.4, 6.0), (1, 0.0)], t), yaw=keys([(0, 10.0), (0.4, 4.0), (1, 6.0)], t),
              head_pitch=-6)
        # the rifle drops to its sling (the game hides it at 0.35); the right hand draws from the holster
        lr = low_ready(c)
        holster = Vector((-0.215, -0.010, 0.985))
        aim = pistol(Vector((-0.03, -0.45, 1.44)))
        if t < 0.35:
            u = ease(t / 0.35)
            g = lr['R'][0].lerp(holster + Vector((0, 0, 0.05)), u)
            hands = {'R': (g, lr['R'][1].lerp(Vector((0, -0.2, -1)).normalized(), u).normalized(),
                           lr['R'][2].lerp(Vector((0, -1, 0.2)).normalized(), u).normalized())}
            gl = lr['L'][0].lerp(Vector((0.25, -0.10, 1.02)), u)
            hands['L'] = (gl, lr['L'][1].lerp(Vector((0, -0.2, -1)).normalized(), u).normalized(),
                          lr['L'][2].lerp(Vector((-1, 0, 0)), u).normalized())
            fingers(bones, 'R', 'trigger', 'relax', u)
            fingers(bones, 'L', 'support', 'relax', u)
        else:
            u = ease((t - 0.35) / 0.65)
            g = (holster + Vector((0, -0.02, 0.06))).lerp(aim['R'][0], u)
            hands = {'R': (g, Vector((0, -0.2, -1)).normalized().lerp(aim['R'][1], u).normalized(),
                           Vector((0, -1, 0.2)).normalized().lerp(aim['R'][2], u).normalized())}
            gl = Vector((0.25, -0.10, 1.02)).lerp(aim['L'][0], u)
            hands['L'] = (gl, Vector((0, -0.2, -1)).normalized().lerp(aim['L'][1], u).normalized(),
                          Vector((-1, 0, 0)).lerp(aim['L'][2], u).normalized())
            fingers(bones, 'R', 'relax', 'trigger', u)
            fingers(bones, 'L', 'relax', 'support', u)
        return stand(c, bones, hands, elbows(c, out=0.4, back=0.1, down=0.4))
    return 18, f, False


def _hit_upper(c, u, bones, b=Vector()):
    """The hit call: the free hand goes up high, open, palm forward; the rifle hangs muzzle down in the other."""
    lr = low_ready(c, b)
    up_pos = Vector((0.21, -0.05, 1.90)) + b       # nearly straight up: the call has to read from across the field
    l_pos = lr['L'][0].lerp(up_pos, u)
    lf = lr['L'][1].lerp(Vector((0, 0.15, 1)).normalized(), u).normalized()       # fingers to the sky
    lu = lr['L'][2].lerp(Vector((-1, 0, 0)), u).normalized()
    down_g = Vector((-0.235, -0.07, 1.00)) + b
    df = Vector((0, -0.35, -1)).normalized()
    du = (Vector((0, -1, 0.3)) - df * df.dot(Vector((0, -1, 0.3)))).normalized()
    hands = {'L': (l_pos, lf, lu), 'R': (lr['R'][0].lerp(down_g, u), lr['R'][1].lerp(df, u).normalized(),
                                         lr['R'][2].lerp(du, u).normalized())}
    fingers(bones, 'L', 'support', 'open', u)
    fingers(bones, 'R', 'trigger')
    el = elbows(c)
    el['L'] = el['L'].lerp(c.rest['UpperArm_L'].translation + Vector((0.55, 0.05, 0.10)), u)
    el['R'] = el['R'].lerp(c.rest['UpperArm_R'].translation + Vector((-0.25, 0.35, -0.3)), u)
    return hands, el


def clip_hit(c):
    def f(t):
        u = ease(t / 0.35)
        bones = {'Hips': Q(Y_AX, -8 * (1 - u))}
        flinch = keys([(0, 0.0), (0.08, -6.0), (0.25, 2.0), (1.0, -3.0)], t)
        spine(bones, pitch=flinch, yaw=10 * (1 - u), head_pitch=keys([(0, 0.0), (0.1, 8.0), (0.4, -10.0),
                                                                      (1.0, -6.0)], t))
        hands, el = _hit_upper(c, u, bones)
        return stand(c, bones, hands, el, hips=Vector((0, 0, -0.012)))
    return 30, f, False


def clip_walkoff(c):
    def upper(c, t, bones, b):
        bones['Head'] = bones.get('Head', Quaternion()) @ Q(X_AX, -4)
        return _hit_upper(c, 1.0, bones, b)
    return clip_gait(c, SPEEDS['walkoff'], 0.60, 0.70, 0.07, (0, -1, 0), drop=0.015, bob=0.015, lean=2.0,
                     yaw_amp=5.0, upper=upper)


def clips(c):
    return [
        ('Idle', clip_idle(c), False),
        ('Run_F', clip_gait(c, SPEEDS['run'], 0.34, 0.82, 0.16, (0, -1, 0), drop=0.05, bob=0.03, lean=8.0), False),
        ('Run_B', clip_gait(c, SPEEDS['run'], 0.36, 0.72, 0.13, (0, 1, 0), drop=0.05, bob=0.025, lean=4.0,
                            yaw_amp=4.0), False),
        ('Run_L', clip_gait(c, SPEEDS['run'], 0.38, 0.62, 0.12, (1, 0, 0), drop=0.06, bob=0.02, lean=3.0,
                            yaw_amp=2.0), False),
        ('Run_R', clip_gait(c, SPEEDS['run'], 0.38, 0.62, 0.12, (-1, 0, 0), drop=0.06, bob=0.02, lean=3.0,
                            yaw_amp=2.0), False),
        ('Walk_F', clip_gait(c, SPEEDS['walk'], 0.58, 0.78, 0.07, (0, -1, 0), drop=0.03, bob=0.015, lean=3.0,
                             yaw_amp=5.0), False),
        ('Sprint', clip_gait(c, SPEEDS['sprint'], 0.30, 0.95, 0.22, (0, -1, 0), drop=0.07, bob=0.035, lean=15.0,
                             yaw_amp=8.0, upper='sprint'), False),
        ('CrouchIdle', clip_crouch_idle(c), False),
        ('CrouchWalk', clip_gait(c, SPEEDS['crouch'], 0.62, 0.52, 0.06, (0, -1, 0), drop=0.0, bob=0.012, lean=6.0,
                                 yaw_amp=5.0, crouch=0.42), False),
        ('Jump', clip_jump(c), False),
        ('Rifle_Aim', clip_aim(c, 'rifle', 0.0), True),
        ('Rifle_AimUp', clip_aim(c, 'rifle', 60.0), True),
        ('Rifle_AimDown', clip_aim(c, 'rifle', -60.0), True),
        ('Pistol_Aim', clip_aim(c, 'pistol', 0.0), True),
        ('Pistol_AimUp', clip_aim(c, 'pistol', 60.0), True),
        ('Pistol_AimDown', clip_aim(c, 'pistol', -60.0), True),
        ('Rifle_Reload', clip_rifle_reload(c), True),
        ('Pistol_Reload', clip_pistol_reload(c), True),
        ('Switch', clip_switch(c), True),
        ('HitCall', clip_hit(c), False),
        ('WalkOff', clip_walkoff(c), False),
    ]


def make_animations(rig, only=None):
    """Bake every clip into an action on its own NLA track (one glTF animation each) and return the clip list
    for the sidecar file. Removes the targets afterwards."""
    c = anim_setup(rig)
    info = []
    rig.animation_data_create()
    for tr in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(tr)
    for name, (frames, fn, loop), upper in clips(c):
        if only and name not in only:
            continue
        act, n = bake_clip(c, name, frames, fn, upper_only=upper, loop=loop)
        tr = rig.animation_data.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, 0, act)
        tr.mute = True
        speed = None
        for k, v in (('Run', SPEEDS['run']), ('Walk_F', SPEEDS['walk']), ('Sprint', SPEEDS['sprint']),
                     ('CrouchWalk', SPEEDS['crouch']), ('WalkOff', SPEEDS['walkoff'])):
            if name.startswith(k):
                speed = v
        info.append({'name': name, 'seconds': round(frames / FPS, 3), 'frames': frames, 'loop': loop,
                     'upperBodyOnly': upper, 'speed': speed})
    return c, info


def anim_cleanup(rig):
    for pb in rig.pose.bones:
        for con in list(pb.constraints):
            pb.constraints.remove(con)
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
    col = bpy.data.collections.get(CTL)
    if col:
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)

# --- v11 (IM8): the crouch as low as the game's crouch -----------------------------------------------------------
# The game crouches a player's hit volume by lowering everything above the hips 0.62 m (config/hits.ts crouchDrop: the
# head's top from 1.75 m to 1.13 m, under 1.2 m crouch cover). Its figures hold the upper body upright over the legs'
# clips while in play (render/riggedFigure.ts), so only the hips' height lowers the drawn head: v10's kneel sat 6 cm
# higher than that and its crouch walk 19 cm higher, the head over crouch cover the hit volume says it is under.
# Both clips now lower the hips by the same 0.62 m from standing: the kneel sits back on the rear heel, the crouch walk
# is a deep, knees-out crouch with the rear heel well up. The chest leans as it did (the game holds it upright anyway,
# and your own first-person body is the clip's: leaning further would bring it into view).
CROUCH_DROP = 0.62          # config/hits.ts HITS.crouchDrop
STAND_HIPS = 0.012          # clip_idle's hips sit this far down: standing, as the game draws it
# The kneel (metres): the hips' move back (none: the chest stays over the hit volume's), the front foot (x, y) and the
# rear ankle (x, y, z) from the hips, the rear knee's pad then just on the floor and the seat just over the rear heel.
KNEEL = {'back': 0.0, 'front': (0.03, -0.42), 'rear': (-0.01, 0.065, 0.175)}
# The crouch walk: the hips' drop under the rest pose (as the kneel's) and v10's crouch (gait's `crouch`) for the chest's
# and pelvis' lean. So low, a trailing knee pointing straight ahead would scrape the floor: the knees' poles sit out to
# the side (metres), further as the foot trails behind (up to `trail_out` more at the back of the stride), the feet a
# little wider apart (metres) and their toes turned out (degrees), as in a deep squat.
CROUCH_WALK = {'drop': STAND_HIPS + CROUCH_DROP, 'bend': 0.42, 'knees_out': 0.3, 'trail_out': 0.8, 'feet_out': 0.05,
               'toes_out': 15.0}
CROUCH_WALK_STRIDE = (0.62, 0.52)   # gait's stance share and stride (metres), as v10's


def clip_crouch_idle(c):
    """Kneeling on the rear knee and sitting back on its heel (toes tucked under), the front shin upright: the hips
    CROUCH_DROP under standing. The feet are placed from the hips so the rear knee rests on the floor."""
    def f(t):
        br = math.sin(2 * math.pi * t)
        bones = {'Hips': Q(Y_AX, -10) @ Q(X_AX, 14), 'Toe_R': Q(X_AX, 70)}    # rear toes tucked under
        spine(bones, pitch=24 + 0.6 * br, yaw=8, head_pitch=-34)
        fingers(bones, 'R', 'trigger')
        fingers(bones, 'L', 'support')
        drop = STAND_HIPS + CROUCH_DROP
        hp = Vector((0, KNEEL['back'], -drop + 0.003 * br))
        hy = c.hips.y + KNEEL['back']
        fx, fy = KNEEL['front']
        rx, ry, rz = KNEEL['rear']
        feet = {'L': (Vector((c.ankle['L'].x + fx, hy + fy, c.ankle['L'].z)), 0.0, 4.0),
                'R': (Vector((c.ankle['R'].x + rx, hy + ry, rz)), -75.0, -4.0)}
        knees = {'L': Vector((0.30, -0.9, 0.9)), 'R': Vector((-0.14, -0.9, 0.05))}
        hands = low_ready(c, Vector((0, 0.03, -drop)))
        return {'bones': bones, 'hips': hp, 'feet': feet, 'hands': hands, 'elbows': elbows(c, down=0.5 + drop),
                'knees': knees}
    return 60, f, True


def _crouch_walk_extra(c, deep, D):
    """The deep crouch walk over gait(..., crouch=deep) of stride D: the chest and pelvis lean back to v10's, the hands
    sit as high on the chest as they did (gait lowers them only 0.8 of the hips' drop), the knees point out (the
    trailing one more) and the feet step a little wider, toes out."""
    W = CROUCH_WALK
    bend = W['bend']
    lean, yaw_amp = 6.0, 5.0                    # as the clip below passes gait()
    lower = Vector((0, 0, -(deep - bend) * 0.2))

    def extra(pose, t):
        _crouch_extra(pose, t)
        bones = pose['bones']
        yaw = yaw_amp * math.sin(2 * math.pi * t)
        bones['Hips'] = Q(Y_AX, yaw) @ Q(X_AX, lean * 0.4 + bend * 60)
        spine(bones, pitch=lean * 0.6 + bend * 50, yaw=-yaw * 1.2, head_pitch=-(lean * 0.6 + bend * 105 + lean * 0.4))
        for sd, s in (('L', 1.0), ('R', -1.0)):
            p, pitch, yaw = pose['feet'][sd]
            trail = max(0.0, min(1.0, (p.y - c.ankle[sd].y) / (D / 2)))      # 0 under the hip or ahead, 1 at the back
            pose['knees'][sd] = pose['knees'][sd] + Vector((s * (W['knees_out'] + W['trail_out'] * trail), 0, 0))
            pose['feet'][sd] = (p + Vector((s * W['feet_out'], 0, 0)), pitch, yaw + s * W['toes_out'])
        pose['hands'] = {sd: (h[0] + lower,) + tuple(h[1:]) for sd, h in pose['hands'].items()}
    return extra


if not getattr(clips, 'v17', False):
    _clips16 = clips


def clips(c):
    out = []
    for name, clip, upper in _clips16(c):
        if name == 'CrouchWalk':
            deep = CROUCH_WALK['drop'] - 0.012 / 2          # gait() bobs the hips 0-12 mm further down
            stance, D = CROUCH_WALK_STRIDE
            D = _cycle(SPEEDS['crouch'], stance, D)[1]       # the stride clip_gait works out
            clip = _in_context(name, clip_gait(c, SPEEDS['crouch'], stance, CROUCH_WALK_STRIDE[1], 0.06, (0, -1, 0),
                                               drop=0.0, bob=0.012, lean=6.0, yaw_amp=5.0, crouch=deep,
                                               upper=_crouch_upper, extra=_crouch_walk_extra(c, deep, D)), upper)
        out.append((name, clip, upper))
    return out


clips.v14 = clips.v14b = clips.v14c = clips.v17 = True

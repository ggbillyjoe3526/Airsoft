# Blender models bug pass (BP4): the holstered clips both figures share. Clips only, for any figure on the rig (human
# or robot): run after bot18. With the replica holstered (M92: key 3) the game slings the rifle across the back and
# puts the pistol away, so the hands are empty:
#
# Holster: standing at ease, the arms hanging at the sides with the elbows a little bent and the hands relaxed. An
# upper-body clip like the aims (one frame): the game lays it over the legs' clips while holstered.
# Holster_Sprint: the holstered sprint's arms, pumping in loose fists opposite the legs. Made on the Sprint clip's own
# stride, lean and hips, so the game plays its upper body in step with the Sprint's legs in place of the Sprint's own
# (which carries the rifle).
#
# The hands hold nothing, so their frames are given directly (HOLD 'none'): the wrist's place, the way the hand runs
# from the wrist to the fingers and the way the back of the hand faces.

FINGERS['fist'] = {'Index': (-58, -78, -40), 'Middle': (-62, -80, -42), 'Ring': (-66, -80, -42),
                   'Pinky': (-70, -80, -42), 'Thumb': (-14, -24, -12)}
HOLSTER = {
    # the wrist (metres, the figure's left side; the right mirrors it), the hand's run and the back of the hand
    'wrist': (0.235, -0.035, 0.86), 'along': (0.10, -0.06, -1.0), 'back': (0.96, -0.25, 0.08),
    'elbow': (0.06, 0.30, -0.28),          # the elbow's pull from the shoulder: out, back, down (hanging arms bend back)
    'chest': 1.5,                          # degrees of the chest's forward lean (at ease, not braced)
}
# Holster_Sprint: the fists at the swing's front and back (the figure's left; the right mirrors it), each with the
# hand's run and the back of the hand; the forward swing rises to the chest, the back swing passes the hip.
PUMP = {
    'front': ((0.13, -0.30, 1.22), (-0.35, -0.55, 0.75), (0.85, -0.05, 0.45)),
    'back': ((0.22, 0.20, 0.98), (0.10, -0.35, -0.93), (0.95, 0.05, 0.25)),
    'elbow_front': (0.12, 0.30, -0.30), 'elbow_back': (0.10, 0.40, 0.05),
    'lead': 0.03,                          # the arm swing's lead on the opposite foot, in shares of the cycle
}


if not getattr(hand_target, 'v23', False):
    _hand_target13 = hand_target


def hand_target(c, sd, grip, barrel, up):
    """As before, but an empty hand (HOLD 'none') takes its frame as given: no replica's seat in the fist."""
    if HOLD[0] == 'none':
        return _hand_target11(c, sd, grip, barrel, up)
    return _hand_target13(c, sd, grip, barrel, up)


hand_target.v23 = True


def _mirror(v, sd):
    v = Vector(v)
    return Vector((-v.x, v.y, v.z)) if sd == 'R' else v


def empty_hand(c, sd, wrist, along, back):
    """The (grip, barrel, up) that put hand `sd`'s wrist at `wrist` with the hand running along `along` and its back
    facing `back` (all given for the left hand: the right's are mirrored), for hand_target's empty-hand frame."""
    w, a, k = _mirror(wrist, sd), _mirror(along, sd).normalized(), _mirror(back, sd)
    hm, b0, u0, off = c.hand[sd]
    rest = _frame(hm.col[1].to_3d(), hm.col[2].to_3d())
    d = _frame(a, k) @ rest.inverted()
    return w + d @ off, d @ b0, d @ u0


def clip_holster(c):
    H = HOLSTER

    def f(t):
        bones = {}
        spine(bones, pitch=H['chest'], head_pitch=-H['chest'])
        fingers(bones, 'L', 'relax')
        fingers(bones, 'R', 'relax')
        hands = {sd: empty_hand(c, sd, H['wrist'], H['along'], H['back']) for sd in 'LR'}
        el = {sd: c.rest['UpperArm_' + sd].translation + _mirror(H['elbow'], sd) for sd in 'LR'}
        return stand(c, bones, hands, el)
    return 1, f, True


def _pump(c, sd, s, b):
    """Hand `sd` at swing `s` (1 at the front, -1 at the back), carried by `b` (the gait's bob)."""
    P = PUMP
    u = 0.5 + 0.5 * s
    # the fist turns by slerp between its two ends (a lerp of the directions flips it mid-swing) and swings round the
    # shoulder, a little higher mid-way
    g, barrel, up = _blend_hand(empty_hand(c, sd, *P['back']), empty_hand(c, sd, *P['front']), u)
    hand = (g + Vector(b) + Vector((0.0, 0.0, 0.05 * math.sin(math.pi * u))), barrel, up)
    el = c.rest['UpperArm_' + sd].translation + _mirror(Vector(P['elbow_back']).lerp(Vector(P['elbow_front']), u), sd)
    return hand, el


def _sprint_pump(c, t, bones, b):
    """The holstered sprint's arms: the right arm forward as the left foot strikes (the gait's t 0), and back."""
    s = math.cos(2 * math.pi * (t + PUMP['lead']))
    fingers(bones, 'L', 'fist')
    fingers(bones, 'R', 'fist')
    hands, el = {}, {}
    for sd, k in (('R', s), ('L', -s)):
        hands[sd], el[sd] = _pump(c, sd, k, b)
    return hands, el


if not getattr(clip_context, 'v23', False):
    _clip_context18 = clip_context


def clip_context(name, t):
    if name in ('Holster', 'Holster_Sprint'):
        return 'none', 0.0
    return _clip_context18(name, t)


clip_context.v23 = True


if not getattr(clips, 'v23', False):
    _clips18 = clips


def clips(c):
    out = list(_clips18(c))
    have = {n for n, cl, u in out}
    if 'Holster' not in have:
        out.append(('Holster', _in_context('Holster', clip_holster(c), True), True))
    if 'Holster_Sprint' not in have:
        # the Sprint's own gait (bot14), its arms pumping: keyed on the upper body only, over the Sprint's own hips
        gait_clip = clip_gait(c, SPEEDS['sprint'], 0.30, 0.95, 0.22, (0, -1, 0), drop=0.07, bob=0.035, lean=15.0,
                              yaw_amp=8.0, upper=_sprint_pump)
        out.append(('Holster_Sprint', _in_context('Holster_Sprint', gait_clip, False), True))
    return out


clips.v14 = clips.v14b = clips.v14c = clips.v17 = clips.v18 = clips.v23 = True

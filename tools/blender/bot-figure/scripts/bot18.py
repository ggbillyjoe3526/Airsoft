# Figure redesign (Dev 6): the clips both figures share for the new moves. Clips only, for any figure on the rig
# (human or robot): run after bot17 and before a figure's own mesh layer.
#
# Rifle_Rest, Rifle_RestUp, Rifle_RestDown and the pistol's three (M104, resting the replica on cover): each aim clip
# leaned in over the cover. The spine hinges forward, the head turns back up so the eyes stay level, the replica moves
# with the shoulders (the bore keeps its line, the arms their bend) and the support elbow drops as if braced on the
# top. The game blends them by the view's pitch as it does the aim clips, and in by how settled the rest is
# (render/figurePose.ts). Held poses, like the aims: one frame each.
#
# Vault (M102, over low cover): played by the vault's progress, not by time (render/figurePose.ts). The game lifts the
# body straight up onto the top in a crouch, its feet just clear of the top, and slides it across (sim/vault.ts), so
# the clip is a tucked hop over the top in the body's own frame: VAULT_TOP of it on the rise, the rest on the crossing.
# The head and hips stay about where the crouched hit volume's are, which leaves the top out of the free hand's reach:
# it reaches for the top and pushes down beside the knee instead.

REST = {'rifle': {'lean': 14.0, 'elbow_drop': 0.06}, 'pistol': {'lean': 10.0, 'elbow_drop': 0.03}}
REST_SPLIT = (('Spine', 0.65), ('Spine1', 0.35))      # the lean's share per bone: mostly a hinge at the lower back


def rest_shift(c, lean):
    """How far leaning the spine forward by `lean` degrees (split as REST_SPLIT) carries the shoulders."""
    e0 = (c.rest['UpperArm_L'].translation + c.rest['UpperArm_R'].translation) / 2
    e = e0.copy()
    for n, k in reversed(REST_SPLIT):                 # the child's turn first, then the parent carries it
        p = c.rest[n].translation
        e = p + Q(X_AX, lean * k) @ (e - p)
    return e - e0


def clip_rest(c, aim, hold):
    """The aim clip `aim` (frames, fn, loop) leaned in over cover for `hold` ('rifle' or 'pistol'), at its first
    frame."""
    fn = aim[1]
    r = REST[hold]
    shift = rest_shift(c, r['lean'])

    def g(t):
        pose = fn(t)
        bones = pose['bones']
        for n, k in REST_SPLIT:
            bones[n] = Q(X_AX, r['lean'] * k) @ bones.get(n, Quaternion())
        for n in ('Neck', 'Head'):
            bones[n] = Q(X_AX, -r['lean'] * 0.5) @ bones.get(n, Quaternion())
        pose['hands'] = {sd: (h[0] + shift,) + tuple(h[1:]) for sd, h in pose['hands'].items()}
        el = pose.get('elbows')
        if el and 'L' in el:
            el['L'] = Vector(el['L']) + Vector((0.0, 0.0, -r['elbow_drop']))
        return pose
    return 1, (lambda t: g(0.0)), True


# the share of the Vault clip played by the rise onto the top; the crossing plays the rest (config/figureRig.ts vault)
VAULT_TOP = 0.40
# the clip's beats (shares): tucked, level with the top (still short of it), over it (the body crosses the top about
# 0.6 to 0.8 of the way for the walls and crates a vault takes), legs down for the far side
TUCK, LEVEL, OVER, LAND = 0.16, 0.45, 0.75, 0.90
# the chest turns square to the way (no rifle twist) by TUCK, and back to the twist the run and the jump hold the
# rifle with between these two shares, so the free hand reaches the handguard again
VAULT_SQUARE = (0.75, 0.92)
# The rifle carried one-handed over the top: upright in front of the right of the chest, the muzzle up, the forearm
# under it. The free hand (palm down and in) reaches forward and down, pushes down by the knee and sweeps back past
# the hip, turned palm in on its way off the handguard and back (so the forearm turns the natural way round). All
# given at the rest pose and carried by the chest.
VAULT_CARRY = ((-0.22, -0.30, 1.30), (0.08, -0.35, 1.0), (0.0, 1.0, 0.35))
VAULT_REACH = ((0.22, -0.25, 1.04), (0.10, -1.0, -0.50), (-0.70, 0.0, 0.70))
VAULT_PUSH = ((0.24, -0.24, 0.96), (0.10, -1.0, -0.30), (-0.75, 0.05, 0.65))
VAULT_PAST = ((0.28, 0.02, 0.92), (0.15, -1.0, 0.0), (-0.75, 0.10, 0.65))
VAULT_PALM_IN = ((0.0, 0.0, 0.0), (0.05, -1.0, -0.30), (0.0, -0.25, 1.0))
# the feet, (ahead of rest, up from rest, toe pitch) at each beat: the right knee tucked up with its foot under it,
# the left foot hanging under the body, skimming the top; at the end both feet tucked up as the jump's are, the hips
# nearly back up (the fall's Jump clip holds them a little higher). The bake lifts any frame whose boots would go under
# the root (bot12 floor_fix), so they always pass over the top
VAULT_LEAD = [(0, (-0.06, 0.06, -10.0)), (TUCK, (-0.20, 0.18, -20.0)), (LEVEL, (-0.24, 0.22, -30.0)),
              (OVER, (-0.24, 0.22, -30.0)), (LAND, (-0.12, 0.26, -10.0)), (1.0, (-0.02, 0.30, 10.0))]
VAULT_TRAIL = [(0, (0.10, 0.00, -20.0)), (TUCK, (0.0, 0.06, -30.0)), (LEVEL, (-0.02, 0.04, -40.0)),
               (OVER, (-0.02, 0.04, -40.0)), (LAND, (-0.06, 0.24, -10.0)), (1.0, (0.0, 0.30, 10.0))]


def posed_frames(c, bones, hips, names):
    """World matrices of `names` (and their parents up to Root) for pose rotations `bones` and the Hips' world offset
    `hips`, from the rest frames: where apply() puts the spine and shoulders (the limbs' IK aside)."""
    data = c.rig.data.bones
    out = {}

    def w(n):
        if n not in out:
            q = bones.get(n, Quaternion()).to_matrix().to_4x4()
            p = data[n].parent
            m = (w(p.name) @ c.rest[p.name].inverted() if p else Matrix()) @ c.rest[n] @ q
            out[n] = Matrix.Translation(Vector(hips)) @ m if n == 'Hips' and hips is not None else m
        return out[n]
    for n in names:
        w(n)
    return out


def carried(m, rest, frame):
    """A hand frame (point, barrel, up) given at the rest pose, carried rigidly by a bone from `rest` to `m`."""
    k = m @ rest.inverted()
    r = k.to_3x3()
    return k @ Vector(frame[0]), (r @ Vector(frame[1])).normalized(), (r @ Vector(frame[2])).normalized()


def clip_vault(c):
    """The take-off, the hop up and across the top: the knees tuck up (the right one leading), the left hand reaches
    for the top and pushes down, the rifle rides muzzle up in the right hand. It ends with the feet tucked up as the
    jump's are, which the fall off the far side plays (FIGURE_RIG.jump)."""
    def f(t):
        bones = {}
        lean = keys([(0, 22.0), (TUCK, 18.0), (LEVEL, 10.0), (OVER, 8.0), (LAND, 6.0), (1.0, 6.0)], t)
        roll = keys([(0, 0.0), (TUCK, -6.0), (LEVEL, -10.0), (OVER, -8.0), (LAND, -2.0), (1.0, 0.0)], t)
        spine(bones, pitch=lean * 0.7, roll=roll, head_pitch=-lean * 0.85, head_yaw=0.0)
        bones['Hips'] = Q(X_AX, lean * 0.3)
        hz = keys([(0, -0.10), (TUCK, -0.24), (LEVEL, -0.38), (OVER, -0.38), (LAND, -0.20), (1.0, -0.08)], t)
        hips = Vector((0.0, 0.03, hz))
        feet, knees = {}, {}
        for sd, legs in (('R', VAULT_LEAD), ('L', VAULT_TRAIL)):
            a = c.ankle[sd]
            fy, fz, tp = (keys([(k, v[i]) for k, v in legs], t) for i in range(3))
            feet[sd] = (Vector((a.x * 0.85, a.y + fy, a.z + fz)), tp, 0.0)
            knees[sd] = Vector((a.x * 1.3, -0.8, keys([(0, 1.0), (TUCK, 1.2), (OVER, 1.2), (1.0, 1.0)], t)))
        fr = posed_frames(c, bones, hips, ('Chest', 'UpperArm_L', 'UpperArm_R'))
        # the low ready (the run's and the jump's hold) carried by the chest from its standing place at this twist
        stand = {}
        spine(stand, 0.0, head_pitch=0.0)
        chest0 = posed_frames(c, stand, None, ('Chest',))['Chest']
        lr = {sd: carried(fr['Chest'], chest0, h) for sd, h in low_ready(c).items()}
        on = {k: carried(fr['Chest'], c.rest['Chest'], v) for k, v in (('carry', VAULT_CARRY), ('reach', VAULT_REACH),
              ('push', VAULT_PUSH), ('past', VAULT_PAST), ('in', VAULT_PALM_IN))}
        out_way = (lr['L'][0].lerp(on['reach'][0], 0.5),) + on['in'][1:]
        back_way = (on['past'][0].lerp(lr['L'][0], 0.5),) + on['in'][1:]
        R = _hand_path([(0.0, lr['R']), (0.20, on['carry']), (0.86, on['carry']), (1.0, lr['R'])], t)
        L = _hand_path([(0.0, lr['L']), (0.13, out_way), (0.25, on['reach']), (LEVEL, on['push']), (OVER, on['past']),
                        (0.84, back_way), (1.0, lr['L'])], t)
        fingers(bones, 'R', 'trigger')
        fingers(bones, 'L', 'support', 'open', min(1.0, t / 0.18) if t < OVER else max(0.0, 1 - (t - OVER) / 0.2))
        el = {'L': fr['UpperArm_L'].translation + Vector((0.30, 0.22, -0.05)),
              'R': fr['UpperArm_R'].translation + Vector((-0.15, -0.05, -0.30))}
        return {'bones': bones, 'hips': hips, 'feet': feet, 'hands': {'L': L, 'R': R}, 'elbows': el, 'knees': knees}
    return 36, f, False         # played by the vault's progress: the frames only set how finely it is sampled


if not getattr(clip_context, 'v18', False):
    _clip_context13 = clip_context


def clip_context(name, t):
    if name == 'Vault':
        a, b = VAULT_SQUARE
        return 'rifle', RIFLE_TWIST * (1 - ease(t / TUCK) * ease((b - t) / (b - a)))
    return _clip_context13(name, t)


clip_context.v18 = True


if not getattr(clips, 'v18', False):
    _clips17 = clips


def clips(c):
    out = list(_clips17(c))
    aim = {n: (cl, u) for n, cl, u in out}
    for kind, hold in (('Rifle', 'rifle'), ('Pistol', 'pistol')):
        for pitch in ('', 'Up', 'Down'):
            name = '%s_Rest%s' % (kind, pitch)
            if name not in aim:
                out.append((name, clip_rest(c, aim['%s_Aim%s' % (kind, pitch)][0], hold), True))
    if 'Vault' not in aim:
        out.append(('Vault', _in_context('Vault', clip_vault(c)), False))
    return out


clips.v14 = clips.v14b = clips.v14c = clips.v17 = clips.v18 = True

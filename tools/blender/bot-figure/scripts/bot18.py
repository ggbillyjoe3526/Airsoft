# Figure redesign (Dev 6): the clips both figures share for the new moves. Clips only, for any figure on the rig
# (human or robot): run after bot17 and before a figure's own mesh layer.
#
# Rifle_Rest, Rifle_RestUp, Rifle_RestDown and the pistol's three (M104, resting the replica on cover): each aim clip
# leaned in over the cover. The spine hinges forward, the head turns back up so the eyes stay level, the replica moves
# with the shoulders (the bore keeps its line, the arms their bend) and the support elbow drops as if braced on the
# top. The game blends them by the view's pitch as it does the aim clips, and in by how settled the rest is
# (render/figurePose.ts). Held poses, like the aims: one frame each.

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
    return out


clips.v14 = clips.v14b = clips.v14c = clips.v17 = clips.v18 = True

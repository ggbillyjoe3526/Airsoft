# --- v8 checking helpers (run after load.py and session.py): posing, baking one clip, arm/torso checks, finger solves
# on the real replicas and magazines. Kept as a file so a Blender restart only needs: load.py, session.py, this.
import bpy, io, contextlib, json, math, time
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_point_line

B = bpy.app.driver_namespace['bot']
WORK = r'C:\Users\Billy\Documents\Airsoft models\work'
B['rl'] = B['reload']


def _rig():
    return bpy.data.objects['Rig']


def show(kind):
    rig = _rig(); L = rig.data.bones['Grip_R'].length
    for k, n in (('rifle', 'RifleReal'), ('pistol', 'PistolReal')):
        o = bpy.data.objects.get(n)
        o.parent = rig; o.parent_type = 'BONE'; o.parent_bone = 'Grip_R'
        o.matrix_parent_inverse = Matrix.Translation((0, -L, 0))
        o.matrix_basis = B['REPLICA_ON_GRIP'][k]
        vis = (k == kind); o.hide_viewport = not vis
        for ch in o.children_recursive:
            ch.hide_viewport = not vis


def pose_at(clip, t, hold='rifle'):
    rig = _rig()
    for p in rig.pose.bones:
        for k in p.constraints:
            k.mute = True
    rig.animation_data.action = bpy.data.actions[clip]
    bpy.context.scene.frame_set(int(round(t * 30)))
    show(hold)
    for o in bpy.data.objects:
        if 'LOD' in o.name:
            o.hide_viewport = True


def unpose():
    rig = _rig(); rig.animation_data.action = None
    for p in rig.pose.bones:
        for k in p.constraints:
            k.mute = False


def bake_one(name):
    c = B['C']; rig = _rig()
    with contextlib.redirect_stdout(io.StringIO()):
        for n, cc, up in B['clips'](c):
            if n == name:
                fr, fn, lp = cc
                act, _ = B['bake_clip'](c, n, fr, fn, up, lp)
                tr = rig.animation_data.nla_tracks.get(n)
                if tr and tr.strips:
                    tr.strips[0].action = act
                return fr


def rebake(names, kind='robot'):
    unpose(); restore = B['apply_kind'](kind)
    try:
        for n in names:
            bake_one(n)
    finally:
        restore()


def at(fr, clip='Pistol_Reload', hold='pistol', bone='Hand_L'):
    pose_at(clip, fr / 30, hold)
    rig = _rig()
    bpy.data.objects['T_Tmp'].location = rig.matrix_world @ rig.pose.bones[bone].head
    bpy.context.view_layer.update()


def ftw(sd='L'):
    rig = _rig(); pb, db = rig.pose.bones, rig.data.bones
    rest = (db['Forearm_' + sd].matrix_local.inverted() @ db['Hand_' + sd].matrix_local).to_quaternion()
    cur = (pb['Forearm_' + sd].matrix.inverted() @ pb['Hand_' + sd].matrix).to_quaternion()
    q = rest.inverted() @ cur
    return ((math.degrees(2 * math.atan2(q.y, q.w)) + 540) % 360) - 180


# --- left arm against the torso ---
TB = ('Spine', 'Spine1', 'Chest', 'Hips')
ARM_RAD = {'UpperArm_L': 0.040, 'Forearm_L': 0.034}


def _tverts(o):
    names = {g.index: g.name for g in o.vertex_groups}
    return [v.index for v in o.data.vertices if v.groups and names[max(v.groups, key=lambda g: g.weight).group] in TB]


def arm_in(clip, fr, hold):
    pose_at(clip, fr / 30, hold); bpy.context.view_layer.update()
    rig = _rig(); pb = rig.pose.bones; RW = rig.matrix_world
    dg = bpy.context.evaluated_depsgraph_get(); segs = {}
    for seg in ARM_RAD:
        b = pb[seg]; h, t = RW @ b.head, RW @ b.tail
        if seg == 'UpperArm_L':
            h = h.lerp(t, 0.35)
        segs[seg] = (h, t)
    out = {s: [0, 9.0] for s in ARM_RAD}
    for on in ('Body', 'Kit'):
        o = bpy.data.objects.get(on)
        if o is None:
            continue
        vl = _tverts(o); me = o.evaluated_get(dg).to_mesh(); M = o.matrix_world
        for vi in vl:
            p = M @ me.vertices[vi].co
            for seg, (h, t) in segs.items():
                q, lam = intersect_point_line(p, h, t)
                lam = max(0, min(1, lam)); d = (p - h.lerp(t, lam)).length
                if d < ARM_RAD[seg]:
                    out[seg][0] += 1
                out[seg][1] = min(out[seg][1], d - ARM_RAD[seg])
        o.evaluated_get(dg).to_mesh_clear()
    return {k: (v[0], round(v[1] * 1000)) for k, v in out.items()}


def phase_metrics(frames, clip='Pistol_Reload', hold='pistol', kind='human', bake=True):
    """(arm vertices inside the torso, max |forearm turn|, max wrist bend, max elbow snap per frame) for the left arm."""
    if bake:
        rebake([clip], kind)
    pb = _rig().pose.bones
    ins = 0; tw = 0; bend = 0; prev = None; snap = 0
    for fr in frames:
        r = arm_in(clip, fr, hold)
        ins += r['Forearm_L'][0] + 0.5 * r['UpperArm_L'][0]
        tw = max(tw, abs(ftw('L')))
        fa = pb['Forearm_L'].matrix.to_3x3(); h = pb['Hand_L'].matrix.to_3x3()
        bend = max(bend, math.degrees(fa.col[1].angle(h.col[1])))
        e = pb['Forearm_L'].matrix.to_3x3().col[1]
        if prev is not None:
            snap = max(snap, math.degrees(prev.angle(e)))
        prev = e.copy()
    return round(ins), round(tw), round(bend), round(snap)


# --- magazines in the left hand ---
MJ = json.load(open(WORK + r'\mags.json'))
B['MAG_MESH'] = {k: ([Vector(v) for v in d['V']], [tuple(f) for f in d['F']]) for k, d in MJ.items()}


def mag_tree(key):
    V, F = B['MAG_MESH'][key]; Mi = B['L_IN_MAG'][key].inverted()
    return BVHTree.FromPolygons([Mi @ v for v in V], F)


def chainH(f, angs, sp, sd='L'):
    db = _rig().data.bones
    M = Matrix.Identity(4); par = 'Hand_' + sd; out = []
    for k in range(3):
        n = '%s%d_%s' % (f, k + 1, sd)
        rel = db[par].matrix_local.inverted() @ db[n].matrix_local
        q = Quaternion((1, 0, 0), -math.radians(angs[k]))
        if k == 0 and sp:
            q = Quaternion((0, 0, 1), math.radians(sp)) @ q
        M = M @ rel @ q.to_matrix().to_4x4(); par = n
        out.append((M.translation.copy(), M @ Vector((0, db[n].length, 0)), n))
    return out


def scoreMag(T, f, angs, sp, rad):
    pen = 0; gap = 0; w = 0; g = []
    for k, (a, b, n) in enumerate(chainH(f, angs, sp)):
        r = rad[n]
        for s in (0.5, 1.0):
            p = a.lerp(b, s); loc, nr, i, d = T.find_nearest(p)
            sd = (d if (p - loc).dot(nr) >= 0 else -d) - r
            w = min(w, sd)
            if sd < -0.0015:
                pen += ((sd + 0.0015) * 1000) ** 2 * 10
            if k >= 1:
                gap += max(0, sd * 1000 - 1.0) ** 2; g.append(round(sd * 1000, 1))
    return pen + gap, round(w * 1000, 1), g


def solve_mag(key, kind_rad, spr=None, prange=range(0, 91, 6), mrange=range(-10, 71, 5)):
    T = mag_tree(key); MF = B['MAG_FINGERS'][key]; out = {}
    for f in ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb'):
        sp0 = MF[f][1]; best = []
        sps = range(sp0 - 20, sp0 + 21, 5) if f != 'Thumb' else range(sp0 - 40, sp0 + 41, 10)
        for sp in sps:
            for m in (mrange if f != 'Thumb' else range(-30, 61, 6)):
                for p in prange:
                    for dr in (0.7, 1.0):
                        s = scoreMag(T, f, (m, p, round(p * dr, 1)), sp, kind_rad)
                        best.append((round(s[0], 1), ((m, p, round(p * dr, 1)), sp), s[1], s[2]))
        best.sort(key=lambda r: r[0]); out[f] = best[0]
    return out


def mag_proxy(key, show_it=True):
    rig = _rig(); n = 'MagProxy_' + key
    o = bpy.data.objects.get(n)
    if o is None:
        V, F = B['MAG_MESH'][key]
        me = bpy.data.meshes.new(n); me.from_pydata([tuple(v) for v in V], [], F); me.update()
        o = bpy.data.objects.new(n, me); bpy.context.scene.collection.objects.link(o)
    L = rig.data.bones['Hand_L'].length
    o.parent = rig; o.parent_type = 'BONE'; o.parent_bone = 'Hand_L'
    o.matrix_parent_inverse = Matrix.Translation((0, -L, 0))
    o.matrix_basis = B['L_IN_MAG'][key].inverted()
    o.hide_viewport = not show_it; o.hide_render = not show_it
    return o


# --- the right index on the trigger ---
BLADE = {'rifle': ((-0.005, -0.003, -0.062), (0.005, 0.011, -0.028)),
         'pistol': ((-0.004, -0.006, -0.04), (0.004, 0.005, -0.012))}


def trig_setup(key):
    dg = bpy.context.evaluated_depsgraph_get()
    rig = _rig(); pb = rig.pose.bones; db = rig.data.bones
    R = bpy.data.objects[{'rifle': 'RifleReal', 'pistol': 'PistolReal'}[key]]
    me = R.evaluated_get(dg).to_mesh()
    T = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    R.evaluated_get(dg).to_mesh_clear()
    return dict(T=T, A=R.matrix_world.inverted() @ rig.matrix_world, H=pb['Hand_R'].matrix.copy(), db=db,
                rad=B['finger_radii']('R'))


def trig_chain(S, angs, sp, f='Index'):
    db = S['db']; M = S['H']; par = 'Hand_R'; out = []
    for k in range(3):
        n = '%s%d_R' % (f, k + 1)
        rel = db[par].matrix_local.inverted() @ db[n].matrix_local
        q = Quaternion((1, 0, 0), -math.radians(angs[k]))
        if k == 0 and sp:
            q = Quaternion((0, 0, 1), math.radians(sp)) @ q
        M = M @ rel @ q.to_matrix().to_4x4(); par = n
        out.append((S['A'] @ M.translation, S['A'] @ (M @ Vector((0, db[n].length, 0))), n))
    return out


def trig_pen(S, ch, key):
    lo, hi = BLADE[key]; worst = 0
    for a, b, n in ch:
        r = S['rad'][n]
        for s in (0.25, 0.5, 0.75, 1.0):
            p = a.lerp(b, s); loc, nr, i, d = S['T'].find_nearest(p)
            if loc is None:
                continue
            if all(lo[j] <= loc[j] <= hi[j] for j in range(3)):
                continue
            sd = (d if (p - loc).dot(nr) >= 0 else -d) - r * (0.85 if s == 1.0 else 1.0)
            worst = min(worst, sd)
    return worst


# --- the left hand on the AEG handguard ---
def support_setup():
    """Hand_L in Rifle_Aim, the AEG mesh in replica space, and the left finger radii; for chainL/scoreL."""
    pose_at('Rifle_Aim', 0.3, 'rifle'); bpy.context.view_layer.update()
    rig = _rig(); R = bpy.data.objects['RifleReal']; dg = bpy.context.evaluated_depsgraph_get()
    me = R.evaluated_get(dg).to_mesh()
    T = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    R.evaluated_get(dg).to_mesh_clear()
    return dict(T=T, A=R.matrix_world.inverted() @ rig.matrix_world, H=rig.pose.bones['Hand_L'].matrix.copy(),
                db=rig.data.bones, rad=B['finger_radii']('L'))


def chainL(S, f, angs, sp):
    db = S['db']; M = S['H']; par = 'Hand_L'; out = []
    for k in range(3):
        n = '%s%d_L' % (f, k + 1)
        rel = db[par].matrix_local.inverted() @ db[n].matrix_local
        q = Quaternion((1, 0, 0), -math.radians(angs[k]))
        if k == 0 and sp:
            q = Quaternion((0, 0, 1), math.radians(sp)) @ q
        M = M @ rel @ q.to_matrix().to_4x4(); par = n
        out.append((S['A'] @ M.translation, S['A'] @ (M @ Vector((0, db[n].length, 0))), n))
    return out


def scoreL(S, f, angs, sp):
    pen = 0; gap = 0; w = 0; g = []
    for k, (a, b, n) in enumerate(chainL(S, f, angs, sp)):
        r = S['rad'][n]
        for s in (0.5, 1.0):
            p = a.lerp(b, s); loc, nr, i, d = S['T'].find_nearest(p)
            d = (d if (p - loc).dot(nr) >= 0 else -d) - r
            w = min(w, d)
            if d < -0.0015:
                pen += ((d + 0.0015) * 1000) ** 2 * 10
            if k >= 1:
                gap += max(0, d * 1000 - 1.0) ** 2; g.append(round(d * 1000, 1))
    return pen + gap, round(w * 1000, 1), g



def drop_replicas():
    """Remove the imported test replicas and their actions (else they leak into the exported glb)."""
    unpose()
    for n in ('RifleReal', 'PistolReal'):
        o = bpy.data.objects.get(n)
        if o:
            for ch in list(o.children_recursive):
                bpy.data.objects.remove(ch, do_unlink=True)
            bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if a.name.split('.')[0] in ('Blowback', 'Fire', 'Inspect', 'Reload', 'Selector', 'SightsFold'):
            bpy.data.actions.remove(a)


def export_v(kind, stem):
    with contextlib.redirect_stdout(io.StringIO()):
        drop_replicas()
        meshes, lods, info = B['build14'](kind)
        gi = B['grip_info14']()
        B['export_figure'](stem, info, extra=gi)
        B['save_blend'](stem)
    # session.py writes 1.73 m for every figure; the robot's optic stands taller: write the measured height
    unpose()
    top = max((o.matrix_world @ v.co).z for o in bpy.data.objects
              if o.type == 'MESH' and o.parent and o.parent.name == 'Rig' and 'LOD' not in o.name
              and not o.name.startswith(('MagProxy', 'RifleReal', 'PistolReal')) for v in o.data.vertices)
    fn = r'C:\Users\Billy\Documents\Airsoft models\%s_animations.json' % stem
    side = json.load(open(fn))
    side['heightMetres'] = round(top, 2)
    json.dump(side, open(fn, 'w'), indent=1)
    return gi


B['r3_drop'] = drop_replicas
B['export_v'] = export_v


B.update(dict(r3_show=show, pose_at=pose_at, unpose=unpose, r3_bake_one=bake_one, rebake=rebake, at=at, ftw=ftw,
              arm_in=arm_in, phase_metrics=phase_metrics, mag_tree=mag_tree, chainH=chainH, scoreMag=scoreMag,
              solve_mag=solve_mag, mag_proxy=mag_proxy, trig_setup=trig_setup, trig_chain=trig_chain,
              trig_pen=trig_pen, support_setup=support_setup, chainL=chainL, scoreL=scoreL))
print('session16 helpers ready')

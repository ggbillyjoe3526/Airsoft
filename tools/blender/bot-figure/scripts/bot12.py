# --- v4 first person body: the neck as its own piece, so the game can hide it with the head ---
# The player's own figure is the same model with the head (and on the robot the neck) hidden; the camera sits where the eyes were and
# looking down shows the vest, arms, legs and boots. The cut is level, just under the bottom of every head's
# balaclava, and capped, so nothing is open when the neck is hidden; with the head on, the cap sits inside the neck.
NECK_CUT = 1.475             # metres, final space
NECK_R = 0.14


def split_neck(body, z=NECK_CUT, r=NECK_R):
    neck = body.copy()
    neck.data = body.data.copy()
    neck.name = neck.data.name = 'Body_Neck'
    for cl in body.users_collection:
        cl.objects.link(neck)

    def near(v):
        return abs(v.co.x) < r and abs(v.co.y) < r

    def is_neck(f):
        c = f.calc_center_median()
        return c.z > z and abs(c.x) < r and abs(c.y) < r

    for ob in (body, neck):                     # cut exactly at z so the edge is level, not a zig-zag of faces
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        geom = [f for f in bm.faces if all(near(v) for v in f.verts)]
        geom = list({e for f in geom for e in f.edges}) + list({v for f in geom for v in f.verts}) + geom
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1), dist=1e-5)
        bm.to_mesh(ob.data)
        bm.free()

    for ob, keep in ((body, False), (neck, True)):
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if is_neck(f) != keep], context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        if not keep:
            rim = [e for e in bm.edges if e.is_boundary and all(v.co.z > z - 0.03 and abs(v.co.x) < r for v in e.verts)]
            caps = bmesh.ops.holes_fill(bm, edges=rim, sides=0)['faces']
            poked = bmesh.ops.poke(bm, faces=caps)        # a fan round a centre point raised into a soft dome,
            for v in poked['verts']:                       # so from above it reads as the top of the collar
                v.co.z += 0.010
            for f in poked['faces']:
                f.smooth = True
        bm.to_mesh(ob.data)
        bm.free()
    return neck


def _with_neck(fn, keep):
    """keep=False: every human head wears the balaclava, which covers the neck from 1.468 m up, so the neck above the
    cut is never seen and is dropped (the head alone is hidden in first person). keep=True: the robot's neck shows
    between its head and collar, so it stays as Body_Neck for the game to hide with the head."""
    def run():
        out, s = fn()
        body = next(o for o in out if o.name == 'Body')
        neck = split_neck(body)
        if keep:
            return out[:1] + [neck] + out[1:], s
        bpy.data.objects.remove(neck, do_unlink=True)
        return out, s
    run.neck = True
    return run


if not getattr(finalise, 'neck', False):
    finalise = _with_neck(finalise, False)
if not getattr(finalise_robot, 'neck', False):
    finalise_robot = _with_neck(finalise_robot, True)


# --- v4 simpler copies for distance: about 7,000 and 2,500 triangles for the whole figure ---
# Made after the weights, UVs and baked shade, so each copy keeps all three and moves with the same skeleton. The
# budget is for the biggest set the game can show (body, kit, radio, pack and the heaviest head). The far copy drops
# the radio, whose aerial is thinner than a pixel at that range.
LODS = (('LOD1', 7000, ()), ('LOD2', 2500, ('Kit_Radio',)))


def _decimated(o, name, ratio):
    c = o.copy()
    c.data = o.data.copy()
    c.name = c.data.name = name
    for cl in o.users_collection:
        cl.objects.link(c)
    rig = None
    for m in list(c.modifiers):
        if m.type == 'ARMATURE':
            rig = m.object
        c.modifiers.remove(m)
    d = c.modifiers.new('dec', 'DECIMATE')
    d.decimate_type = 'COLLAPSE'
    d.ratio = ratio
    d.use_collapse_triangulate = True
    for q in bpy.context.selected_objects:
        q.select_set(False)
    c.hide_set(False)
    c.select_set(True)
    bpy.context.view_layer.objects.active = c
    bpy.ops.object.modifier_apply(modifier='dec')
    bm = bmesh.new()                            # heavy collapsing leaves a few zero-area faces: clear them
    bm.from_mesh(c.data)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(c.data)
    bm.free()
    c.data.validate()
    if rig is not None:
        a = c.modifiers.new('Armature', 'ARMATURE')
        a.object = rig
    return c


def make_lods(out):
    """out: the full-detail meshes. Returns the copies, named <part>_LOD1 / _LOD2."""
    meshes = [o for o in out if o.type == 'MESH']
    heads = [o for o in meshes if o.name.startswith('Head_')]
    rest = [o for o in meshes if o not in heads]
    made = []
    for lvl, target, drop in LODS:
        parts = [o for o in rest if o.name not in drop]
        full = sum(tc(o) for o in parts) + max(tc(h) for h in heads)
        ratio = target * 0.97 / full
        level = [_decimated(o, '%s_%s' % (o.name, lvl), ratio) for o in parts + heads]
        got = sum(tc(o) for o in level if not o.name.startswith('Head_')) + max(
            tc(o) for o in level if o.name.startswith('Head_'))
        print(lvl, 'ratio', round(ratio, 3), 'triangles', got)
        made += level
    return made


def limit_weights(objs, most=4):
    """At most four bones per vertex (what glTF carries), the rest shared out so each vertex still sums to one."""
    for o in objs:
        names = {g.index: g.name for g in o.vertex_groups}
        for v in o.data.vertices:
            ws = sorted(((g.weight, g.group) for g in v.groups if g.weight > 0.0), reverse=True)
            keep, drop = ws[:most], ws[most:]
            total = sum(w for w, _ in keep) or 1.0
            for w, gi in drop:
                o.vertex_groups[names[gi]].remove([v.index])
            for w, gi in keep:
                o.vertex_groups[names[gi]].add([v.index], w / total, 'REPLACE')


# --- v4 heads: a boonie hat in place of the bump helmet ---
# The bump helmet and the high-cut helmet were both blue domes with goggles and a headset and could not be told apart
# beyond a few metres. A wide-brimmed boonie over the balaclava gives the third head its own outline from any side.
BOONIE_OFF = 0.018          # the crown stands this far off the head, clear of the balaclava and the goggle strap


def head_boonie():
    parts = head_balaclava()
    H = HEAD.view(0.0)
    segs = 24
    angles = [TAU * i / segs for i in range(segs)]
    zb = lambda a: 1.620 + 0.022 * math.cos(a - FRONT)        # lower at the back, up off the goggles at the front

    def ring(z_of, off, drop=0.0, out=0.0):
        pts = []
        for a in angles:
            z = z_of(a)
            p = H.point(z, a, off)
            c = H.at(z)
            radial = Vector((p.x, p.y - c[1], 0.0)).normalized()
            pts.append(p + radial * out - Vector((0, 0, drop)))
        return pts

    def lathe(name, rings, material, top=None):
        verts, faces = [], []
        for r in rings:
            verts += r
        for k in range(len(rings) - 1):
            for i in range(segs):
                j = (i + 1) % segs
                a, b = k * segs, (k + 1) * segs
                faces.append([a + i, a + j, b + j, b + i])
        if top is not None:
            verts.append(top)
            t = len(verts) - 1
            last = (len(rings) - 1) * segs
            faces += [[last + i, last + (i + 1) % segs, t] for i in range(segs)]
        return make(name, verts, faces, material, smooth=True, angle=70)

    crown_z = [0.0, 0.016, 0.040, 0.064, 0.086, 0.102, 0.112]
    top_z = 1.706                                # a low, soft crown, not a dome
    rings = [ring(lambda a, d=d: zb(a) + d * (top_z - zb(a)) / 0.112, BOONIE_OFF + 0.014 * (d / 0.112) ** 2)
             for d in crown_z]                  # the upper crown stands off the head, so the top is flat
    cy = H.at(top_z)[1]
    parts.append(lathe('BoonieCrown', rings, 'TeamColour', top=Vector((0, cy, top_z + 0.006))))
    band = [ring(zb, BOONIE_OFF + 0.0025), ring(lambda a: zb(a) + 0.024, BOONIE_OFF + 0.0025)]
    parts.append(lathe('BoonieBand', band, 'Gear'))
    brim = [ring(zb, BOONIE_OFF), ring(zb, BOONIE_OFF, drop=0.020, out=0.058),
            ring(zb, BOONIE_OFF, drop=0.025, out=0.058), ring(zb, BOONIE_OFF - 0.004, drop=0.004)]
    parts.append(lathe('BoonieBrim', brim, 'TeamColour'))
    return parts


HEADS_EXTRA = (('Head_Boonie', head_boonie), ('Head_Balaclava', head_balaclava), ('Head_Visor', head_visor))


# --- feet never go through the floor: after baking, lift any frame whose lowest boot point is under the ground ---
FLOOR_TOL = 0.002


def floor_fix(rig, clips, body='Body'):
    import numpy as np
    ob = bpy.data.objects[body]
    pb = rig.pose.bones['Hips']
    to_local = (rig.matrix_world.to_3x3() @ pb.bone.matrix_local.to_3x3()).inverted()
    muted = [(con, con.mute) for p in rig.pose.bones for con in p.constraints]
    for con, _ in muted:
        con.mute = True
    sc = bpy.context.scene
    keep = sc.frame_current
    worst = {}
    for clip in clips:
        act = bpy.data.actions[clip['name']]
        rig.animation_data.action = act
        for i in range(clip['frames'] + 1):
            sc.frame_set(i)
            dg = bpy.context.evaluated_depsgraph_get()
            ev = ob.evaluated_get(dg)
            me = ev.to_mesh()
            co = np.empty(len(me.vertices) * 3)
            me.vertices.foreach_get('co', co)
            ev.to_mesh_clear()
            m = ob.matrix_world
            low = float(np.min(co[2::3])) * m[2][2] + m[2][3]
            if low < -FLOOR_TOL:
                pb.location = pb.location + to_local @ Vector((0, 0, -low))
                pb.keyframe_insert('location', frame=i, group='Hips')
                worst[clip['name']] = min(worst.get(clip['name'], 0.0), low)
    rig.animation_data.action = None
    sc.frame_set(keep)
    for con, mu in muted:
        con.mute = mu
    print('floor fix', {k: round(v, 3) for k, v in worst.items()})


if not getattr(make_animations, 'v12', False):
    _make_animations_v11 = make_animations


def make_animations(rig, only=None):
    c, info = _make_animations_v11(rig, only)
    floor_fix(rig, [k for k in info if not k['upperBodyOnly']])
    return c, info


make_animations.v12 = True

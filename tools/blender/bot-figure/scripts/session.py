# --- session helpers: build, pose, render and export the bot figures (run after load.py) ---
# Kept as a file so a Blender restart only needs: exec load.py, then exec this.
import bpy, bmesh, json, math, os
from mathutils import Euler, Matrix, Vector

B = bpy.app.driver_namespace['bot']
O = bpy.data.objects
WORK = r'C:\Users\Billy\Documents\Airsoft models\work'
D = r'C:\Users\Billy\Documents\Airsoft models'


def patch(name, pairs, run=False):
    t = bpy.data.texts[name + '.py']
    s = t.as_string()
    for old, new in pairs:
        assert s.count(old) == 1, (name, old[:60], s.count(old))
        s = s.replace(old, new)
    t.clear()
    t.write(s)
    open(WORK + '\\' + name + '.py', 'w', encoding='utf-8').write(s)
    if run:
        exec(s, B)
    return len(s)


def reload(name, marker):
    src = open(WORK + '\\%s.py' % name, encoding='utf-8').read()
    if marker not in src:
        return 'STALE'
    t = bpy.data.texts.get(name + '.py') or bpy.data.texts.new(name + '.py')
    t.clear()
    t.write(src)
    exec(src, B)
    return 'ok'


def remake(only=None):
    rig = O['Rig']
    if rig.animation_data:
        rig.animation_data.action = None
    c, info = B['make_animations'](rig, only)
    B['C'] = c
    return info


# --- replicas: the real AEG and gas pistol, joined into one static mesh each, in replica space (X right, Y forward,
# Z up, origin as in the game's files) ---
REPLICA_FILES = (('RifleReal', 'aeg_rifle.glb'), ('PistolReal', 'gas_pistol.glb'))


def replicas():
    out = {}
    for name, fn in REPLICA_FILES:
        if name in O:
            out[name] = O[name]
            continue
        before = set(O.keys())
        bpy.ops.import_scene.gltf(filepath=os.path.join(D, fn))
        new = [n for n in O.keys() if n not in before]
        bm = bmesh.new()
        mats = []
        for n in new:
            o = O[n]
            if o.type != 'MESH' or o.parent is None or o.parent.type != 'ARMATURE':
                continue
            me = o.data.copy()
            me.transform(o.matrix_world)
            off = len(mats)
            mats += list(me.materials)
            for p in me.polygons:
                p.material_index += off
            bm.from_mesh(me)
            bpy.data.meshes.remove(me)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for m in mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        col = bpy.data.collections.get('Replicas') or bpy.data.collections.new('Replicas')
        if col.name not in bpy.context.scene.collection.children:
            bpy.context.scene.collection.children.link(col)
        col.objects.link(ob)
        for n in new:
            if n in O:
                bpy.data.objects.remove(O[n], do_unlink=True)
        out[name] = ob
    return out


def proxies():
    """Hang the real replicas on Grip_R, placed by REPLICA_ON_GRIP (bot13)."""
    rig = O['Rig']
    reps = replicas()
    for name, key in (('RifleReal', 'rifle'), ('PistolReal', 'pistol')):
        o = reps[name]
        o.parent = rig
        o.parent_type = 'BONE'
        o.parent_bone = 'Grip_R'
        o.matrix_parent_inverse = Matrix.Translation((0, -rig.data.bones['Grip_R'].length, 0))
        o.matrix_basis = B['REPLICA_ON_GRIP'][key] if 'REPLICA_ON_GRIP' in B else Matrix()


def visible(names, gun=None):
    for o in O:
        if o.type == 'MESH' and o.parent == O['Rig'] and o.name not in ('RifleReal', 'PistolReal'):
            on = o.name in names
            o.hide_set(not on)
            o.hide_render = not on
    for n, k in (('RifleReal', 'rifle'), ('PistolReal', 'pistol')):
        if n in O:
            on = gun == k
            O[n].hide_set(not on)
            O[n].hide_render = not on
    O['Rig'].hide_set(True)
    O['Rig'].hide_render = True


def pose(clip, frame, base=None):
    rig = O['Rig']
    for pb in rig.pose.bones:
        for con in pb.constraints:
            con.mute = True
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
    if base:
        rig.animation_data.action = bpy.data.actions[base]
        bpy.context.scene.frame_set(0)
        keep = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in rig.pose.bones}
        rig.animation_data.action = None
        for n, (l, q) in keep.items():
            rig.pose.bones[n].location = l
            rig.pose.bones[n].rotation_quaternion = q
    rig.animation_data.action = bpy.data.actions[clip] if clip else None
    bpy.context.scene.frame_set(frame)


def heads():
    return [o.name for o in O if o.type == 'MESH' and o.name.startswith('Head_') and 'LOD' not in o.name]


def rebuild_human():
    B['clear_scene']()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    out, s = B['finalise']()
    return out


def build_human_full():
    out = rebuild_human()
    rig = O['Rig']
    rig.data.pose_position = 'REST'
    meshes = [o for o in out if o.type == 'MESH']
    for o in meshes:
        o.hide_set(False)
    B['limit_weights'](meshes)
    groups = [([O['Body']], [O['Kit'], O['Head_HighCut']]), ([O['Kit']], [O['Body']])]
    if 'Kit_Radio' in O:
        groups.append(([O['Kit_Radio'], O['Kit_Pack']], [O['Body'], O['Kit']]))
    for h in heads():
        groups.append(([O[h]], [O['Body']]))
    B['dress'](meshes, groups)
    lods = B['make_lods'](meshes)
    B['limit_weights'](lods)
    rig.data.pose_position = 'POSE'
    info = remake()
    return meshes, lods, info


def build_robot_full():
    B['clear_scene']()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    out, s = B['finalise_robot']()
    rig = O['Rig']
    rig.data.pose_position = 'REST'
    meshes = [o for o in out if o.type == 'MESH']
    for o in meshes:
        o.hide_set(False)
    B['limit_weights'](meshes)
    hs = [o for o in meshes if o.name.startswith('Head_')]
    groups = [([O['Body'], O['Body_Neck']], hs[:1])]
    if 'Kit' in O:
        groups += [([O['Kit']], [O['Body']]), ([O['Kit_Radio'], O['Kit_Pack']], [O['Body'], O['Kit']])]
    for h in hs:
        groups.append(([h], [O['Body'], O['Body_Neck']]))
    B['dress'](meshes, groups)
    lods = B['make_lods'](meshes)
    B['limit_weights'](lods)
    rig.data.pose_position = 'POSE'
    info = remake()
    return meshes, lods, info


FIT = {'Switch': 'drawTime', 'Rifle_Reload': 'reloadTime', 'Pistol_Reload': 'reloadTime'}


def export_figure(stem, info, extra=None):
    rig = O['Rig']
    if rig.animation_data:
        rig.animation_data.action = None
    B['anim_cleanup'](rig)
    rig.hide_set(False)
    meshes = [o for o in O if o.type == 'MESH' and o.parent == rig and o.name not in ('RifleReal', 'PistolReal')]
    for q in bpy.context.selected_objects:
        q.select_set(False)
    for o in meshes + [rig]:
        o.hide_set(False)
        o.hide_viewport = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = os.path.join(D, stem + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_cameras=False, export_lights=False, export_skins=True, export_def_bones=False,
                              export_animations=True, export_animation_mode='ACTIONS', export_vertex_color='ACTIVE',
                              export_morph=False, export_draco_mesh_compression_enable=False, export_image_format='AUTO')
    for c in info:
        if c['name'] in FIT:
            c['fitTo'] = FIT[c['name']]
    side = {'figure': stem, 'heightMetres': 1.73, 'facing': '+Z', 'fps': B['FPS'], 'clips': info,
            'fitToNote': 'Clips with fitTo are time-scaled to that replica stat (e.g. AEG drawTime 0.45 s, pistol 0.3 s; '
                         'reloads 1.8 s and 1.2 s).',
            'parts': sorted(o.name for o in meshes), 'gripBones': ['Grip_R', 'Grip_L'],
            'firstPerson': {'hide': [o.name for o in meshes if o.name.startswith(('Head_', 'Body_Neck'))]},
            'teamMaterials': 'tint materials whose names start with Team'}
    if extra:
        side.update(extra)
    open(os.path.join(D, stem + '_animations.json'), 'w').write(json.dumps(side, indent=1))
    return path, os.path.getsize(path), len(meshes)


def save_blend(stem):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(D, stem + '.blend'), copy=True)


def dark_replicas():
    pass



# --- v5 pictures and export details ---
def grip_info():
    """What the game needs to hang the replicas on Grip_R exactly as the figure holds them."""
    rows = lambda m: [[round(x, 5) for x in r] for r in m]
    return {'replicaOnGrip': {k: rows(m) for k, m in B['REPLICA_ON_GRIP'].items()},
            'replicaOnGripNote': 'Row-major 4x4, Blender axes (X right, Y forward, Z up) in the Grip_R bone frame with its '
                                 'origin at the bone head: the replica glb (same axes, metres) placed by this matrix sits in '
                                 'the fist. The pistol clips (Pistol_*, Switch from 35%) hold the pistol, all others the AEG.'}


def _fp_render(name, deg, parts, gun, clip='Idle', frame=0, base=None):
    from mathutils import Euler
    visible(parts, gun)
    pose(clip, frame, base)
    cd = bpy.data.cameras.get('FPCam') or bpy.data.cameras.new('FPCam')
    fp = O.get('FPCam') or bpy.data.objects.new('FPCam', cd)
    if not fp.users_collection:
        bpy.data.collections['Studio'].objects.link(fp)
    fp.data.lens_unit = 'FOV'
    fp.data.angle = math.radians(90)
    fp.data.clip_start = 0.05
    rig = O['Rig']
    head = rig.matrix_world @ rig.pose.bones['Head'].head
    fp.location = (head.x, head.y - 0.09, 1.62 if clip != 'CrouchIdle' else 1.05)
    fp.rotation_euler = Euler((math.radians(90 - deg), 0, math.radians(180)), 'XYZ')
    sc = bpy.context.scene
    rc = sc.camera
    sc.camera = fp
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.render.filepath = os.path.join(D, 'bot_renders', name + '.jpg')
    bpy.ops.render.render(write_still=True)
    sc.camera = rc


def _hands_target():
    rig = O['Rig']
    a = rig.matrix_world @ rig.pose.bones['Grip_R'].head
    b = rig.matrix_world @ rig.pose.bones['Grip_L'].head
    return tuple((a + b) / 2)


def figure_shots(prefix, parts, head, fp_parts):
    shot2 = B['shot2']
    full = parts + [head]
    for name, (clip, fr, base), d, gun in (('front', ('Idle', 0, None), (0.75, -1, 0.18), 'rifle'),
                                            ('back', ('Idle', 0, None), (-0.8, 0.9, 0.22), 'rifle'),
                                            ('pistol', ('Pistol_Aim', 0, 'Idle'), (0.9, -1, 0.15), 'pistol')):
        visible(full, gun)
        pose(clip, fr, base)
        shot2('%s_%s' % (prefix, name), d, 5.0, (0, 0, 0.87), res=(900, 1200))
    for name, clip, fr, base, gun in (('run', 'Run_F', 4, None, 'rifle'), ('sprint', 'Sprint', 4, None, 'rifle'),
                                      ('aim', 'Rifle_Aim', 0, 'Idle', 'rifle'), ('aimup', 'Rifle_AimUp', 0, 'Idle', 'rifle'),
                                      ('kneel', 'CrouchIdle', 0, None, 'rifle'), ('crouchwalk', 'CrouchWalk', 3, None, 'rifle'),
                                      ('reload', 'Rifle_Reload', 20, 'Idle', 'rifle'), ('jump', 'Jump', 15, None, 'rifle'),
                                      ('hitcall', 'HitCall', 30, None, 'rifle')):
        visible(full, gun)
        pose(clip, fr, base)
        shot2('%s_pose_%s' % (prefix, name), (0.9, -1, 0.15), 5.2, (0, -0.1, 0.9), res=(700, 1000))
    # the hands on the replicas, close up from both sides
    for name, clip, base, gun in (('rifle', 'Rifle_Aim', 'Idle', 'rifle'), ('lowready', 'Idle', None, 'rifle'),
                                  ('pistol', 'Pistol_Aim', 'Idle', 'pistol')):
        visible(full, gun)
        pose(clip, 0, base)
        t = _hands_target()
        for side, d in (('right', (-1, -0.35, 0.25)), ('left', (1, -0.45, 0.3)), ('below', (0.2, -0.6, -0.8))):
            shot2('%s_hands_%s_%s' % (prefix, name, side), d, 0.75, t, lens=85, res=(1000, 1000))
    for sfx in ('', '_LOD1', '_LOD2'):
        ps = [n + sfx for n in full if (n + sfx) in O]
        visible(ps, 'rifle')
        pose('Idle', 0)
        shot2('%s_detail%s' % (prefix, sfx or '_full'), (0.75, -1, 0.18), 5.0, (0, 0, 0.87), res=(700, 1000))
    for deg in (55, 80):
        _fp_render('%s_firstperson_down%d' % (prefix, deg), deg, fp_parts, 'rifle')
    _fp_render('%s_firstperson_pistol_down55' % prefix, 55, fp_parts, 'pistol', 'Pistol_Aim', 0, 'Idle')


for _n in ('grip_info', 'figure_shots'):
    B[_n] = globals()[_n]


for _n in ('patch', 'reload', 'remake', 'replicas', 'proxies', 'visible', 'pose', 'heads', 'rebuild_human',
           'build_human_full', 'build_robot_full', 'export_figure', 'save_blend'):
    B[_n] = globals()[_n]
B['FIT'] = FIT
print('session helpers ready')

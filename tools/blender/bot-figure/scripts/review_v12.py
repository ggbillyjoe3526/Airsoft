"""Review pictures of the v12 human (the redesign, 13 Oct 2026): Eevee renders through the scene camera into
Documents/Airsoft models/bot_renders/hfr/, lit by the three Look suns turned to keep their angle to the camera. Not part
of the build: exec it after an export and B['proxies']() (the replicas on Grip_R)."""
import bpy, math, os
from mathutils import Vector

B = bpy.app.driver_namespace['bot']
O = bpy.data.objects
OUT = os.path.join(os.path.expanduser('~'), 'Documents', 'Airsoft models', 'bot_renders', 'hfr')
PARTS = ('Body', 'Kit', 'Kit_Radio', 'Kit_Pack')
LIGHTS = {'LookSun': 34.0, 'LookFill': -120.0, 'LookRim': 60.0}   # each sun's turn about Z with the camera in front


def dress(head='Head_HighCut', gun='rifle', parts=PARTS):
    """Show the body parts, one head (None: no head) and one replica (None: neither); hide the rest and the rig."""
    show = set(parts) | ({head} if head else set())
    for o in O:
        if o.type == 'MESH' and o.parent == O['Rig'] and o.name not in ('RifleReal', 'PistolReal'):
            on = o.name in show
            o.hide_set(not on)
            o.hide_render = not on
    for n, k in (('RifleReal', 'rifle'), ('PistolReal', 'pistol')):
        o = O.get(n)
        if o is None:
            continue
        on = gun == k
        for q in [o] + list(o.children_recursive):
            q.hide_viewport = False
            q.hide_set(not on)
            q.hide_render = not on
    O['Rig'].hide_set(True)
    O['Rig'].hide_render = True


def posed(clip, t=0.0, base=None):
    """The rig in `clip` at t seconds; `base` (a full-body clip at its first frame) holds the bones `clip` leaves."""
    rig = O['Rig']
    for pb in rig.pose.bones:
        for c in pb.constraints:
            c.mute = True
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
    bpy.context.scene.frame_set(int(round(t * bpy.context.scene.render.fps)))


def bone(name, tail=False):
    rig = O['Rig']
    pb = rig.pose.bones[name]
    return rig.matrix_world @ (pb.tail if tail else pb.head)


def shot(name, target, direction, dist, lens=70, res=(900, 1200)):
    """Render from `dist` metres along `direction` (from the target to the eye) into OUT/name.jpg."""
    sc = bpy.context.scene
    cam = sc.camera
    d = Vector(direction).normalized()
    cam.location = Vector(target) + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    cam.data.clip_start = 0.01
    az = math.degrees(math.atan2(d.x, -d.y))
    for n, z in LIGHTS.items():
        if n in O:
            O[n].rotation_euler.z = math.radians(z + az)
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 90
    os.makedirs(OUT, exist_ok=True)
    sc.render.filepath = os.path.join(OUT, name + '.jpg')
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


HEAD_C = Vector((0.0, -0.01, 1.60))
VIEWS = {'front': (0, -1, 0.12), 'three_quarter': (0.8, -1, 0.25), 'side': (1, 0, 0.1), 'back': (-0.5, 1, 0.2)}


def turnaround(head='Head_HighCut'):
    dress(head, 'rifle')
    posed('Rifle_Aim', 0.0, base='Idle')
    return [shot('turn_%s' % k, (0, 0, 0.92), v, 3.1, lens=60) for k, v in VIEWS.items()]


def heads():
    out = []
    posed('Idle', 0.0)
    for h in B['HEAD_ORDER']:
        dress(h, None)
        for k in ('front', 'three_quarter', 'side'):
            out.append(shot('head_%s_%s' % (h[5:], k), HEAD_C, VIEWS[k], 0.75, lens=85, res=(700, 700)))
    return out


POSES = [('rifle_aim', 'Rifle_Aim', 0.0, 'Idle', 'rifle'), ('rifle_crouch', 'Rifle_Aim', 0.0, 'CrouchIdle', 'rifle'),
         ('sprint', 'Sprint', 0.12, None, 'rifle'), ('reload', 'Rifle_Reload', 0.85, 'Idle', 'rifle'),
         ('pistol_aim', 'Pistol_Aim', 0.0, 'Idle', 'pistol'), ('hit_call', 'HitCall', 0.9, None, None)]


def poses(head='Head_HighCut'):
    out = []
    for name, clip, t, base, gun in POSES:
        dress(head, gun)
        posed(clip, t, base)
        hips = bone('Hips')
        out.append(shot('pose_%s' % name, (hips.x, hips.y, hips.z), (0.9, -1, 0.2), 3.0, lens=60, res=(800, 1100)))
    return out


def hands():
    """The hands on each replica, close: the firing hand from its side, the support hand from its side, from above and
    from in front, low."""
    out = []
    for gun, clip in (('rifle', 'Rifle_Aim'), ('pistol', 'Pistol_Aim')):
        dress('Head_HighCut', gun)
        posed(clip, 0.0, base='Idle')
        r, l = bone('Hand_R'), bone('Hand_L')
        mid = (r + l) / 2
        for k, (at, d) in {'right': (r, (-1.0, -0.35, 0.3)), 'left': (l, (1.0, -0.5, 0.35)),
                           'top': (mid, (0.1, -0.3, 1.0)), 'front': (mid, (0.25, -1.0, -0.15))}.items():
            out.append(shot('hands_%s_%s' % (gun, k), at, d, 0.75, lens=85, res=(900, 700)))
    return out


def first_person(deg=55.0):
    """Your own body as the game draws it when you look down: no head, the arms folded away (FIGURE_RIG.firstPerson),
    the camera at the eyes 0.17 m ahead of where the model stands."""
    rig = O['Rig']
    dress(None, None)
    posed('Rifle_Aim', 0.0, base='Idle')
    for n in ('UpperArm_L', 'UpperArm_R'):
        rig.pose.bones[n].scale = (1e-3, 1e-3, 1e-3)
    bpy.context.view_layer.update()
    eye = bone('Head') + Vector((0.0, -0.17 - 0.06, 0.08))
    fwd = Vector((0.0, -math.cos(math.radians(deg)), -math.sin(math.radians(deg))))
    sc = bpy.context.scene
    cam = sc.camera
    cam.data.lens_unit = 'FOV'
    cam.data.angle = math.radians(90)
    cam.location = eye
    cam.rotation_euler = fwd.to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start = 0.05
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.render.filepath = os.path.join(OUT, 'fp_look_down.jpg')
    bpy.ops.render.render(write_still=True)
    cam.data.lens_unit = 'MILLIMETERS'
    for n in ('UpperArm_L', 'UpperArm_R'):
        rig.pose.bones[n].scale = (1, 1, 1)
    return [sc.render.filepath]


B.update(dict(rv_dress=dress, rv_posed=posed, rv_shot=shot, rv_turnaround=turnaround, rv_heads=heads, rv_poses=poses,
              rv_hands=hands, rv_fp=first_person))
print('review_v12 ready')

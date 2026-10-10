
import bpy, math, os
from mathutils import Vector
OUT = os.path.join(os.path.expanduser('~'), 'Documents', 'Airsoft models', 'bot_renders')

def aim(cam, eye, target):
    cam.location = Vector(eye)
    d = Vector(target) - Vector(eye)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

def shot(name, direction, dist, target, lens=85, res=(1200, 1600)):
    sc = bpy.context.scene
    cam = sc.camera
    cam.data.lens = lens
    sc.render.resolution_x, sc.render.resolution_y = res
    d = Vector(direction).normalized()
    aim(cam, Vector(target) + d * dist, target)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + '.jpg')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path

def face_studio(direction):
    d = Vector(direction)
    th = math.atan2(d.x, -d.y)
    for n in ('Cyc', 'LightRig'):
        o = bpy.data.objects.get(n)
        if o:
            o.rotation_euler = (0, 0, th)

def shot2(name, direction, dist, target, lens=85, res=(1200, 1600)):
    face_studio(direction)
    return shot(name, direction, dist, target, lens, res)

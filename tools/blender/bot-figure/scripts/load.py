# Load the latest scripts from the work folder into Blender's text blocks (the master copies), then exec them all.
import bpy, os
W = r'C:\Users\Billy\Documents\Airsoft models\work'
for fn in sorted(os.listdir(W)):
    if fn.startswith('bot') and fn.endswith('.py'):
        t = bpy.data.texts.get(fn) or bpy.data.texts.new(fn)
        t.clear()
        t.write(open(os.path.join(W, fn), encoding='utf-8').read())
B = bpy.app.driver_namespace['bot']
B['ORDER'] = ['bot_helpers', 'bot_body', 'bot_kit', 'bot2', 'bot3', 'bot4', 'bot_main', 'bot5', 'bot_final', 'bot6',
              'bot7', 'bot8', 'bot9', 'bot10', 'bot11', 'bot12', 'bot13', 'bot_render']
for n in B['ORDER']:
    if n + '.py' in bpy.data.texts:
        exec(bpy.data.texts[n + '.py'].as_string(), B)
def clear_scene():
    for o in list(bpy.data.objects):
        if o.type in ('MESH', 'ARMATURE', 'EMPTY') and o.users_collection and o.users_collection[0].name != 'Studio':
            bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
B['clear_scene'] = clear_scene
def tc(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)
B['tc'] = tc
print('loaded', [n for n in B['ORDER'] if n + '.py' in bpy.data.texts])

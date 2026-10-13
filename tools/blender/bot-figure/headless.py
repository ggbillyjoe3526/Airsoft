"""Rebuilds a bot figure without Blender's window (IM8): pip's `bpy` module (bpy 5.0.0 on Python 3.11) runs the scripts
in load.py's order, with the Windows paths they were written with pointed at BF_HOME, then exports the figure with
session16's export_v (glb, sidecar and .blend in BF_HOME).
  BF_HOME=<folder> python tools/blender/bot-figure/headless.py human bot_human_v11
BF_HOME holds aeg_rifle.glb and gas_pistol.glb (the replicas the hands were fitted on) and work/mags.json (the
magazines' finger solves): in the project files under models/aeg-rifle/, models/gas-pistol/ and
models/bot-human/scripts-v4/. A build reproduces the approved clips to about 0.000001 but not its meshes to the bit, so
a re-made clip goes into the approved export with splice.mjs (README › Rebuild in the cloud)."""
import ast
import os
import re
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, 'scripts')
HOME = os.environ.get('BF_HOME') or sys.exit('set BF_HOME: the folder with the replicas, work/mags.json and the export')
WORK = os.path.join(HOME, 'work')
WIN_D = r'C:\Users\Billy\Documents\Airsoft models'
LOAD = open(os.path.join(SCRIPTS, 'load.py'), encoding='utf-8').read()
ORDER = ast.literal_eval(re.search(r"B\['ORDER'\] = (\[.*?\])", LOAD, re.S).group(1))


def src(name):
    """A script's text with its Windows folders pointed at BF_HOME."""
    s = open(os.path.join(SCRIPTS, name + '.py'), encoding='utf-8').read()
    s = s.replace("WORK + r'\\mags.json'", "os.path.join(WORK, 'mags.json')")
    s = s.replace("r'C:\\Users\\Billy\\Documents\\Airsoft models\\%s_animations.json' % stem",
                  "os.path.join(D, '%s_animations.json' % stem)")
    s = s.replace("WORK + '\\\\' + name + '.py'", "os.path.join(WORK, name + '.py')")
    s = s.replace("WORK + '\\\\%s.py' % name", "os.path.join(WORK, '%s.py' % name)")
    s = s.replace("r'" + WIN_D + "\\work'", repr(WORK))
    s = s.replace("r'" + WIN_D + "'", repr(HOME))
    s = s.replace("os.path.join(os.path.expanduser('~'), 'Documents', 'Airsoft models', 'bot_renders')",
                  repr(os.path.join(HOME, 'bot_renders')))
    if 'Billy' in s:
        sys.exit('%s.py has a Windows path this runner does not know: %s' % (name, [l for l in s.splitlines() if 'Billy' in l][0]))
    return s


def load():
    """Runs the scripts into Blender's driver namespace as load.py does, with load.py's helpers, then the sessions."""
    bpy.app.driver_namespace['bot'] = {}
    B = bpy.app.driver_namespace['bot']
    B['ORDER'] = ORDER
    for n in ORDER:
        exec(compile(src(n), n + '.py', 'exec'), B)

    def clear_scene():
        for o in list(bpy.data.objects):
            if o.type in ('MESH', 'ARMATURE', 'EMPTY') and o.users_collection and o.users_collection[0].name != 'Studio':
                bpy.data.objects.remove(o, do_unlink=True)
        for m in list(bpy.data.meshes):
            if m.users == 0:
                bpy.data.meshes.remove(m)
    B['clear_scene'] = clear_scene
    B['tc'] = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
    for n in ('session', 'session16'):
        exec(compile(src(n), n + '.py', 'exec'), B)
    return B


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('human', 'robot'):
        sys.exit('usage: BF_HOME=<folder> python headless.py human|robot <stem>')
    kind, stem = sys.argv[1:]
    t0 = time.time()
    B = load()
    if 'Rig' not in bpy.data.objects:          # export_v starts by putting the replicas down off a built figure
        B['build14'](kind)
        B['replicas']()
    B['export_v'](kind, stem)
    print('exported %s in %.0f s' % (os.path.join(HOME, stem), time.time() - t0), flush=True)

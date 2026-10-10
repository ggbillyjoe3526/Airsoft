
BODY_PREFIX = ('Shirt', 'Gaiter', 'Sleeve', 'Cuff', 'Armband', 'Palm', 'Knuckle', 'Finger', 'Thumb', 'Trousers',
               'BootShaft', 'BootFoot', 'Sole', 'Lugs', 'Laces', 'KneePad', 'KneeStrap', 'Cargo')
FIGURE_HEIGHT = 1.73


def finalise():
    """Build, set the height to 1.73 m (feet on the ground), join into Body, Kit and Head_HighCut, add UVs."""
    b, k, h = build_all()
    objs = b + k + h
    zs = [(o.matrix_world @ Vector(c)).z for o in objs for c in o.bound_box]
    lo, hi = min(zs), max(zs)
    s = FIGURE_HEIGHT / (hi - lo)
    m = Matrix.Scale(s, 4) @ Matrix.Translation((0, 0, -lo))
    for o in objs:
        o.data.transform(m)
    body = join('Body', b)
    kit_o = join('Kit', k)
    head_o = join('Head_HighCut', h)
    out = [body, kit_o, head_o]
    for o in out:
        for p in bpy.context.selected_objects:
            p.select_set(False)
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
        bpy.ops.object.mode_set(mode='OBJECT')
        # keep the material slots in one order on every object
    return out, s

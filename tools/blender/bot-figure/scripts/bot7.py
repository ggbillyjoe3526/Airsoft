# --- v4 kit mixes: the radio and a small assault pack are separate pieces the game can show or hide ---
# The plate carrier (Kit) is complete on its own: the back plate carries a full field of webbing. Kit_Radio is the
# radio pouch, radio and antenna on the left of the back; Kit_Pack is a zip-on assault pack over the back plate.
KIT_SPLIT = (('Kit_Radio', ('RadioPouch', 'Radio', 'Antenna')), ('Kit_Pack', ('Pack',)))
PACK_Z = (1.072, 1.338)
PACK_A = 0.46               # half the pack's width, as an angle round the back of the torso
PACK_OFF = 0.046            # sits on the back plate
PACK_DEPTH = 0.068

if not getattr(pouches, 'v7', False):
    _pouches_v2 = pouches


def _hit(tree, z, a, gap):
    """Where a ray from outside the back, aimed at the torso, first meets the given surfaces; lifted by gap."""
    n = TORSO.normal(z, a)
    o = TORSO.point(z, a, 0.0) + n * 0.4
    loc, nn, i, d = tree.ray_cast(o, -n, 0.6)
    if loc is None:
        return TORSO.point(z, a, 0.0) + n * gap, n
    return loc + n * gap, n


def strap_over(name, targets, z0, z1, a0, a1, nz, na, gap, thick, material):
    """A flat strap laid over the outside of other parts (a pack and its pocket), following their shape."""
    tree = bvh(targets)
    verts, faces = [], []
    grid = []
    for i in range(nz + 1):
        z = z0 + (z1 - z0) * i / nz
        row = []
        for j in range(na + 1):
            a = a0 + (a1 - a0) * j / na
            p, n = _hit(tree, z, a, gap)
            verts.append(p)
            verts.append(p + n * thick)
            row.append((len(verts) - 2, len(verts) - 1))
        grid.append(row)
    for i in range(nz):
        for j in range(na):
            q = (grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j])
            faces.append([v[1] for v in q])
            faces.append([v[0] for v in reversed(q)])
    border = [grid[0][j] for j in range(na + 1)] + [grid[i][na] for i in range(1, nz + 1)] + \
             [grid[nz][j] for j in range(na - 1, -1, -1)] + [grid[i][0] for i in range(nz - 1, 0, -1)]
    for k in range(len(border)):
        a, b = border[k], border[(k + 1) % len(border)]
        faces.append([a[0], b[0], b[1], a[1]])
    o = make(name, verts, faces, material, smooth=True, angle=40)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


def pack():
    """A small zip-on assault pack: a padded body with rounded edges, a front pocket, two compression straps with
    buckles and a team-coloured patch so the team still reads from behind."""
    z0, z1 = PACK_Z
    body = soft_panel('PackBody', TORSO, z0, z1, BACK - PACK_A, BACK + PACK_A, PACK_OFF, PACK_DEPTH, 6, 10, 'Gear',
                      rz=0.16, ra=0.16, edge=0.35, bulge=0.012)
    pocket = soft_panel('PackPocket', TORSO, z0 + 0.016, z0 + 0.130, BACK - 0.31, BACK + 0.31,
                        PACK_OFF + PACK_DEPTH - 0.006, 0.026, 3, 6, 'Gear', rz=0.25, ra=0.22, edge=0.4, bulge=0.004)
    parts = [body, pocket]
    tree = bvh([body, pocket])
    for nm, a in (('PackStrap_L', BACK - 0.22), ('PackStrap_R', BACK + 0.22)):
        parts.append(strap_over(nm, [body, pocket], z0 + 0.010, z1 - 0.012, a - 0.020, a + 0.020, 10, 1, 0.0008,
                                0.0025, 'Gear'))
        p, n = _hit(tree, 1.25, a, 0.0035)
        t = TORSO.tangent(1.25, a) if hasattr(TORSO, 'tangent') else surface_basis(TORSO, 1.25, a)[0]
        up = n.cross(t).normalized()
        if up.z < 0:
            up = -up
        t = up.cross(n).normalized()
        parts.append(rbox(nm.replace('Strap', 'Buckle'), p + n * 0.003, (0.026, 0.006, 0.022), 'Hard', bevel=0.002,
                          segs=1, basis=(t, n, up)))
    p, n = _hit(tree, 1.285, BACK, 0.0)
    t = surface_basis(TORSO, 1.285, BACK)[0]
    up = n.cross(t).normalized()
    if up.z < 0:
        up = -up
    t = up.cross(n).normalized()
    parts.append(rbox('PackPatch', p + n * 0.0035, (0.070, 0.004, 0.042), 'TeamColour', bevel=0.0015, segs=1,
                      basis=(t, n, up)))
    return parts


def pouches():
    parts = []
    for o in _pouches_v2():
        if o.name.split('.')[0] == 'Hydration':
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            parts.append(o)
    rows = []
    for k, z in enumerate((1.085, 1.125, 1.165)):
        rows.append(panel('WebC%d' % k, TORSO, z, z + 0.022, BACK - 0.40, BACK + 0.40, 0.0425, 0.003, 1, 6, 'Gear',
                          inset=0.0, inner=False))
    parts.append(join('WebbingBack', rows))
    return parts + pack()


pouches.v7 = True


def _split_kit(k):
    groups = {name: [] for name, _ in KIT_SPLIT}
    rest = []
    for o in k:
        base = o.name.split('.')[0]
        for name, prefixes in KIT_SPLIT:
            if base.startswith(prefixes):
                groups[name].append(o)
                break
        else:
            rest.append(o)
    return rest, groups


def finalise():
    """Build, set the height to 1.73 m (feet on the ground), join into Body, Kit, the optional kit pieces and one
    object per head, add UVs."""
    b, k, h = build_all()
    objs = b + k + h
    zs = [(o.matrix_world @ Vector(c)).z for o in objs for c in o.bound_box]
    lo, hi = min(zs), max(zs)
    s = FIGURE_HEIGHT / (hi - lo)
    m = Matrix.Scale(s, 4) @ Matrix.Translation((0, 0, -lo))
    hm = Matrix.Translation(HEAD_TOP) @ Matrix.Scale(HEAD_SCALE, 4) @ Matrix.Translation(-HEAD_TOP)
    heads = [('Head_HighCut', h)]
    for name, fn in HEADS_EXTRA:
        parts = fn()
        for o in parts:
            o.data.transform(hm)
        heads.append((name, parts))
    for o in objs + [o for _, ps in heads[1:] for o in ps]:
        o.data.transform(m)
    kit_rest, groups = _split_kit(k)
    out = [join('Body', b), join('Kit', kit_rest)] + [join(name, groups[name]) for name, _ in KIT_SPLIT]
    out += [join(name, ps) for name, ps in heads]
    for o in out:
        for p in bpy.context.selected_objects:
            p.select_set(False)
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
        bpy.ops.object.mode_set(mode='OBJECT')
    return out, s

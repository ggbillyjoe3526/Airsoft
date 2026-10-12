# --- v4 surfaces: world-scale UVs, small tiling textures and baked shade ---
# UV: every face is projected from its main axis at a fixed scale (1 UV unit = UV_METRES), so tiling textures keep the
# same size all over the figure and the game can lay a camo pattern on the same coordinates (scale it up there).
# Textures (512 px, tiling, made here in code): a canvas weave for Fabric, a ripstop grid for Gear and TeamColour, a
# fine stipple for Hard and Joint, worn paint chips for the robot's Shell (its team panels share the chips' bumps). Each colour texture is light grey, so the
# material's colour (and the game's team tint) multiplies over it. Shade: ambient occlusion baked into COLOR_0.
import numpy as np

UV_METRES = 0.25
TEX = 512
AO_FLOOR = 0.42             # the darkest the baked shade goes, so creases read without going black


def _periodic_noise(n, cutoff, seed):
    rng = np.random.default_rng(seed)
    f = np.fft.fft2(rng.standard_normal((n, n)))
    k = np.fft.fftfreq(n) * n
    kk = np.sqrt(k[:, None] ** 2 + k[None, :] ** 2)
    f *= np.exp(-(kk / cutoff) ** 2)
    out = np.real(np.fft.ifft2(f))
    out -= out.min()
    return out / max(out.max(), 1e-9)


def _normal_from_height(h, strength):
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5 * strength
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5 * strength
    nz = np.ones_like(h)
    ln = np.sqrt(dx * dx + dy * dy + nz)
    return np.stack([(-dx / ln) * 0.5 + 0.5, (-dy / ln) * 0.5 + 0.5, (nz / ln) * 0.5 + 0.5], axis=-1)


def _weave(n, threads, seed, flat=0.4):
    y, x = np.mgrid[0:n, 0:n] / n
    u, v = x * threads, y * threads
    fu, fv = u - np.floor(u), v - np.floor(v)
    wx = 1.0 - (2 * fu - 1) ** 2
    wy = 1.0 - (2 * fv - 1) ** 2
    hw = 0.5 + 0.5 * np.cos(np.pi * v + np.pi * np.floor(u))
    hy = 0.5 - 0.5 * np.cos(np.pi * u + np.pi * np.floor(v))
    h = np.maximum(wx * (flat + (1 - flat) * hw), wy * (flat + (1 - flat) * hy))
    return h + 0.15 * _periodic_noise(n, 40, seed)


def _image(name, rgb, non_color=False):
    n = rgb.shape[0]
    img = bpy.data.images.get(name)
    if img is None or img.size[0] != n:
        if img is not None:
            bpy.data.images.remove(img)
        img = bpy.data.images.new(name, n, n, alpha=False)
    img.colorspace_settings.name = 'Non-Color' if non_color else 'sRGB'     # before the pixels: it regenerates them
    img.file_format = 'PNG'
    px = np.ones((n, n, 4), dtype=np.float32)
    px[..., :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.update()
    img.pack()
    return img


def make_textures():
    n = TEX
    out = {}
    h = _weave(n, 128, 1)                          # about 2 mm threads: reads as cloth, not as knit
    lum = 0.92 + 0.08 * (h / h.max())
    out['Fabric'] = (_image('tex_canvas_col', np.repeat(lum[..., None], 3, -1)),
                     _image('tex_canvas_nrm', _normal_from_height(h, 0.22), True), None)
    base = _weave(n, 128, 2, flat=0.6) * 0.5
    y, x = np.mgrid[0:n, 0:n] / n
    g = 40
    line = lambda t: np.exp(-((t * g - np.round(t * g)) * 7) ** 2)
    rip = np.maximum(line(x), line(y))
    h = base + 0.15 * rip + 0.10 * _periodic_noise(n, 60, 3)    # the ripstop grid only just catches the light
    lum = 0.95 + 0.05 * (h / h.max())
    out['Gear'] = (_image('tex_ripstop_col', np.repeat(lum[..., None], 3, -1)),
                   _image('tex_ripstop_nrm', _normal_from_height(h, 0.3), True), None)
    out['TeamColour'] = (None, out['Gear'][1], None)
    st = _periodic_noise(n, 90, 4)
    out['Hard'] = (None, _image('tex_stipple_nrm', _normal_from_height(st, 1.6), True), None)
    out['Joint'] = out['Hard']
    # worn paint: chips of bare metal where a low-frequency mask and a ragged fine mask both run high
    m = _periodic_noise(n, 6, 5) * 0.7 + _periodic_noise(n, 40, 6) * 0.3
    chip = np.clip((m - 0.78) / 0.04, 0, 1)        # about half a percent of the surface: worn, not spotted
    scuff = _periodic_noise(n, 120, 7)
    lum = (1.0 - 0.06 * scuff) * (1 - chip) + 0.62 * chip
    rough = 0.42 + 0.10 * scuff
    rough = rough * (1 - chip) + 0.35 * chip
    metal = chip * 0.5
    orm = np.stack([np.ones_like(rough), rough, metal], -1)
    out['Shell'] = (_image('tex_paint_col', np.repeat(lum[..., None], 3, -1)),
                    _image('tex_paint_nrm', _normal_from_height(chip * 0.6 + scuff * 0.15, 3.0), True),
                    _image('tex_paint_orm', orm, True))
    out['TeamPaint'] = (None, out['Shell'][1], None)
    return out


def dress_material(m, tex):
    """Image × the material's colour into Base Color, optional packed roughness/metal, normal map, and the baked
    shade (the colour attribute) multiplied in."""
    col, nrm, orm = tex
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    for nd in list(nt.nodes):
        if nd.name.startswith('dress_'):
            nt.nodes.remove(nd)
    base = tuple(bsdf.inputs['Base Color'].default_value)
    uv = nt.nodes.new('ShaderNodeUVMap')
    uv.name = 'dress_uv'
    uv.uv_map = 'UVMap'
    if col is not None:
        it = nt.nodes.new('ShaderNodeTexImage')
        it.name = 'dress_col'
        it.image = col
        nt.links.new(uv.outputs['UV'], it.inputs['Vector'])
        mix = nt.nodes.new('ShaderNodeMix')
        mix.name = 'dress_mul'
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        sock = lambda socks, ident: next(x for x in socks if x.identifier == ident)
        sock(mix.inputs, 'Factor_Float').default_value = 1.0
        sock(mix.inputs, 'B_Color').default_value = base
        nt.links.new(it.outputs['Color'], sock(mix.inputs, 'A_Color'))
        nt.links.new(sock(mix.outputs, 'Result_Color'), bsdf.inputs['Base Color'])
    if nrm is not None:
        it = nt.nodes.new('ShaderNodeTexImage')
        it.name = 'dress_nrm'
        it.image = nrm
        nt.links.new(uv.outputs['UV'], it.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.name = 'dress_nmap'
        nm.uv_map = 'UVMap'
        nm.inputs['Strength'].default_value = 1.0
        nt.links.new(it.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if orm is not None:
        it = nt.nodes.new('ShaderNodeTexImage')
        it.name = 'dress_orm'
        it.image = orm
        nt.links.new(uv.outputs['UV'], it.inputs['Vector'])
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        sep.name = 'dress_sep'
        nt.links.new(it.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])


def box_uv(o, metres=UV_METRES):
    """Project each face from the axis it faces most, 1 UV unit per `metres`."""
    me = o.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    uvl = me.uv_layers.new(name='UVMap')
    co = [v.co for v in me.vertices]
    s = 1.0 / metres
    for p in me.polygons:
        nx, ny, nz = (abs(c) for c in p.normal)
        for li in p.loop_indices:
            c = co[me.loops[li].vertex_index]
            if nz >= nx and nz >= ny:
                uv = (c.x * s, c.y * s * (1 if p.normal.z > 0 else -1))
            elif nx >= ny:
                uv = (c.y * s * (-1 if p.normal.x > 0 else 1), c.z * s)
            else:
                uv = (c.x * s * (1 if p.normal.y > 0 else -1), c.z * s)
            uvl.data[li].uv = uv


def bake_shade(objs, occluders=(), samples=48, distance=0.12):
    """Ambient occlusion into a colour attribute per object (COLOR_0 in the glb). Each object is baked with only
    itself and the given occluders visible to the renderer."""
    sc = bpy.context.scene
    old = sc.render.engine
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.device = 'CPU'
    if sc.world is None:
        sc.world = bpy.data.worlds.new('World')
    sc.world.light_settings.distance = distance
    every = [o for o in sc.objects if o.type == 'MESH']
    keep = set(objs) | set(occluders)
    hidden = {o.name: o.hide_render for o in every}
    for o in every:
        o.hide_render = o not in keep
    for o in objs:
        o.hide_set(False)                   # a hidden object cannot be selected for the bake
        me = o.data
        for a in list(me.color_attributes):
            me.color_attributes.remove(a)
        attr = me.color_attributes.new('Shade', 'FLOAT_COLOR', 'POINT')
        me.color_attributes.active_color = attr
        for q in bpy.context.selected_objects:
            q.select_set(False)
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        for d in attr.data:
            g = AO_FLOOR + (1 - AO_FLOOR) * d.color[0]
            d.color = (g, g, g, 1.0)
    for o in every:
        o.hide_render = hidden[o.name]
    sc.render.engine = old


def dress(out, shade_groups):
    """UVs on every object, textures on every material, shade baked per group: (objects, occluders)."""
    tex = make_textures()
    for o in out:
        box_uv(o)
    seen = set()
    for o in out:
        for m in o.data.materials:
            key = m.name.split('.')[0]
            if m.name in seen or key not in tex:
                continue
            seen.add(m.name)
            dress_material(m, tex[key])
    for objs, occ in shade_groups:
        bake_shade(objs, occ)

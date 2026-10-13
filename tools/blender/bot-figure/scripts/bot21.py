# --- v12 (Dev 6): the realistic human's surfaces, baked into one texture atlas -------------------------------------
# Every part is modelled in a source surface (S_Camo, S_Nylon, ...: bot20). Each source surface here is a procedural
# Cycles material: its colour (an original multi-terrain camouflage, coyote nylon, MOLLE webbing, steel mesh ...),
# roughness, metal and relief (cloth folds where the joints bend, rounded edges on the hard kit, webbing, stitching).
# dress_v12 unwraps the whole figure into one atlas, bakes those into three images (colour with the ambient
# occlusion multiplied in, a tangent-space normal map and roughness/metal), and leaves three materials the game
# draws: Outfit, TeamColour (the same atlas, tinted with the team's colour: armbands and ID patches) and Lens.
#
# Bakes run in Cycles on the CPU (the scene's own setting; the owner's GPU preferences are left alone).
import bpy, bmesh, math, os, re
import numpy as np
from mathutils import Vector, Matrix
from bpy_extras import bmesh_utils

B = bpy.app.driver_namespace['bot']

ATLAS = 2048                 # colour and normal; roughness/metal is half that
ORM_SIZE = 1024
ATLAS_AO_FLOOR = 0.5               # the darkest the baked occlusion makes the colour
AO_DISTANCE = 0.14
BAKE_MARGIN = 8              # pixels the bakes bleed past each island
UV_MARGIN = 0.0045           # between islands, as a share of the atlas
# texel density weights: what the player sees close up gets more of the atlas (the first-person arms and gloves)
UV_WEIGHT = {'glove': 2.4, 'arm': 1.45, 'kit': 1.15, 'head': 0.8, 'leg': 0.85, 'boot': 0.8}   # four heads share
TEAM_SURFACES = ('S_Team',)
LENS_SURFACES = ('S_Lens',)
DOCS = r'C:\Users\Billy\Documents\Airsoft models'        # the .blend, the exports and the atlas files

# what the kit is made of (v11's parts, re-dressed)
KIT_REMAT = (('PlateFront', 'Molle'), ('PlateBack', 'Molle'), ('Cummer', 'Laser'), ('Strap', 'Nylon'),
             ('MagPouch', 'Nylon'), ('MagTab', 'Elastic'), ('Mag', 'Mag'), ('AdminPouch', 'Nylon'),
             ('TeamPatch', 'Team'), ('RadioPouch', 'Nylon'), ('Radio', 'Mag'), ('Antenna', 'Rubber'),
             ('DragHandle', 'Webbing'), ('WebbingBack', 'Webbing'), ('Webbing', 'Webbing'), ('PackBuckle', 'Polymer'),
             ('PackPatch', 'Team'), ('PackStrap', 'Webbing'), ('Pack', 'Nylon'), ('Belt', 'Nylon'),
             ('Buckle', 'Metal'), ('HolsterLoop', 'Polymer'), ('HolsterGuard', 'Polymer'), ('Holster', 'Polymer'),
             ('PistolGrip', 'Mag'), ('DumpPouch', 'Nylon'))
TEAM_CARRIER = True          # the plate carrier and cummerbund in the team colour, as v11 (William, 13 Oct: easier to read)


def kit_v12(kit):
    remat(kit, KIT_REMAT)
    if TEAM_CARRIER:
        remat([o for o in kit if o.name.startswith(('PlateFront', 'PlateBack', 'Cummer', 'Strap'))],
              (('', 'Team'),))
    return kit


# --- per-vertex cloth data: where it folds, and how far along its limb each point is -------------------------------
def _seg_near(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length, t


def _chain(p, pts):
    """Distance from p to the polyline pts, and how far along it (metres) its nearest point lies."""
    best, along, run = 1e9, 0.0, 0.0
    for i in range(len(pts) - 1):
        d, t = _seg_near(p, pts[i], pts[i + 1])
        L = (pts[i + 1] - pts[i]).length
        if d < best:
            best, along = d, run + t * L
        run += L
    return best, along


def _gauss(x, s):
    return math.exp(-0.5 * (x / s) ** 2)


def cloth_attrs(parts):
    """'Along' (metres down the limb) and 'Fold' (0..1, how much the cloth bunches there) on every part."""
    bn = _bones()
    arm = {s: [bn['UpperArm_' + s][0], bn['Forearm_' + s][0], bn['Hand_' + s][0], bn['Hand_' + s][1]] for s in 'LR'}
    leg = {s: [bn['Thigh_' + s][0], bn['Shin_' + s][0], bn['Foot_' + s][0]] for s in 'LR'}
    Lua = (bn['UpperArm_L'][1] - bn['UpperArm_L'][0]).length
    Lfa = (bn['Forearm_L'][1] - bn['Forearm_L'][0]).length
    Lth = (bn['Thigh_L'][1] - bn['Thigh_L'][0]).length
    crotch = Vector((0.0, 0.004, 0.865))
    for o in parts:
        me = o.data
        for nm in ('Along', 'Fold'):
            a = me.attributes.get(nm)
            if a is not None:
                me.attributes.remove(a)
        me.attributes.new('Along', 'FLOAT', 'POINT')
        me.attributes.new('Fold', 'FLOAT', 'POINT')
        A, Fd = me.attributes['Along'], me.attributes['Fold']     # (adding one can move the other's storage)
        nm = o.name
        side = _side(nm) or 'L'
        for v in me.vertices:
            p = v.co
            along, fold = p.z, 0.0
            if nm.startswith(('Sleeve', 'Glove', 'Armband', 'CuffStrap', 'Knuckle')):
                d, along = _chain(p, arm[side])
                if nm.startswith('Sleeve'):
                    fold = 0.22 + 0.85 * _gauss(along - Lua, 0.065) + 0.7 * _gauss(along - (Lua + Lfa - 0.035), 0.04)
                    fold += 0.35 * _gauss(along - 0.02, 0.05)
            elif nm.startswith('Trousers'):
                dl, al = _chain(p, leg['L'])
                dr, ar = _chain(p, leg['R'])
                along = al if dl < dr else ar
                fold = (0.2 + 0.8 * _gauss(along - Lth, 0.075) + 0.65 * _gauss((p - crotch).length, 0.075)
                        + 0.45 * _gauss(p.z - 1.0, 0.045) + 1.0 * smoothstep(0.33, 0.13, p.z))
            elif nm.startswith(('Shirt', 'Gaiter')):
                fold = 0.55 if nm.startswith('Gaiter') else 0.3
            A.data[v.index].value = along
            Fd.data[v.index].value = min(1.2, fold)
    return parts


PART_DATA = ('Along', 'Fold', 'Dors', 'Seg')      # per-vertex data the surfaces are drawn by (dropped before export)


def uv_layers(parts):
    """Every part with the same two UV maps in the same order (joining matches them by place): 'UVMap', the atlas
    unwrap to come, then 'Detail'."""
    for o in parts:
        me = o.data
        keep = {}
        for l in me.uv_layers:
            if l.name == 'Detail':
                keep['Detail'] = [d.uv.copy() for d in l.data]
        while me.uv_layers:
            me.uv_layers.remove(me.uv_layers[0])
        me.uv_layers.new(name='UVMap')
        d = me.uv_layers.new(name='Detail')
        if 'Detail' in keep:
            for i, uv in enumerate(keep['Detail']):
                d.data[i].uv = uv
        else:                                    # box-projected, in metres
            co = [v.co for v in me.vertices]
            for p in me.polygons:
                nx, ny, nz = (abs(c) for c in p.normal)
                for li in p.loop_indices:
                    c = co[me.loops[li].vertex_index]
                    d.data[li].uv = ((c.x, c.y) if nz >= nx and nz >= ny else (c.y, c.z) if nx >= ny else (c.x, c.z))
        me.uv_layers.active = me.uv_layers['UVMap']
        me.uv_layers['UVMap'].active_render = True
        for nm in PART_DATA:                     # joining keeps only what every part has: give each part all of it
            if me.attributes.get(nm) is None:
                me.attributes.new(nm, 'FLOAT', 'POINT')
    return parts


# --- the source surfaces -------------------------------------------------------------------------------------------
class G:
    """A small node-graph writer for one material."""

    def __init__(self, m):
        m.use_nodes = True
        self.m = m
        self.nt = m.node_tree
        self.nt.nodes.clear()
        self.out = self.n('ShaderNodeOutputMaterial')
        self.bsdf = self.n('ShaderNodeBsdfPrincipled')
        self.link(self.bsdf.outputs['BSDF'], self.out.inputs['Surface'])
        tc = self.n('ShaderNodeTexCoord')
        self.P = tc.outputs['Object']
        uv = self.n('ShaderNodeUVMap')
        uv.uv_map = 'Detail'
        self.D = uv.outputs['UV']
        sep = self.n('ShaderNodeSeparateXYZ')
        self.link(self.P, sep.inputs['Vector'])
        self.X, self.Y, self.Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
        sd = self.n('ShaderNodeSeparateXYZ')
        self.link(self.D, sd.inputs['Vector'])
        self.U, self.V = sd.outputs['X'], sd.outputs['Y']

    def n(self, kind, **props):
        nd = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(nd, k, v)
        return nd

    def link(self, a, b):
        self.nt.links.new(a, b)

    def put(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.link(v, sock)
            return
        if isinstance(v, tuple) and len(v) == 3:
            try:
                if len(sock.default_value) == 4:
                    v = (*v, 1.0)
            except TypeError:
                pass
        sock.default_value = v

    def attr(self, name):
        a = self.n('ShaderNodeAttribute', attribute_name=name, attribute_type='GEOMETRY')
        return a.outputs['Fac']

    def math(self, op, a, b=0.0, c=0.0, clamp=False):
        nd = self.n('ShaderNodeMath', operation=op, use_clamp=clamp)
        self.put(nd.inputs[0], a)
        self.put(nd.inputs[1], b)
        self.put(nd.inputs[2], c)
        return nd.outputs[0]

    def vec(self, x, y, z):
        nd = self.n('ShaderNodeCombineXYZ')
        for s, v in zip(nd.inputs, (x, y, z)):
            self.put(s, v)
        return nd.outputs[0]

    def vmath(self, op, a, b=None, scale=None):
        nd = self.n('ShaderNodeVectorMath', operation=op)
        self.put(nd.inputs[0], a)
        if b is not None:
            self.put(nd.inputs[1], b)
        if scale is not None:
            self.put(nd.inputs['Scale'], scale)
        return nd.outputs[0]

    def noise(self, vec, scale, detail=2.0, rough=0.5, distortion=0.0, offset=(0, 0, 0), color=False):
        nd = self.n('ShaderNodeTexNoise')
        v = vec if offset == (0, 0, 0) else self.vmath('ADD', vec, offset)
        self.put(nd.inputs['Vector'], v)
        nd.inputs['Scale'].default_value = scale
        nd.inputs['Detail'].default_value = detail
        nd.inputs['Roughness'].default_value = rough
        nd.inputs['Distortion'].default_value = distortion
        return nd.outputs['Color' if color else 'Fac']

    def voronoi_edge(self, vec, scale, rnd=1.0):
        nd = self.n('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE')
        self.put(nd.inputs['Vector'], vec)
        nd.inputs['Scale'].default_value = scale
        nd.inputs['Randomness'].default_value = rnd
        return nd.outputs['Distance']

    def step(self, x, a, b):
        """smoothstep from a to b (a > b runs downward)."""
        nd = self.n('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP', clamp=True)
        self.put(nd.inputs['Value'], x)
        if a <= b:
            nd.inputs['From Min'].default_value, nd.inputs['From Max'].default_value = a, b
            nd.inputs['To Min'].default_value, nd.inputs['To Max'].default_value = 0.0, 1.0
        else:
            nd.inputs['From Min'].default_value, nd.inputs['From Max'].default_value = b, a
            nd.inputs['To Min'].default_value, nd.inputs['To Max'].default_value = 1.0, 0.0
        return nd.outputs['Result']

    def mixc(self, f, a, b):
        nd = self.n('ShaderNodeMix', data_type='RGBA', blend_type='MIX', clamp_factor=True)
        sk = lambda socks, ident: next(x for x in socks if x.identifier == ident)
        self.put(sk(nd.inputs, 'Factor_Float'), f)
        self.put(sk(nd.inputs, 'A_Color'), a if isinstance(a, bpy.types.NodeSocket) else (*a, 1.0))
        self.put(sk(nd.inputs, 'B_Color'), b if isinstance(b, bpy.types.NodeSocket) else (*b, 1.0))
        return sk(nd.outputs, 'Result_Color')

    def mulc(self, a, f):
        """colour a scaled by the float f."""
        nd = self.n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', clamp_factor=True)
        sk = lambda socks, ident: next(x for x in socks if x.identifier == ident)
        sk(nd.inputs, 'Factor_Float').default_value = 1.0
        self.put(sk(nd.inputs, 'A_Color'), a)
        g = self.n('ShaderNodeCombineColor')
        for s in g.inputs[:3]:
            self.put(s, f)
        self.link(g.outputs[0], sk(nd.inputs, 'B_Color'))
        return sk(nd.outputs, 'Result_Color')

    def finish(self, colour, rough, metal=0.0, height=None, height_dist=0.004, bevel=0.0):
        """Wire the surface: named terminals (T_col, T_rough, T_metal) that the bakes read, the bump and the edge
        rounding into the shader's normal."""
        tcol = self.n('ShaderNodeMix', data_type='RGBA', name='T_col', label='T_col')
        sk = lambda socks, ident: next(x for x in socks if x.identifier == ident)
        sk(tcol.inputs, 'Factor_Float').default_value = 0.0
        self.put(sk(tcol.inputs, 'A_Color'), colour if isinstance(colour, bpy.types.NodeSocket) else (*colour, 1.0))
        col_out = sk(tcol.outputs, 'Result_Color')
        tr = self.n('ShaderNodeMath', operation='ADD', name='T_rough', label='T_rough', use_clamp=True)
        self.put(tr.inputs[0], rough)
        tm = self.n('ShaderNodeMath', operation='ADD', name='T_metal', label='T_metal', use_clamp=True)
        self.put(tm.inputs[0], metal)
        self.link(col_out, self.bsdf.inputs['Base Color'])
        self.link(tr.outputs[0], self.bsdf.inputs['Roughness'])
        self.link(tm.outputs[0], self.bsdf.inputs['Metallic'])
        nrm = None
        if bevel:
            bv = self.n('ShaderNodeBevel', samples=8)
            bv.inputs['Radius'].default_value = bevel
            nrm = bv.outputs['Normal']
        if height is not None:
            bp = self.n('ShaderNodeBump')
            bp.inputs['Strength'].default_value = 1.0
            bp.inputs['Distance'].default_value = height_dist
            self.link(height, bp.inputs['Height'])
            if nrm is not None:
                self.link(nrm, bp.inputs['Normal'])
            nrm = bp.outputs['Normal']
        if nrm is not None:
            self.link(nrm, self.bsdf.inputs['Normal'])
        self.m['surface'] = 1
        return self.m


def lin(h):
    return tuple(srgb(h))


def _dust(g, col, low=0.32, high=0.05, amount=0.55, tint=0xa39577):
    """Dust from the field: up the boots and the trouser bottoms, patchy."""
    f = g.math('MULTIPLY', g.step(g.Z, low, high), g.math('ADD', 0.35, g.noise(g.P, 9.0, 3.0, 0.6)))
    return g.mixc(g.math('MULTIPLY', f, amount), col, lin(tint))


def _cloth_height(g, drape=1.0, folds=1.0):
    """Cloth relief: soft drape all over, sharp compression folds where 'Fold' says (rings across the limb), and a
    fine weave."""
    fold = g.attr('Fold')
    along = g.attr('Along')
    v = g.vec(g.math('MULTIPLY', along, 26.0), g.math('MULTIPLY', g.X, 4.0),
              g.math('ADD', g.math('MULTIPLY', g.Y, 4.0), g.math('MULTIPLY', g.Z, 1.5)))
    n = g.noise(v, 1.0, 3.0, 0.55, distortion=0.6)
    ridge = g.math('POWER', g.math('SUBTRACT', 1.0, g.math('ABSOLUTE', g.math('SUBTRACT', g.math('MULTIPLY', n, 2.0),
                                                                                1.0))), 2.5)
    h = g.math('MULTIPLY', g.math('MULTIPLY', ridge, fold), folds)
    h = g.math('ADD', h, g.math('MULTIPLY', g.noise(g.P, 11.0, 3.0, 0.5), 0.45 * drape))
    weave = g.noise(g.P, 700.0, 0.0, 0.5)
    return g.math('ADD', h, g.math('MULTIPLY', weave, 0.05))


def _ridge(g, vec, scale, offset, lo, hi):
    """Thin wandering lines: where a noise crosses its middle (1 on the line, 0 away from it)."""
    n = g.noise(vec, scale, 2.0, 0.5, offset=offset)
    r = g.math('SUBTRACT', 1.0, g.math('ABSOLUTE', g.math('SUBTRACT', g.math('MULTIPLY', n, 2.0), 1.0)))
    return g.step(r, lo, hi)


def surf_camo(m):
    """An original multi-terrain camouflage: a khaki-to-sage ground, olive and brown blotches, a few pale lights and
    thin dark branches."""
    g = G(m)
    warp = g.vmath('ADD', g.P, g.vmath('SCALE', g.vmath('SUBTRACT', g.noise(g.P, 6.0, 2.0, 0.5, color=True),
                                                        (0.5, 0.5, 0.5)), scale=0.05))
    ground = g.mixc(g.noise(warp, 3.0, 1.0), lin(0x8a7d5b), lin(0x77775a))
    olive = g.step(g.noise(warp, 9.0, 3.0, 0.55, offset=(3.1, 0.2, 7.7)), 0.55, 0.575)
    col = g.mixc(olive, ground, lin(0x5a5c36))
    brown = g.step(g.noise(warp, 12.0, 3.0, 0.55, offset=(11.3, 5.2, 1.9)), 0.585, 0.605)
    col = g.mixc(brown, col, lin(0x6b4e36))
    light = g.step(g.noise(warp, 11.0, 3.0, 0.6, offset=(21.7, 13.1, 4.4)), 0.375, 0.355)
    col = g.mixc(light, col, lin(0xa89b78))
    br = _ridge(g, warp, 7.0, (5.0, 9.0, 2.0), 0.93, 0.965)
    br = g.math('MULTIPLY', br, g.step(g.noise(warp, 4.0, 2.0, 0.5, offset=(1.0, 4.0, 8.0)), 0.48, 0.56))
    col = g.mixc(br, col, lin(0x3a2e22))
    tw = _ridge(g, warp, 16.0, (2.0, 7.0, 1.0), 0.95, 0.975)
    tw = g.math('MULTIPLY', tw, g.step(g.noise(warp, 6.0, 2.0, 0.5, offset=(8.0, 1.0, 6.0)), 0.52, 0.6))
    col = g.mixc(tw, col, lin(0x4a3b2a))
    # the cloth's own shading: the weave and wear lighten it a touch in places
    col = g.mulc(col, g.math('ADD', 0.9, g.math('MULTIPLY', g.noise(g.P, 45.0, 2.0, 0.6), 0.2)))
    col = _dust(g, col, amount=0.4)
    return g.finish(col, 0.9, 0.0, _cloth_height(g), height_dist=0.0045)


def _plain(m, hexcol, rough, metal=0.0, mottle=0.12, mscale=30.0, grain=500.0, grain_amt=0.3, bevel=0.0,
           hdist=0.0015, dust=0.0, extra=None):
    g = G(m)
    col = g.mulc(lin(hexcol), g.math('ADD', 1.0 - mottle * 0.5, g.math('MULTIPLY', g.noise(g.P, mscale, 2.0, 0.6),
                                                                         mottle)))
    if dust:
        col = _dust(g, col, amount=dust)
    h = g.math('MULTIPLY', g.noise(g.P, grain, 1.0, 0.5), grain_amt)
    if extra:
        col, h = extra(g, col, h)
    return g.finish(col, rough, metal, h, height_dist=hdist, bevel=bevel)


def surf_jersey(m):
    g = G(m)
    col = g.mulc(lin(0x6f6a55), g.math('ADD', 0.94, g.math('MULTIPLY', g.noise(g.P, 30.0, 2.0, 0.6), 0.12)))
    return g.finish(col, 0.92, 0.0, _cloth_height(g, drape=0.8, folds=0.8), height_dist=0.004)


def _molle(g, col, h):
    """MOLLE webbing on a panel: 25 mm bands every 38 mm down it, bar-tacked every 38 mm across."""
    z = g.math('FRACT', g.math('DIVIDE', g.Z, 0.0381))
    band = g.math('MULTIPLY', g.step(z, 0.02, 0.07), g.step(z, 0.66, 0.6))
    x = g.math('FRACT', g.math('DIVIDE', g.math('ADD', g.X, 0.0095), 0.0381))
    tack = g.math('MULTIPLY', g.step(x, 0.03, 0.0), band)
    tack = g.math('MAXIMUM', tack, g.math('MULTIPLY', g.step(x, 0.97, 1.0), band))
    col = g.mixc(g.math('MULTIPLY', band, 0.35), col, lin(0x6a5940))
    col = g.mixc(g.math('MULTIPLY', tack, 0.6), col, lin(0x3b3124))
    edge = g.math('MULTIPLY', g.math('SUBTRACT', 1.0, band), 0.6)
    col = g.mulc(col, g.math('SUBTRACT', 1.0, g.math('MULTIPLY', edge, 0.25)))
    h = g.math('ADD', h, g.math('MULTIPLY', band, 1.0))
    h = g.math('SUBTRACT', h, g.math('MULTIPLY', tack, 0.4))
    return col, h


def _laser(g, col, h):
    """A laser-cut cummerbund: rows of slots."""
    z = g.math('FRACT', g.math('DIVIDE', g.Z, 0.0381))
    y = g.math('FRACT', g.math('DIVIDE', g.Y, 0.034))
    slot = g.math('MULTIPLY', g.math('MULTIPLY', g.step(z, 0.18, 0.24), g.step(z, 0.5, 0.44)),
                  g.math('MULTIPLY', g.step(y, 0.08, 0.14), g.step(y, 0.84, 0.78)))
    col = g.mixc(g.math('MULTIPLY', slot, 0.8), col, lin(0x231d15))
    return col, g.math('SUBTRACT', h, slot)


def _mesh_holes(g, col, h):
    """The mask's perforated steel: round holes on a 4 mm staggered grid (dark: the face is behind it)."""
    p = 0.0052
    row = g.math('FLOOR', g.math('DIVIDE', g.V, p * 0.866))
    u = g.math('ADD', g.U, g.math('MULTIPLY', g.math('MODULO', row, 2.0), p * 0.5))
    fu = g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', u, p)), 0.5)
    fv = g.math('SUBTRACT', g.math('FRACT', g.math('DIVIDE', g.V, p * 0.866)), 0.5)
    r = g.math('SQRT', g.math('ADD', g.math('MULTIPLY', fu, fu), g.math('MULTIPLY', fv, fv)))
    hole = g.step(r, 0.4, 0.3)
    col = g.mixc(g.math('MULTIPLY', hole, 0.92), col, lin(0x070707))
    return col, g.math('SUBTRACT', h, hole)


def _loop(g, col, h):
    fuzz = g.noise(g.P, 900.0, 2.0, 0.7)
    return col, g.math('ADD', h, g.math('MULTIPLY', fuzz, 0.6))


def _knit(g, col, h):
    """Ribbed knit: fine ribs running round the head and neck."""
    rib = g.math('SINE', g.math('MULTIPLY', g.Z, 2200.0))
    return col, g.math('ADD', h, g.math('MULTIPLY', rib, 0.25))


def _team(g, col, h):
    """A team armband or patch: woven, its edge hemmed."""
    weave = g.noise(g.P, 380.0, 1.0, 0.5)
    return g.mulc(col, g.math('ADD', 0.93, g.math('MULTIPLY', weave, 0.1))), g.math('ADD', h, weave)


def surf_glove(m):
    """The tactical glove (the owner's references): an olive stretch back, a coyote synthetic-suede palm, moulded
    pads on the backs of the fingers, the seam down each side and a neoprene cuff. 'Dors' (+1 back, -1 palm) and
    'Seg' (bone and place along it: 0 the palm, 1-4 a finger, -1 the cuff) come from the hand builder."""
    g = G(m)
    dors, seg = g.attr('Dors'), g.attr('Seg')
    palmside = g.step(dors, -0.02, -0.14)
    col = g.mixc(palmside, lin(0x4a4b36), lin(0x7a6a4e))
    col = g.mulc(col, g.math('ADD', 0.93, g.math('MULTIPLY', g.noise(g.P, 160.0, 2.0, 0.6), 0.14)))
    fr = g.math('FRACT', seg)
    on = g.math('MULTIPLY', g.step(seg, 0.95, 1.05), g.step(seg, 2.95, 2.85))
    pad = g.math('MULTIPLY', g.math('MULTIPLY', on, g.step(dors, 0.6, 0.75)),
                 g.math('MULTIPLY', g.step(fr, 0.1, 0.2), g.step(fr, 0.82, 0.72)))
    col = g.mixc(pad, col, lin(0x2e2d27))
    tip = g.math('MULTIPLY', g.step(seg, 3.35, 3.5), g.step(dors, 0.0, -0.25))      # grip patches on the finger tips
    col = g.mixc(g.math('MULTIPLY', tip, 0.8), col, lin(0x5e523e))
    seam = g.step(g.math('ABSOLUTE', dors), 0.07, 0.035)
    col = g.mixc(g.math('MULTIPLY', seam, 0.6), col, lin(0x2a271f))
    cuff = g.step(seg, -0.4, -0.6)
    col = g.mixc(cuff, col, lin(0x2c2d27))
    h = g.math('ADD', g.math('MULTIPLY', pad, 1.0), g.math('MULTIPLY', g.noise(g.P, 600.0, 1.0, 0.5), 0.12))
    h = g.math('SUBTRACT', h, g.math('MULTIPLY', seam, 0.5))
    h = g.math('ADD', h, g.math('MULTIPLY', tip, 0.35))
    rough = g.math('SUBTRACT', 0.88, g.math('MULTIPLY', pad, 0.25))
    return g.finish(col, rough, 0.0, h, height_dist=0.0012)


def surf_suede(m):
    return _plain(m, 0x6c5840, 0.95, mottle=0.22, mscale=24.0, grain=420.0, grain_amt=0.4, dust=0.3, hdist=0.0012)


SURF_BUILD = {
    'Camo': surf_camo,
    'Jersey': surf_jersey,
    'Nylon': lambda m: _plain(m, 0x7f6b4c, 0.88, mottle=0.14, grain=650.0, bevel=0.004),
    'Molle': lambda m: _plain(m, 0x7f6b4c, 0.88, mottle=0.12, grain=650.0, bevel=0.004, extra=_molle, hdist=0.0018),
    'Laser': lambda m: _plain(m, 0x7f6b4c, 0.88, mottle=0.12, grain=650.0, bevel=0.003, extra=_laser, hdist=0.0018),
    'Webbing': lambda m: _plain(m, 0x6c5a40, 0.85, mottle=0.1, grain=900.0, grain_amt=0.5, bevel=0.002),
    'Loop': lambda m: _plain(m, 0x6a5b43, 1.0, mottle=0.1, extra=_loop, hdist=0.0008),
    'Polymer': lambda m: _plain(m, 0x6f634c, 0.55, mottle=0.08, mscale=12.0, grain=300.0, grain_amt=0.2,
                                bevel=0.003),
    'Rubber': lambda m: _plain(m, 0x2a2826, 0.78, mottle=0.08, grain=400.0, bevel=0.002),
    'Metal': lambda m: _plain(m, 0x4c4b48, 0.42, metal=0.75, mottle=0.12, bevel=0.0015),
    'Mesh': lambda m: _plain(m, 0x222220, 0.55, metal=0.4, mottle=0.1, extra=_mesh_holes, hdist=0.0008),
    'Knit': lambda m: _plain(m, 0x2f302a, 0.95, mottle=0.1, extra=_knit, hdist=0.0008),
    'Elastic': lambda m: _plain(m, 0x3d3b31, 0.85, mottle=0.08, grain=900.0),
    'Leather': lambda m: _plain(m, 0x2b2926, 0.5, mottle=0.08, grain=200.0, grain_amt=0.4, bevel=0.003),
    'Suede': surf_suede,
    'Sole': lambda m: _plain(m, 0x2c2823, 0.85, mottle=0.1, dust=0.35),
    'Glove': surf_glove,
    'GlovePalm': lambda m: _plain(m, 0x9a8565, 0.85, mottle=0.12, grain=380.0),
    'Pad': lambda m: _plain(m, 0x35342f, 0.8, mottle=0.1, bevel=0.003),
    'Team': lambda m: _plain(m, 0xe9e9e9, 0.85, mottle=0.06, extra=_team, hdist=0.0006),
    'Lens': lambda m: _plain(m, 0x1a2026, 0.05, metal=0.9, mottle=0.0),
    'Cable': lambda m: _plain(m, 0x171717, 0.6, mottle=0.05),
    'Mag': lambda m: _plain(m, 0x202022, 0.6, mottle=0.08, grain=300.0, bevel=0.002),
}
SURF_COL.update({'Molle': 0x7f6b4c, 'Laser': 0x7f6b4c})


def build_surfaces():
    """Give every S_* material its procedural look."""
    done = []
    for m in list(bpy.data.materials):
        if m.name.startswith('S_') and m.name[2:] in SURF_BUILD:
            SURF_BUILD[m.name[2:]](m)
            done.append(m.name)
    return done


# --- the atlas ------------------------------------------------------------------------------------------------------
def _sel(objs, active=None):
    for q in bpy.context.selected_objects:
        q.select_set(False)
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def _weight(o, mat_name, centre):
    if o.name.startswith('Head_'):
        return UV_WEIGHT['head']
    if o.name.startswith('Kit'):
        return UV_WEIGHT['kit']
    if mat_name in ('S_Glove', 'S_Rubber', 'S_Webbing') and abs(centre.x) > 0.36:
        return UV_WEIGHT['glove']
    if abs(centre.x) > 0.2 and centre.z > 0.8:
        return UV_WEIGHT['arm']
    if mat_name in ('S_Suede', 'S_Sole', 'S_Cable'):
        return UV_WEIGHT['boot']
    if centre.z < 0.9:
        return UV_WEIGHT['leg']
    return 1.0


def unwrap(objs):
    """One atlas over all of them: angle-based islands, each scaled by how close the player sees it, then packed."""
    _sel(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.0, area_weight=0.0,
                             scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in objs:
        me = o.data
        bm = bmesh.new()
        bm.from_mesh(me)
        uvl = bm.loops.layers.uv['UVMap']
        for isl in bmesh_utils.bmesh_linked_uv_islands(bm, uvl):
            c3 = sum((f.calc_center_median() for f in isl), Vector()) / len(isl)
            names = {}
            for f in isl:
                mn = me.materials[f.material_index].name if f.material_index < len(me.materials) else ''
                names[mn] = names.get(mn, 0) + f.calc_area()
            mn = max(names, key=names.get)
            k = _weight(o, mn, c3)
            if abs(k - 1.0) < 1e-3:
                continue
            uvs = [l[uvl].uv for f in isl for l in f.loops]
            cu = sum((Vector(u) for u in uvs), Vector((0, 0))) / len(uvs)
            for f in isl:
                for l in f.loops:
                    l[uvl].uv = cu + (l[uvl].uv - cu) * k
        bm.to_mesh(me)
        bm.free()
    _sel(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    try:
        bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, rotate_method='ANY', scale=True,
                                merge_overlap=False, margin_method='FRACTION', margin=UV_MARGIN, pin=False,
                                shape_method='CONCAVE')
    except TypeError:
        bpy.ops.uv.pack_islands(rotate=True, margin=UV_MARGIN)
    bpy.ops.object.mode_set(mode='OBJECT')


def _atlas_image(name, size, non_color, float_buf=False):
    im = bpy.data.images.get(name)
    if im is not None:                          # a fresh buffer each build (the last one was saved out as a file)
        bpy.data.images.remove(im)
    im = bpy.data.images.new(name, size, size, alpha=False, float_buffer=float_buf)
    im.colorspace_settings.name = 'Non-Color' if non_color else 'sRGB'
    return im


def _targets(mats, image):
    for m in mats:
        nt = m.node_tree
        nd = nt.nodes.get('bake_target') or nt.nodes.new('ShaderNodeTexImage')
        nd.name = 'bake_target'
        nd.image = image
        for x in nt.nodes:
            x.select = False
        nd.select = True
        nt.nodes.active = nd


def _emit(mats, term):
    """Each material's output switched to an emission of its terminal `term` (T_col, T_rough, T_metal); None puts
    the shader back."""
    for m in mats:
        nt = m.node_tree
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        for l in list(out.inputs['Surface'].links):
            nt.links.remove(l)
        if term is None:
            nt.links.new(next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED').outputs['BSDF'], out.inputs['Surface'])
            continue
        em = nt.nodes.get('bake_emit') or nt.nodes.new('ShaderNodeEmission')
        em.name = 'bake_emit'
        t = nt.nodes[term]
        src = next(x for x in t.outputs if x.identifier == 'Result_Color') if t.type == 'MIX' else t.outputs[0]
        nt.links.new(src, em.inputs['Color'])
        em.inputs['Strength'].default_value = 1.0
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])


def _bake(objs, kind, samples, clear=True, **kw):
    sc = bpy.context.scene
    sc.cycles.samples = samples
    sc.render.bake.margin = BAKE_MARGIN
    sc.render.bake.margin_type = 'EXTEND'
    sc.render.bake.use_clear = clear
    sc.render.bake.target = 'IMAGE_TEXTURES'
    _sel(objs)
    bpy.ops.object.bake(type=kind, **kw)


def _px(im):
    a = np.empty(im.size[0] * im.size[1] * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    return a.reshape((im.size[1], im.size[0], 4))


def bake_atlas(objs):
    """Colour (× the occlusion), normal, roughness and metal of every source surface into the atlas images."""
    sc = bpy.context.scene
    keep_engine, keep_dev = sc.render.engine, sc.cycles.device
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    if sc.world is None:
        sc.world = bpy.data.worlds.new('World')
    sc.world.light_settings.distance = AO_DISTANCE
    every = [o for o in sc.objects if o.type == 'MESH']
    hidden = {o.name: o.hide_render for o in every}
    for o in every:
        o.hide_render = o not in objs
    mats = sorted({m for o in objs for m in o.data.materials if m and m.name.startswith('S_')}, key=lambda m: m.name)
    stray = sorted({(o.name, m.name if m else None) for o in objs for m in o.data.materials
                    if not (m and m.name.startswith('S_'))})
    assert not stray, 'parts without a source surface: %s' % stray
    out = {}
    try:
        col = _atlas_image('Atlas_Col', ATLAS, False)
        _targets(mats, col)
        _emit(mats, 'T_col')
        _bake(objs, 'EMIT', 4)
        rough = _atlas_image('Atlas_Rough', ATLAS, True)
        _targets(mats, rough)
        _emit(mats, 'T_rough')
        _bake(objs, 'EMIT', 4)
        metal = _atlas_image('Atlas_Metal', ATLAS, True)
        _targets(mats, metal)
        _emit(mats, 'T_metal')
        _bake(objs, 'EMIT', 4)
        _emit(mats, None)
        nrm = _atlas_image('Atlas_Nrm', ATLAS, True)
        _targets(mats, nrm)
        _bake(objs, 'NORMAL', 8, normal_space='TANGENT')
        ao = _atlas_image('Atlas_AO', ATLAS, True)
        _targets(mats, ao)
        # the heads share one place: each is baked with the body and kit only, so no head shades another
        heads = [o for o in objs if o.name.startswith('Head_')]
        for k, part in enumerate([[o for o in objs if o not in heads[1:]]] + [[h] for h in heads[1:]]):
            for o in objs:
                o.hide_render = not (o in part or o not in heads)
            _bake(part, 'AO', 96, clear=(k == 0))
        for o in objs:
            o.hide_render = False
        # colour × occlusion (with a floor, so creases read without going black)
        c = _px(col)
        a = _px(ao)[..., :1]
        c[..., :3] *= ATLAS_AO_FLOOR + (1.0 - ATLAS_AO_FLOOR) * a
        col.pixels.foreach_set(c.ravel())
        # roughness and metal into one image the game reads (glTF: G roughness, B metal; R left white)
        r, mt = _px(rough), _px(metal)
        orm = np.ones_like(r)
        orm[..., 1] = r[..., 0]
        orm[..., 2] = mt[..., 0]
        om = _atlas_image('Atlas_ORM', ATLAS, True)
        om.pixels.foreach_set(orm.ravel())
        om.scale(ORM_SIZE, ORM_SIZE)
        out = {'col': col, 'nrm': nrm, 'orm': om, 'ao': ao}
    finally:
        for o in every:
            o.hide_render = hidden[o.name]
        sc.render.engine, sc.cycles.device = keep_engine, keep_dev
    return out


def save_atlas(tex, stem):
    """The atlas as WebP files beside the .blend (the glTF exporter carries them as they are: EXT_texture_webp)."""
    paths = {}
    for key, q in (('col', 88), ('nrm', 92), ('orm', 90)):
        im = tex[key]
        p = os.path.join(DOCS, '%s_%s.webp' % (stem, key))
        im.file_format = 'WEBP'
        try:
            im.save(filepath=p, quality=q)
        except TypeError:
            im.filepath_raw = p
            im.save()
        old = bpy.data.images.get('%s_%s' % (stem, key))
        if old is not None:
            bpy.data.images.remove(old)
        new = bpy.data.images.load(p, check_existing=False)
        new.name = '%s_%s' % (stem, key)
        new.colorspace_settings.name = 'sRGB' if key == 'col' else 'Non-Color'
        paths[key] = (p, new)
    return paths


def final_materials(images, team_hex=0x3d8bff):
    """Outfit and TeamColour on the atlas, and Lens."""
    col, nrm, orm = images['col'], images['nrm'], images['orm']
    made = {}
    for name, tint in (('Outfit', None), ('TeamColour', team_hex)):
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
        uv = nt.nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'UVMap'
        ic = nt.nodes.new('ShaderNodeTexImage')
        ic.image = col
        nt.links.new(uv.outputs['UV'], ic.inputs['Vector'])
        if tint is None:
            nt.links.new(ic.outputs['Color'], b.inputs['Base Color'])
        else:
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            sk = lambda socks, ident: next(x for x in socks if x.identifier == ident)
            sk(mix.inputs, 'Factor_Float').default_value = 1.0
            sk(mix.inputs, 'B_Color').default_value = (*srgb(tint), 1.0)
            nt.links.new(ic.outputs['Color'], sk(mix.inputs, 'A_Color'))
            nt.links.new(sk(mix.outputs, 'Result_Color'), b.inputs['Base Color'])
        inn = nt.nodes.new('ShaderNodeTexImage')
        inn.image = nrm
        nt.links.new(uv.outputs['UV'], inn.inputs['Vector'])
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.uv_map = 'UVMap'
        nt.links.new(inn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
        io = nt.nodes.new('ShaderNodeTexImage')
        io.image = orm
        nt.links.new(uv.outputs['UV'], io.inputs['Vector'])
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(io.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
        m.diffuse_color = (*srgb(tint or 0x8d8668), 1.0)
        made[name] = m
    made['Lens'] = mat('Lens', 0x1a2026, rough=0.05, metal=0.9)
    return made


def assign_final(objs, made):
    """Each face from its source surface to Outfit, TeamColour or Lens; the Detail map and cloth data dropped."""
    for o in objs:
        me = o.data
        src = [m.name if m else '' for m in me.materials]
        want = []
        for n in src:
            k = 'TeamColour' if n in TEAM_SURFACES else 'Lens' if n in LENS_SURFACES else 'Outfit'
            if k not in want:
                want.append(k)
        want.sort(key=['Outfit', 'TeamColour', 'Lens'].index)
        remap = [want.index('TeamColour' if n in TEAM_SURFACES else 'Lens' if n in LENS_SURFACES else 'Outfit')
                 for n in src]
        idx = [p.material_index for p in me.polygons]
        me.materials.clear()
        for k in want:
            me.materials.append(made[k])
        me.polygons.foreach_set('material_index', [remap[i] for i in idx])
        d = me.uv_layers.get('Detail')
        if d is not None:
            me.uv_layers.remove(d)
        for nm in PART_DATA:
            a = me.attributes.get(nm)
            if a is not None:
                me.attributes.remove(a)
        for a in list(me.color_attributes):
            me.color_attributes.remove(a)
        me.update()


def dress_v12(meshes, stem='bot_human_v12'):
    """Surfaces, atlas, bakes and the final three materials on the joined figure."""
    build_surfaces()
    unwrap(meshes)
    tex = bake_atlas(meshes)
    files = save_atlas(tex, stem)
    made = final_materials({k: v[1] for k, v in files.items()})
    assign_final(meshes, made)
    return files


# v11's wrist-strap fix reads the old 'Hard' texture: nothing to do on a v12 figure
if not getattr(smooth_hand_hard, 'v12', False):
    _smooth_hand_hard_v11 = smooth_hand_hard


def smooth_hand_hard(objs, rig):
    m = bpy.data.materials.get('Hard')
    if m is None or not m.use_nodes or 'dress_nrm' not in m.node_tree.nodes:
        return
    return _smooth_hand_hard_v11(objs, rig)


smooth_hand_hard.v12 = True


# --- the build ------------------------------------------------------------------------------------------------------
def finalise_v12():
    """The human (v12): Body, Kit, Kit_Radio, Kit_Pack, the four heads (bot22) and the Rig at v11's scale, so the
    skeleton, clips and fits are unchanged."""
    O = bpy.data.objects
    b, k, h = build_all()
    s, m = _scale(b + k + h)
    heads = heads_v12(h, O['Gaiter'])
    bv = body_v12(b)
    kit_v12(k)
    cloth_attrs(bv)
    uv_layers(bv + k + [o for _, ps in heads for o in ps])
    out, rig = _assemble(bv, k, heads, m)
    return out + [rig], s


def build_human_full_v12():
    """session.py's build_human_full with the v12 finalise and dressing (same LODs and clips)."""
    O = bpy.data.objects
    B['clear_scene']()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    out, s = finalise_v12()
    rig = O['Rig']
    rig.data.pose_position = 'REST'
    meshes = [o for o in out if o.type == 'MESH']
    for o in meshes:
        o.hide_set(False)
    B['limit_weights'](meshes)
    dress_v12(meshes)
    lods = B['make_lods'](meshes)
    B['limit_weights'](lods)
    rig.data.pose_position = 'POSE'
    info = B['remake']()
    return meshes, lods, info


def export_v12(stem='bot_human_v12'):
    """The game's human file: session16's export with the v12 build in place of v11's."""
    keep = B['build_human_full']
    B['build_human_full'] = build_human_full_v12
    try:
        return B['export_v']('human', stem)
    finally:
        B['build_human_full'] = keep


B.update(dict(kit_v12=kit_v12, cloth_attrs=cloth_attrs, uv_layers=uv_layers, build_surfaces=build_surfaces,
              unwrap=unwrap, bake_atlas=bake_atlas, dress_v12=dress_v12, finalise_v12=finalise_v12,
              build_human_full_v12=build_human_full_v12, export_v12=export_v12))
print('bot21 ready')

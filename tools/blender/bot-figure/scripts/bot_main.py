
HEAD_SCALE = 1.07   # a touch over life size so the head reads at a distance; scaled about the helmet top
HEAD_TOP = Vector((0, 0.008, 1.731))


def build_all():
    clear()
    b = body()
    k = kit()
    h = head()
    m = Matrix.Translation(HEAD_TOP) @ Matrix.Scale(HEAD_SCALE, 4) @ Matrix.Translation(-HEAD_TOP)
    for o in h:
        o.data.transform(m)
    declip()
    return b, k, h

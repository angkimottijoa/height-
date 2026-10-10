"""Compact Molang conditions for sets of block-state combinations."""
import itertools


def _molang_value(v):
    if isinstance(v, str):
        return "'" + v + "'"
    return str(v)


def _term(name, v):
    return f"q.block_state('{name}') == {_molang_value(v)}"


def minimize(true_set, domains):
    """OR-of-AND cover of `true_set`.

    true_set: set of tuples (one value per domain, in order)
    domains:  [(state_name, [values...]), ...]
    Returns a Molang expression, '1' for always and '0' for never.
    """
    names = [n for n, _ in domains]
    values = [list(v) for _, v in domains]
    full = 1
    for v in values:
        full *= len(v)
    if not true_set:
        return '0'
    if len(true_set) == full:
        return '1'

    def cube_points(cube):
        return itertools.product(*cube)

    def inside(cube):
        return all(p in true_set for p in cube_points(cube))

    cubes = []
    uncovered = set(true_set)
    for point in sorted(true_set, key=str):
        if point not in uncovered:
            continue
        cube = [[x] for x in point]
        for i in range(len(names)):
            # widen variable i by every value that keeps the cube inside
            for val in values[i]:
                if val in cube[i]:
                    continue
                trial = list(cube)
                trial[i] = cube[i] + [val]
                if inside(trial):
                    cube = trial
        cubes.append(cube)
        uncovered -= set(cube_points(cube))

    terms = []
    for cube in cubes:
        parts = []
        for i, allowed in enumerate(cube):
            if len(allowed) == len(values[i]):
                continue
            rest = [v for v in values[i] if v not in allowed]
            if len(allowed) == 1:
                parts.append(_term(names[i], allowed[0]))
            elif len(rest) == 1:
                parts.append(f"q.block_state('{names[i]}') != {_molang_value(rest[0])}")
            else:
                parts.append('(' + ' || '.join(_term(names[i], v) for v in allowed) + ')')
        terms.append(' && '.join(parts) if parts else '1')
    if '1' in terms:
        return '1'
    if len(terms) == 1:
        return terms[0]
    return ' || '.join('(' + t + ')' if '&&' in t else t for t in terms)

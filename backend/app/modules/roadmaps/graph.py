"""Prerequisite graphs: validation and layout. Pure functions, no I/O."""

from collections.abc import Mapping, Sequence

X_STEP = 280
Y_STEP = 150


def find_cycle(prereqs: Mapping[str, Sequence[str]]) -> list[str] | None:
    """Returns one cycle (as a list of keys, first == last) or None when the graph is a DAG."""
    WHITE, GREY, BLACK = 0, 1, 2
    color = dict.fromkeys(prereqs, WHITE)
    stack: list[str] = []

    def visit(node: str) -> list[str] | None:
        color[node] = GREY
        stack.append(node)
        for nxt in prereqs.get(node, ()):
            if nxt not in color:
                continue
            if color[nxt] == GREY:
                return [*stack[stack.index(nxt):], nxt]
            if color[nxt] == WHITE and (found := visit(nxt)):
                return found
        stack.pop()
        color[node] = BLACK
        return None

    for node in prereqs:
        if color[node] == WHITE and (found := visit(node)):
            return found
    return None


def clean_prerequisites(order: Sequence[str], prereqs: Mapping[str, Sequence[str]]) -> dict[str, list[str]]:
    """Keep only edges that point to an EARLIER node in `order`.

    Model output lists topics in learning order; an edge to a later topic, an unknown topic or the node
    itself is dropped. The result is always acyclic (every edge goes backwards in a total order).
    """
    position = {key: i for i, key in enumerate(order)}
    cleaned: dict[str, list[str]] = {}
    for key in order:
        seen: list[str] = []
        for p in prereqs.get(key, ()):
            if p in position and position[p] < position[key] and p not in seen:
                seen.append(p)
        cleaned[key] = seen
    return cleaned


def depths(order: Sequence[str], prereqs: Mapping[str, Sequence[str]]) -> dict[str, int]:
    """Longest prerequisite chain above each node (0 for nodes without prerequisites). Needs a DAG."""
    memo: dict[str, int] = {}

    def depth(key: str) -> int:
        if key not in memo:
            parents = [p for p in prereqs.get(key, ()) if p in prereqs]
            memo[key] = 1 + max(map(depth, parents)) if parents else 0
        return memo[key]

    return {key: depth(key) for key in order}


def layout(order: Sequence[str], prereqs: Mapping[str, Sequence[str]]) -> dict[str, tuple[float, float]]:
    """Left-to-right layers by depth; nodes in a layer keep their learning order, centred vertically."""
    level = depths(order, prereqs)
    layers: dict[int, list[str]] = {}
    for key in order:
        layers.setdefault(level[key], []).append(key)
    tallest = max((len(v) for v in layers.values()), default=1)
    positions: dict[str, tuple[float, float]] = {}
    for d, keys in layers.items():
        offset = (tallest - len(keys)) * Y_STEP / 2
        for i, key in enumerate(keys):
            positions[key] = (float(d * X_STEP), float(offset + i * Y_STEP))
    return positions

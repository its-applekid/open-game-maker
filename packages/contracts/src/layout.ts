import type { MapLayoutSpec } from './card.js';

export type LayoutMetrics = {
  loop_count: number;
  dead_end_count: number;
  room_count: number;
  connection_count: number;
  total_area_cells: number;
  secret_count: number;
  areas_ok: boolean;
  endpoints_ok: boolean;
};

type Connection = MapLayoutSpec['connections'][number];
type StringConnection = Connection & { from: string; to: string };

function hasStringEndpoints(connection: Connection): connection is StringConnection {
  return typeof connection.from === 'string' && typeof connection.to === 'string';
}

function polygonArea(polygon: Array<[number, number]>): number {
  return (
    Math.abs(
      polygon.reduce((sum, [x, y], index) => {
        const [nextX, nextY] = polygon[(index + 1) % polygon.length]!;
        return sum + x * nextY - nextX * y;
      }, 0),
    ) / 2
  );
}

export function layoutMetrics(spec: MapLayoutSpec): LayoutMetrics {
  const roomIds = new Set(spec.rooms.map((room) => room.id));
  const internal = spec.connections.filter(hasStringEndpoints);
  const nodes = new Set(roomIds);
  if (internal.some(({ from, to }) => from === 'outside' || to === 'outside')) {
    nodes.add('outside');
  }

  const parents = new Map<string, string>();
  const find = (node: string): string => {
    const parent = parents.get(node);
    if (parent === undefined || parent === node) {
      parents.set(node, node);
      return node;
    }
    const root = find(parent);
    parents.set(node, root);
    return root;
  };
  for (const connection of internal) parents.set(find(connection.from), find(connection.to));

  const components = new Set([...nodes].map(find)).size;
  const degree = new Map<string, number>();
  for (const connection of spec.connections) {
    for (const endpoint of [connection.from, connection.to]) {
      if (typeof endpoint === 'string') degree.set(endpoint, (degree.get(endpoint) ?? 0) + 1);
    }
  }

  const areas = spec.rooms.map((room) => polygonArea(room.polygon));
  return {
    loop_count: internal.length - nodes.size + components,
    dead_end_count: [...roomIds].filter((id) => (degree.get(id) ?? 0) === 1).length,
    room_count: spec.rooms.length,
    connection_count: spec.connections.length,
    total_area_cells: areas.reduce((sum, area) => sum + area, 0),
    secret_count: spec.connections.filter((connection) => connection.type === 'secret-door').length,
    areas_ok: spec.rooms.every((room, index) => room.area_cells === undefined || room.area_cells === areas[index]),
    endpoints_ok: internal.every(
      ({ from, to }) => (roomIds.has(from) || from === 'outside') && (roomIds.has(to) || to === 'outside'),
    ),
  };
}

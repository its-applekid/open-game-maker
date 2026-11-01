export type NavmeshPoint = [x: number, y: number, z: number];
export interface NavmeshConfig {
  buildBvTree?: boolean;
  cs?: number;
  ch?: number;
  walkableSlopeAngle?: number;
  walkableHeight?: number;
  walkableClimb?: number;
  walkableRadius?: number;
  maxEdgeLen?: number;
  maxSimplificationError?: number;
  minRegionArea?: number;
  mergeRegionArea?: number;
  maxVertsPerPoly?: number;
  detailSampleDist?: number;
  detailSampleMaxError?: number;
  bounds?: [minimum: NavmeshPoint, maximum: NavmeshPoint];
}

export interface Navmesh {
  build(positions: ArrayLike<number>, indices: ArrayLike<number>, config?: NavmeshConfig): void;
  findPath(from: NavmeshPoint, to: NavmeshPoint): NavmeshPoint[];
}

export class NavUnavailable extends Error {
  constructor(
    message = 'Navmesh unavailable: declare capability nav.navmesh and install recast-navigation (star-rule exception pending)',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NavUnavailable';
  }
}

function vector([x, y, z]: NavmeshPoint): { x: number; y: number; z: number } {
  return { x, y, z };
}

export async function loadNavmesh(capabilities: ReadonlySet<string>): Promise<Navmesh> {
  if (!capabilities.has('nav.navmesh')) throw new NavUnavailable();

  let recast: typeof import('recast-navigation');
  let generators: typeof import('recast-navigation/generators');
  try {
    [recast, generators] = await Promise.all([import('recast-navigation'), import('recast-navigation/generators')]);
    await recast.init();
  } catch (cause) {
    throw new NavUnavailable(
      'Navmesh unavailable: install optional dependency recast-navigation (star-rule exception pending)',
      { cause },
    );
  }

  let query: InstanceType<typeof recast.NavMeshQuery> | undefined;
  return {
    build(positions, indices, config) {
      const result = generators.generateSoloNavMesh(positions, indices, config as Record<string, unknown>);
      if (!result.success) throw new Error(`Failed to build navmesh: ${result.error}`);
      query = new recast.NavMeshQuery(result.navMesh);
    },
    findPath(from, to) {
      if (!query) throw new Error('Build the navmesh before finding a path');
      const result = query.computePath(vector(from), vector(to));
      if (!result.success) {
        throw new Error(`Failed to find navmesh path: ${result.error?.name ?? 'unknown query error'}`);
      }
      return result.path.map(({ x, y, z }) => [x, y, z]);
    },
  };
}

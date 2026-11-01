declare module 'recast-navigation' {
  export interface RecastVector3 {
    x: number;
    y: number;
    z: number;
  }

  export function init(): Promise<void>;

  export class NavMeshQuery {
    constructor(navMesh: unknown);
    computePath(
      from: RecastVector3,
      to: RecastVector3,
    ): {
      success: boolean;
      error?: { name: string; status?: number };
      path: RecastVector3[];
    };
  }
}

declare module 'recast-navigation/generators' {
  export function generateSoloNavMesh(
    positions: ArrayLike<number>,
    indices: ArrayLike<number>,
    config?: Record<string, unknown>,
  ): { success: true; navMesh: unknown } | { success: false; error: string };
}

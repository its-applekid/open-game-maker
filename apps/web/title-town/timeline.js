const mod = (value, period) => ((value % period) + period) % period;

// The opening scene plays once, holds its final live frame while later scenes
// finish, then restarts exactly at the full title sequence boundary.
export function loopedSceneTime(time, cycle, scenePeriod) {
  if (!cycle) return time;
  return Math.min(mod(time, cycle), scenePeriod - 0.001);
}

export const CONTINUOUS_SHOWCASE_SCHEMA = "ogm.set-showcase/2";

export function isContinuousShowcase(sequence) {
  return sequence?.schema === CONTINUOUS_SHOWCASE_SCHEMA;
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

export function continuousTimeline(sequence) {
  const stops = sequence?.stops ?? [];
  const points = sequence?.runner?.path?.points ?? [];
  const loopSeconds = sequence?.loop_seconds;
  const declaredSpeed = sequence?.runner?.speed;
  const intervals = stops.map((stop, index) => {
    const startTime = stop.start_time;
    const nextStart = index + 1 < stops.length
      ? stops[index + 1].start_time
      : loopSeconds;
    const seconds = nextStart - startTime;
    const from = points[index] ?? [];
    const to = points[index + 1] ?? [];
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const speed = distance / seconds;
    const deviation = Math.abs(speed - declaredSpeed) / declaredSpeed;
    return { id: stop.id, startTime, seconds, distance, speed, deviation };
  });
  return { loopSeconds, intervals };
}

export function continuousStopState(sequence, tau) {
  const { intervals, loopSeconds } = continuousTimeline(sequence);
  const time = modulo(tau, loopSeconds);
  const index = Math.max(0, intervals.findLastIndex(({ startTime }) => time >= startTime));
  const interval = intervals[index];
  return {
    index,
    stop: sequence.stops[index],
    interval,
    time,
    localTime: time - interval.startTime,
  };
}

export function continuousRunnerPosition(sequence, tau) {
  const state = continuousStopState(sequence, tau);
  const points = sequence.runner.path.points;
  const from = points[state.index];
  const to = points[state.index + 1];
  const amount = state.interval.seconds > 0
    ? state.localTime / state.interval.seconds
    : 0;
  return {
    ...state,
    from,
    to,
    position: [
      from[0] + (to[0] - from[0]) * amount,
      from[1] + (to[1] - from[1]) * amount,
    ],
  };
}

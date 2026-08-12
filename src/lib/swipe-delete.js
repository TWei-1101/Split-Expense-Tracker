export const SWIPE_DELETE_DISTANCE = 72;
export const SWIPE_DELETE_VELOCITY = 0.45;

export function shouldTriggerSwipeDelete({ distance, durationMs }) {
  const leftwardDistance = Math.max(0, -Number(distance || 0));
  const velocity = durationMs > 0 ? leftwardDistance / durationMs : 0;
  return leftwardDistance >= SWIPE_DELETE_DISTANCE || velocity >= SWIPE_DELETE_VELOCITY;
}

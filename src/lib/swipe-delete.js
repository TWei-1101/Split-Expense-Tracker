// Reaching this distance opens the destructive action. Deletion itself still
// requires a deliberate tap on that action.
export const SWIPE_DELETE_DISTANCE = 48;
export const SWIPE_DELETE_VELOCITY = 0.35;

export function shouldTriggerSwipeDelete({ distance, durationMs }) {
  const leftwardDistance = Math.max(0, -Number(distance || 0));
  const velocity = durationMs > 0 ? leftwardDistance / durationMs : 0;
  return leftwardDistance >= SWIPE_DELETE_DISTANCE || velocity >= SWIPE_DELETE_VELOCITY;
}

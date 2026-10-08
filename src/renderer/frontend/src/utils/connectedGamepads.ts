/** Keep discovery separate from capture so device events update the selector immediately. */
export function watchConnectedGamepads(
  target: Window,
  navigatorSource: Pick<Navigator, 'getGamepads'>,
  onChange: (pads: Gamepad[]) => void,
): () => void {
  let known = new Map<number, Gamepad>();
  const publish = () => onChange([...known.values()].sort((a, b) => a.index - b.index));
  const poll = () => {
    const pads = navigatorSource.getGamepads?.();
    if (!pads) return;
    known = new Map(Array.from(pads).filter((pad): pad is Gamepad => !!pad && pad.connected !== false).map(pad => [pad.index, pad]));
    publish();
  };
  const connected = (event: GamepadEvent) => {
    known.set(event.gamepad.index, event.gamepad);
    publish();
  };
  const disconnected = (event: GamepadEvent) => {
    known.delete(event.gamepad.index);
    publish();
  };
  target.addEventListener('gamepadconnected', connected);
  target.addEventListener('gamepaddisconnected', disconnected);
  target.addEventListener('focus', poll);
  target.document.addEventListener('visibilitychange', poll);
  poll();
  const timer = target.setInterval(poll, 250);
  return () => {
    target.clearInterval(timer);
    target.removeEventListener('gamepadconnected', connected);
    target.removeEventListener('gamepaddisconnected', disconnected);
    target.removeEventListener('focus', poll);
    target.document.removeEventListener('visibilitychange', poll);
  };
}

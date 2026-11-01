export type TrackerXmOldTremorState = {
  fxmem: number;
  bflags: number;
};

export const createTrackerXmOldTremorState = (): TrackerXmOldTremorState => ({ fxmem: 0, bflags: 0 });

export const trackerXmOldTremorParameterAt = (memory: number, parameter: number) => parameter > 0 ? parameter & 0xff : memory & 0xff;

/** Applies one Maxmod Txy tick. Tick zero leaves the XM channel unchanged. */
export const trackerXmOldTremorTick = (
  state: TrackerXmOldTremorState,
  parameter: number,
  tick: number,
): { state: TrackerXmOldTremorState; cutVolume: boolean } => {
  if (tick === 0) return { state, cutVolume: false };

  let fxmem = state.fxmem;
  let bflags = state.bflags;
  if (fxmem === 0) {
    fxmem -= 1;
  } else {
    bflags ^= (1 << 9) | (1 << 10);
    fxmem = (bflags & (1 << 10)) !== 0
      ? ((parameter >> 4) & 0x0f) + 1
      : (parameter & 0x0f) + 1;
  }

  return { state: { fxmem, bflags }, cutVolume: (bflags & (1 << 10)) === 0 };
};

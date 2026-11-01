export interface TrackerModVolumeTick {
  tick: number;
  value: number;
}

export interface TrackerModVolumeRow {
  rowStartVolume: number;
  endingVolume: number;
  steps: TrackerModVolumeTick[];
}

const clampVolume = (volume: number) => Math.max(0, Math.min(64, Math.trunc(volume)));

/** Calculates the MOD channel-volume value at row entry and on each active tick. */
export function trackerModVolumeRow(startVolume: number, effect: number, parameter: number, tickCount: number): TrackerModVolumeRow {
  const initialVolume = clampVolume(startVolume);
  const param = Math.max(0, Math.min(0xff, Math.trunc(parameter)));
  const ticks = Math.max(0, Math.trunc(tickCount));
  let rowStartVolume = initialVolume;
  let endingVolume = initialVolume;
  const steps: TrackerModVolumeTick[] = [];

  if (effect === 0x0c) {
    rowStartVolume = clampVolume(param);
    endingVolume = rowStartVolume;
  } else if (effect === 0x05 || effect === 0x06 || effect === 0x0a) {
    let slide = 0;
    if (param === 0x0f) {
      // Maxmod's first audible mixer block keeps the incoming level for D0F.
      slide = -15;
    } else if (param === 0xf0) {
      rowStartVolume = clampVolume(initialVolume + 15);
      endingVolume = rowStartVolume;
    } else if ((param & 0x0f) === 0) {
      slide = param >> 4;
    } else if ((param >> 4) === 0) {
      slide = -(param & 0x0f);
    } else if ((param & 0x0f) === 0x0f) {
      rowStartVolume = clampVolume(initialVolume + (param >> 4));
      endingVolume = rowStartVolume;
    } else if ((param >> 4) === 0x0f) {
      rowStartVolume = clampVolume(initialVolume - (param & 0x0f));
      endingVolume = rowStartVolume;
    }

    for (let tick = 1; tick < ticks; tick += 1) {
      if (param === 0xf0 || ((param & 0x0f) === 0x0f && param !== 0x0f) || (param >> 4) === 0x0f) break;
      if (slide === 0) break;
      endingVolume = clampVolume(endingVolume + slide);
      steps.push({ tick, value: endingVolume });
    }
  }

  return { rowStartVolume, endingVolume, steps };
}

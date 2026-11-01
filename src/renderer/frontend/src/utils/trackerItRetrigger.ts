/** Apply Maxmod's IT/S3M Qxy volume subcommand to a 0..64 channel level. */
export const applyTrackerItRetriggerVolume = (volume: number, subcommand: number): number => {
  let next = Math.max(0, Math.min(64, Math.trunc(volume)));
  const command = subcommand & 0x0f;
  if (command >= 1 && command <= 5) next = Math.max(0, next - (1 << (command - 1)));
  else if (command === 6) next = (next * 171) >> 8;
  else if (command === 7) next >>= 1;
  else if (command >= 9 && command <= 13) next = Math.min(64, next + (1 << (command - 9)));
  else if (command === 14) next = (next * 192) >> 7;
  else if (command === 15) next = Math.min(64, next << 1);
  return next;
};

export const defaultControls = {
  0: {
      0: { 'value': 'x', 'value2': 'BUTTON_2' },
      1: { 'value': 's', 'value2': 'BUTTON_4' },
      2: { 'value': 'v', 'value2': 'SELECT' },
      3: { 'value': 'Enter', 'value2': 'START' },
      4: { 'value': 'ArrowUp', 'value2': 'DPAD_UP' },
      5: { 'value': 'ArrowDown', 'value2': 'DPAD_DOWN' },
      6: { 'value': 'ArrowLeft', 'value2': 'DPAD_LEFT' },
      7: { 'value': 'ArrowRight', 'value2': 'DPAD_RIGHT' },
      8: { 'value': 'z', 'value2': 'BUTTON_1' },
      9: { 'value': 'a', 'value2': 'BUTTON_3' },
      10: { 'value': 'q', 'value2': 'LEFT_TOP_SHOULDER' },
      11: { 'value': 'e', 'value2': 'RIGHT_TOP_SHOULDER' },
      12: { 'value': 'Tab', 'value2': 'LEFT_BOTTOM_SHOULDER' },
      13: { 'value': 'r', 'value2': 'RIGHT_BOTTOM_SHOULDER' },
      14: { 'value': '', 'value2': 'LEFT_STICK' },
      15: { 'value': '', 'value2': 'RIGHT_STICK' },
      16: { 'value': 'h', 'value2': 'LEFT_STICK_X:+1' },
      17: { 'value': 'f', 'value2': 'LEFT_STICK_X:-1' },
      18: { 'value': 'g', 'value2': 'LEFT_STICK_Y:+1' },
      19: { 'value': 't', 'value2': 'LEFT_STICK_Y:-1' },
      20: { 'value': 'l', 'value2': 'RIGHT_STICK_X:+1' },
      21: { 'value': 'j', 'value2': 'RIGHT_STICK_X:-1' },
      22: { 'value': 'k', 'value2': 'RIGHT_STICK_Y:+1' },
      23: { 'value': 'i', 'value2': 'RIGHT_STICK_Y:-1' },
      24: { 'value': 'undefined' },
      25: { 'value': 'undefined' },
      26: { 'value': 'undefined' },
      27: { 'value': 'F1' },
      28: { 'value': 'F2' },
      29: { 'value': 'F3' },
  },
  1: {},
  2: {},
  3: {}
};

export const controlDescriptions: Record<number, string> = {
  0: 'B',
  2: 'SELECT',
  3: 'START',
  4: 'UP',
  5: 'DOWN',
  6: 'LEFT',
  7: 'RIGHT',
  8: 'A',
  10: 'L',
  11: 'R',
  27: 'FAST FORWARD',
  28: 'REWIND',
  29: 'SLOW MOTION'
};


export const normalizeDemoKey = (key: string): string => {
  const aliases: Record<string, string> = { arrowup: 'up arrow', arrowdown: 'down arrow', arrowleft: 'left arrow', arrowright: 'right arrow', ' ': 'space', control: 'ctrl', esc: 'escape' };
  return aliases[key.toLowerCase()] ?? key.toLowerCase();
};
export const isJoystickBinding = (value: string): boolean => /^(BUTTON_\d+|GAMEPAD_\d+|DPAD_\w+|SELECT|START|(?:LEFT|RIGHT)_(?:TOP_SHOULDER|BOTTOM_SHOULDER|STICK(?:_[XY]:[+-]1)?)|EXTRA_STICK_\d+:[+-]1)$/.test(value);
export const normalizeDemoControls = (raw: any = defaultControls): any => {
  const result: any = {};
  for (const player of ['0', '1', '2', '3']) {
    result[player] = {};
    for (const [index, source] of Object.entries(raw[player] ?? {})) {
      const entry = source as any;
      const legacy = Object.entries(entry).filter(([field]) => /^value(\d*)$/.test(field)).map(([, value]) => value).filter((value): value is string => typeof value === 'string' && !!value && value !== 'undefined');
      const keyboardValues = Array.isArray(entry.keyboardValues) ? entry.keyboardValues : legacy.filter(value => !isJoystickBinding(value));
      const joystick = legacy.find(isJoystickBinding) ?? '';
      result[player][index] = { value: normalizeDemoKey(keyboardValues[0] ?? ''), value2: joystick, keyboardValues: [...new Set<string>(keyboardValues.map(normalizeDemoKey))] };
    }
  }
  return result;
};

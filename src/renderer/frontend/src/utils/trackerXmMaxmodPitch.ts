import { TRACKER_MAXMOD_GBA_MIX_RATE } from './trackerMaxmodGbaSample';

const mixerStepScaleQ16 = Math.floor((4096 * 65_536) / TRACKER_MAXMOD_GBA_MIX_RATE);

// Exact fixed-point slide tables from Maxmod's mas.c. Keep the GBA tracker
// preview on the same per-tick frequency path for XM linear-period modules.
const linearSlideUpTable = [0,237,475,714,953,1194,1435,1677,1920,2164,2409,2655,2902,3149,3397,3647,3897,4148,4400,4653,4907,5157,5417,5674,5932,6190,6449,6710,6971,7233,7496,7761,8026,8292,8559,8027,9096,9366,9636,9908,10181,10455,10730,11006,11283,11560,11839,12119,12400,12682,12965,13249,13533,13819,14106,14394,14684,14974,15265,15557,15850,16145,16440,16737,17034,17333,17633,17933,18235,18538,18842,19147,19454,19761,20070,20379,20690,21002,21315,21629,21944,22260,22578,22897,23216,23537,23860,24183,24507,24833,25160,25488,25817,26148,26479,26812,27146,27481,27818,28155,28494,28834,29175,29518,29862,30207,30553,30900,31248,31599,31951,32303,32657,33012,33369,33726,34085,34446,34807,35170,35534,35900,36267,36635,37004,37375,37747,38121,38496,38872,39250,39629,40009,40391,40774,41158,41544,41932,42320,42710,43102,43495,43889,44285,44682,45081,45481,45882,46285,46690,47095,47503,47917,48322,48734,49147,49562,49978,50396,50815,51236,51658,52082,52507,52934,53363,53793,54224,54658,55092,55529,55966,56406,56847,57289,57734,58179,58627,59076,59527,59979,60433,60889,61346,61805,62265,62727,63191,63657,64124,64593,65064,0,474,950,1427,1906,2387,2870,3355,3841,4327,4818,5310,5803,6298,6795,7294,7794,8296,8800,9306,9814,10323,10835,11348,11863,12380,12899,13419,13942,14467,14993,15521,16051,16583,17117,17653,18191,18731,19273,19817,20362,20910,21460,22011,22565,23121,23678,24238,24800,25363,25929,25497,27067,27639,28213,28789,29367,29947,30530,31114,31701,32289,32880,33473] as const;
const linearSlideDownTable = [65535,65300,65065,64830,64596,64364,64132,63901,63670,63441,63212,62984,62757,62531,62306,62081,61858,61635,61413,61191,60971,60751,60532,60314,60097,59880,59664,59449,59235,59022,58809,58597,58386,58176,57966,57757,57549,57341,57135,56929,56724,56519,56316,56113,55911,55709,55508,55308,55109,54910,54713,54515,54319,54123,53928,53734,53540,53347,53155,52963,52773,52582,52393,52204,52016,51829,51642,51456,51270,51085,50901,50718,50535,50353,50172,49991,49811,49631,49452,49274,49097,48920,48743,48568,48393,48128,48044,47871,47699,47527,47356,47185,47015,46846,46677,46509,46341,46174,46008,45842,45677,45512,45348,45185,45022,44859,44698,44537,44376,44216,44057,43898,43740,43582,43425,43269,43113,42958,42803,42649,42495,42342,42189,42037,41886,41735,41584,41434,41285,41136,40988,40840,40639,40566,40400,40253,40110,39965,39821,39678,39535,39392,39250,39109,38968,38828,38688,38548,38409,38271,38133,37996,37859,37722,37586,37451,37316,37181,37047,36914,36781,36648,36516,36385,36254,36123,35993,35863,35734,35605,35477,35349,35221,35095,34968,34842,34716,34591,34467,34343,34219,34095,33973,33850,33728,33607,33486,33365,33245,33125,33005,32887,32768,32650,32532,32415,32298,32182,32066,31950,31835,31720,31606,31492,31379,31266,31153,31041,30929,30817,30706,30596,30485,30376,30226,30157,30048,29940,29832,29725,29618,29511,29405,29299,29193,29088,28983,28879,28774,28671,28567,28464,28362,28260,28158,28056,27955,27855,27754,27654,27554,27455,27356,27258,27159,27062,26964,26867,26770,26674,26577,26482,26386,26291,26196,26102] as const;

/** Maxmod IT_PitchTable period for the XM linear-period note domain. */
export const trackerXmMaxmodLinearPeriod = (pitch: number) => {
  if (!Number.isFinite(pitch)) return 0;
  const note = Math.trunc(pitch + 12);
  if (note < 0 || note > 119) return 0;
  return Math.round(2_048 * 2 ** (note / 12));
};

/** One Maxmod Gxx linear-period update, using its checked-in fixed-point tables. */
export const trackerXmMaxmodLinearSlidePeriod = (period: number, parameter: number, direction: 'up' | 'down') => {
  if (!Number.isFinite(period) || period <= 0 || !Number.isInteger(parameter) || parameter < 0 || parameter > 255) return period;
  let value = Math.trunc(period);
  const tableValue = direction === 'up' ? linearSlideUpTable[parameter] : linearSlideDownTable[parameter];
  if (direction === 'up' && parameter >= 192) value *= 2;
  const scaled = Math.floor((value >> 5) * tableValue);
  const next = direction === 'up' ? Math.floor(scaled / 2_048) + value : Math.floor(scaled / 2_048);
  return direction === 'up' ? Math.min(1 << 21, next) : next;
};

/** Convert a Maxmod linear period back to the XM playback pitch domain. */
export const trackerXmMaxmodLinearPitch = (period: number) =>
  Number.isFinite(period) && period > 0 ? 12 * Math.log2(period / 2_048) - 12 : 48;

/** XM/Maxmod Jxy changes the active note in a base/high/low sequence per tick. */
export const trackerXmArpeggioPitchAtTick = (basePitch: number, parameter: number, tick: number) => {
  if (!Number.isFinite(basePitch) || !Number.isInteger(parameter) || parameter < 0 || parameter > 0xff || !Number.isInteger(tick) || tick < 0) return basePitch;
  const phase = tick % 3;
  return basePitch + (phase === 1 ? (parameter >> 4) & 0x0f : phase === 2 ? parameter & 0x0f : 0);
};

/**
 * Returns the Maxmod GBA Q12 sample step for an XM sample at a given note.
 * XM C-4 (tracker pitch 48) maps to Maxmod's linear table note 60. Maxmod
 * stores C5 speed in quarter units, truncates the table value to 8 fractional
 * bits, then converts the resulting integer frequency to the GBA Q12 step.
 */
export const trackerXmMaxmodMixerStepQ12 = (sampleRate: number, pitch: number) => {
  if (!Number.isFinite(sampleRate) || sampleRate < 4 || !Number.isFinite(pitch)) return 0;
  const integerPitch = Math.trunc(pitch);
  const maxmodNote = integerPitch + 12;
  if (maxmodNote < 0 || maxmodNote > 119) return 0;
  const periodQ16 = Math.round(2_048 * 2 ** (maxmodNote / 12));
  const tunedSampleRate = Math.floor(sampleRate * 2 ** ((pitch - integerPitch) / 12));
  const speed = Math.floor(tunedSampleRate / 4);
  const mixerValue = Math.floor(Math.floor(periodQ16 / 256) * (speed * 4) / 256);
  return Math.floor((mixerStepScaleQ16 * mixerValue) / 65_536);
};

/** Ratio between the quantized XM pitches used by Maxmod's GBA mixer. */
export const trackerXmMaxmodPlaybackRateScale = (sampleRate: number, pitch: number, rootPitch = 48) => {
  if (!Number.isFinite(sampleRate) || sampleRate < 4 || !Number.isFinite(pitch) || !Number.isFinite(rootPitch)) return 1;
  const baseStep = trackerXmMaxmodMixerStepQ12(sampleRate, rootPitch);
  const targetStep = trackerXmMaxmodMixerStepQ12(sampleRate, pitch);
  return baseStep > 0 && targetStep > 0 ? targetStep / baseStep : 1;
};

/** Ratio of Maxmod's quantized XM C-4 rate to the sample's declared rate. */
export const trackerXmMaxmodBasePlaybackScale = (sampleRate: number) => {
  const step = trackerXmMaxmodMixerStepQ12(sampleRate, 48);
  return step > 0 ? (step * TRACKER_MAXMOD_GBA_MIX_RATE) / (4096 * sampleRate) : 1;
};

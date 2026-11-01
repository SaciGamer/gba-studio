import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { inlineTrackerIdentity } from './helpers/tracker-module-identity.mjs';

const source = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerModule.ts'), 'utf8');
const itInstrumentMemorySource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerItInstrumentMemory.ts'), 'utf8');
const itInstrumentMemoryCompiled = ts.transpileModule(itInstrumentMemorySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { trackerItEventTriggersNote, trackerItInstrumentMemoryAfterEvent } = await import(`data:text/javascript;base64,${Buffer.from(itInstrumentMemoryCompiled).toString('base64')}`);
const fineVolumeSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerItFineVolume.ts'), 'utf8');
const fineVolumeCompiled = ts.transpileModule(fineVolumeSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { applyTrackerItFineVolume, applyTrackerItVolumeSlideTick, trackerItChannelVolumeSet, trackerItGlobalVolumeSet } = await import(`data:text/javascript;base64,${Buffer.from(fineVolumeCompiled).toString('base64')}`);
const panSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerItPan.ts'), 'utf8');
const panCompiled = ts.transpileModule(panSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { trackerItExtendedPanToNormalized, trackerItPanByteToNormalized } = await import(`data:text/javascript;base64,${Buffer.from(panCompiled).toString('base64')}`);
const retriggerSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerItRetrigger.ts'), 'utf8');
const retriggerCompiled = ts.transpileModule(retriggerSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { applyTrackerItRetriggerVolume } = await import(`data:text/javascript;base64,${Buffer.from(retriggerCompiled).toString('base64')}`);
const maxmodRetriggerSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerMaxmodRetrigger.ts'), 'utf8');
const maxmodRetriggerCompiled = ts.transpileModule(maxmodRetriggerSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { trackerMaxmodRowRetriggerCount } = await import(`data:text/javascript;base64,${Buffer.from(maxmodRetriggerCompiled).toString('base64')}`);
const maxmodMas = fs.readFileSync(path.resolve('tools/butano/butano/hw/3rd_party/maxmod/src/core/mas.c'), 'utf8');
const maxmodMixer = fs.readFileSync(path.resolve('tools/butano/butano/hw/3rd_party/maxmod/src/gba/mixer_asm.s'), 'utf8');
const maxmodEffectDispatch = maxmodMas.match(/mm_word mpp_Process_Effect\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodEffectDispatch, 'the checked-in Maxmod core contains the IT effect dispatcher');
for (let effect = 1; effect <= 28; effect += 1) {
  assert.match(maxmodEffectDispatch, new RegExp(`case ${effect}\\s*:`), `Maxmod dispatches IT effect command ${effect}`);
}
for (const [effect, label, handler] of [
  [9, 'Ixy tremor', /case 9:[\s\S]*?TODO: This isn't implemented/],
  [16, 'Pxy panning slide', /case 16:[\s\S]*?TODO[\s\S]*?mppe_PanningSlide/],
  [25, 'Yxy panbrello', /case 25:[\s\S]*?TODO/],
  [26, 'Zxx filter', /case 26:[\s\S]*?TODO: Not supported/],
]) {
  assert.match(maxmodEffectDispatch, handler, `Maxmod IT ${label} is explicitly a no-op (effect ${effect})`);
}
const maxmodInstrumentControlBody = maxmodMas.match(/static void mppex_InstControl\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodInstrumentControlBody, 'the checked-in Maxmod core contains IT S7x instrument control');
assert.match(maxmodInstrumentControlBody, /subparam <= 2[\s\S]*?mppex_ic_pastnotes[\s\S]*?\/\/ TODO[\s\S]*?else if \(subparam <= 6\)/,
  'Maxmod IT S70-S72 past-note actions are explicit TODOs while S73-S76 configure NNA');
const maxmodSoundControlBody = maxmodMas.match(/static void mppex_SoundControl\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodSoundControlBody, 'the checked-in Maxmod core contains IT S9x sound control');
assert.match(maxmodSoundControlBody, /param != 0x91[\s\S]*?Set surround[\s\S]*?\/\/ TODO/,
  'Maxmod S91 surround is explicitly unimplemented; all other S9x values are ignored');
const maxmodSetSpeedBody = maxmodMas.match(/static void mppe_SetSpeed\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
const maxmodSampleOffsetBody = maxmodMas.match(/static void mppe_SampleOffset\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodSampleOffsetBody, 'the checked-in Maxmod core contains the Oxx sample-offset handler');
assert.match(maxmodSampleOffsetBody, /if \(layer->tick != 0\)\s*return;[\s\S]*?mpp_vars\.sampoff = param;/,
  'Maxmod stores the IT Oxx offset on tick zero');
assert.match(maxmodMas, /expects the player to skip "256 \* xx" samples[\s\S]*?mix_ch->read = \(\(mm_word\)mpp_vars\.sampoff\) << \(MP_SAMPFRAC \+ 8\);/,
  'the GBA mixer advances the sample reader by exactly 256 source samples per Oxx unit');assert.ok(maxmodSetSpeedBody, 'the checked-in Maxmod core contains the Axx speed handler');
assert.match(maxmodSetSpeedBody, /if \(layer->tick != 0\)\s*return;[\s\S]*?if \(param != 0\)\s*layer->speed = param;/,
  'Maxmod Axx changes speed on tick zero and ignores A00');
const maxmodSetTempoBody = maxmodMas.match(/static void mppe_SetTempo\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodSetTempoBody, 'the checked-in Maxmod core contains the Txy tempo handler');
assert.match(maxmodSetTempoBody, /param < 0x10[\s\S]*?if \(layer->tick == 0\)\s*return;[\s\S]*?layer->bpm - param[\s\S]*?bpm < 32[\s\S]*?param < 0x20[\s\S]*?layer->bpm \+ \(param & 0xF\)[\s\S]*?bpm > 255[\s\S]*?if \(layer->tick != 0\)\s*return;[\s\S]*?mpp_setbpm\(layer, param\);/,
  'Maxmod T0x/T1x slides on nonzero ticks with 32..255 clamps and T2x sets BPM on tick zero');
assert.match(maxmodMas, /case 1:\s*mppe_SetSpeed\(param, layer\);[\s\S]*?case 20:\s*mppe_SetTempo\(param, layer\);/,
  'Maxmod dispatches IT Axx/Txy to the audited timing handlers');
const previewPlayerSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerPreviewPlayer.ts'), 'utf8');
const maxmodPortamentoBody = maxmodMas.match(/static mm_word mppe_Portamento\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
const maxmodGlissandoBody = maxmodMas.match(/static mm_word mppe_Glissando\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodPortamentoBody && maxmodGlissandoBody, 'the checked-in Maxmod core contains IT E/F and Gxx handlers');
assert.match(maxmodPortamentoBody, /\(param >> 4\) == 0xE[\s\S]*?layer->tick != 0[\s\S]*?param &= 0xF[\s\S]*?is_fine = true[\s\S]*?\(param >> 4\) == 0xF[\s\S]*?layer->tick != 0[\s\S]*?param &= 0xF[\s\S]*?layer->tick == 0/,
  'Maxmod IT E/F slides apply fine variants on tick zero and regular slides on later ticks');
assert.match(maxmodPortamentoBody, /mpph_FinePitchSlide_Down\(channel->period, param, layer\)[\s\S]*?mpph_PitchSlide_Down\(channel->period, param, layer\)[\s\S]*?mpph_FinePitchSlide_Up\(channel->period, param, layer\)[\s\S]*?mpph_PitchSlide_Up\(channel->period, param, layer\)/,
  'Maxmod IT E/F direction and fine/regular period helpers are explicit');
assert.match(maxmodGlissandoBody, /MAS_HEADER_FLAG_LINK_GXX[\s\S]*?param == 0[\s\S]*?channel->memory\[MPP_IT_PORTA\][\s\S]*?channel->memory\[MPP_XM_IT_GLIS\][\s\S]*?mppe_glis_backdoor/,
  'Maxmod IT Gxx shares and remembers nonzero speed for zero-parameter rows before glissando');
assert.match(previewPlayerSource, /const scheduleItTonePortamento = \([^)]*\) => \{[\s\S]*?trackerItMaxmodAmigaPeriod\(sampleRate, currentPitch, rootNote\)[\s\S]*?itLinearSlides[\s\S]*?const delta = speed << 4[\s\S]*?currentPitch = voice\.pitchValue \+ 12 \* Math\.log2\(startPeriod \/ Math\.max\(1, period\)\)/,
  'the Preview uses Maxmod Amiga-period Gxx steps unless the IT linear-slide header flag is set');
assert.match(previewPlayerSource, /const scheduleItPitchSlide = \([^)]*\) => \{[\s\S]*?const amount = slideValue << \(fine \? 2 : 4\)[\s\S]*?const firstTick = fine \? 0 : 1[\s\S]*?const lastTick = fine \? 0 : ticks - 1[\s\S]*?period = effect === 5 \? Math\.min\(32768, period \+ amount\) : Math\.max\(1, period - amount\)/,
  'the Preview applies IT E/F slides in Maxmod period units with matching tick-zero/fine timing and clamps');
assert.match(previewPlayerSource, /\(format === 'S3M' \|\| format === 'IT'\) && effect === 0x01 && parameter > 0\)\s*\{?\s*timingSpeed = parameter;/,
  'the Preview applies Axx speed before calculating the following row boundaries');
assert.match(previewPlayerSource, /\(format === 'S3M' \|\| format === 'IT'\) && effect === 0x14\)[\s\S]*?timingTempo = Math.min\(255, parameter\);[\s\S]*?s3mItTempoSlides.push\(parameter\);/,
  'the Preview separates IT T2x tempo sets from T0x/T1x slide rows');
const maxmodVolumeSlideBody = maxmodMas.match(/static mm_word mpph_VolumeSlide\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodVolumeSlideBody, 'the checked-in Maxmod core contains its shared volume-slide helper');
assert.match(maxmodVolumeSlideBody, /else \/\/ mpph_vs_IT[\s\S]*?if \(param == 0xF\)[\s\S]*?volume -= 0xF;[\s\S]*?if \(param == 0xF0\)[\s\S]*?if \(tick != 0\)\s*return volume;[\s\S]*?if \(\(param & 0xF\) == 0\)[\s\S]*?if \(tick == 0\)\s*return volume;[\s\S]*?if \(\(param >> 4\) == 0\)[\s\S]*?if \(tick == 0\)\s*return volume;[\s\S]*?if \(tick != 0\)\s*return volume;[\s\S]*?if \(\(param & 0xF\) == 0xF\)[\s\S]*?if \(\(param >> 4\) == 0xF\)/,
  'Maxmod IT channel-volume slides distinguish per-tick, tick-zero-only, fine-slide, and clamped cases');
assert.match(maxmodMas, /static void mppe_ChannelVolumeSlide\([^)]*\)\s*\{\s*channel->cvolume = mpph_VolumeSlide64\(channel->cvolume, param, layer->tick, layer\);[\s\S]*?case 14:\s*mppe_ChannelVolumeSlide\(param, channel, layer\);/,
  'Maxmod dispatches IT Nxy through its 64-step IT volume-slide helper');
assert.match(maxmodMas, /static void mppe_GlobalVolumeSlide\([^)]*\)\s*\{[\s\S]*?if \(layer->flags & MAS_HEADER_FLAG_XM_MODE\)\s*maxvol = 64;[\s\S]*?else\s*maxvol = 128;[\s\S]*?layer->global_volume = mpph_VolumeSlide\(layer->global_volume, param,[\s\S]*?case 23:\s*mppe_GlobalVolumeSlide\(param, layer\);/,
  'Maxmod dispatches IT Wxy through the shared volume-slide helper with a 128-step maximum');
const maxmodChannelVolumeBody = maxmodMas.match(/static void mppe_ChannelVolume\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodChannelVolumeBody, 'the checked-in Maxmod core contains the Mxx channel-volume handler');
assert.match(maxmodChannelVolumeBody, /if \(layer->tick != 0\)\s*return;[\s\S]*?if \(param > 0x40\)[\s\S]*?return;[\s\S]*?channel->cvolume = param;/,
  'Maxmod Mxx changes channel volume on tick zero and ignores values above 64');
const maxmodGlobalVolumeBody = maxmodMas.match(/static void mppe_SetGlobalVolume\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodGlobalVolumeBody, 'the checked-in Maxmod core contains the Vxx global-volume handler');
assert.match(maxmodGlobalVolumeBody, /if \(layer->tick != 0\)\s*return;[\s\S]*?MAS_HEADER_FLAG_XM_MODE \| MAS_HEADER_FLAG_OLD_MODE[\s\S]*?maxvol = 64;[\s\S]*?maxvol = 128;[\s\S]*?layer->global_volume = \(param < maxvol\) \? param : maxvol;/,
  'Maxmod Vxx changes on tick zero and clamps IT global volume at 128');
assert.match(maxmodMas, /case 13:\s*mppe_ChannelVolume\(param, channel, layer\);[\s\S]*?case 22:\s*mppe_SetGlobalVolume\(param, layer\);/,
  'Maxmod dispatches IT Mxx and Vxx to their set-volume handlers');
const maxmodSetPanningBody = maxmodMas.match(/static void mppe_SetPanning\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
const maxmodExtendedPanningBody = maxmodMas.match(/static void mppex_SetPanning\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodSetPanningBody && maxmodExtendedPanningBody, 'the checked-in Maxmod core contains Xxx and S8x pan handlers');
assert.match(maxmodSetPanningBody, /if \(layer->tick == 0\)\s*channel->panning = param;/,
  'Maxmod Xxx sets the full pan byte on tick zero');
assert.match(maxmodExtendedPanningBody, /channel->panning = param << 4;/,
  'Maxmod S8x places its nibble in the high four bits of the pan byte');
assert.match(maxmodMas, /case 0x8: \/\/ S8x\s*mppex_SetPanning\(param, channel\);[\s\S]*?case 24:\s*mppe_SetPanning\(param, channel, layer\);/,
  'Maxmod dispatches IT S8x and Xxx to the audited pan setters');
assert.match(maxmodMixer, /ldrb\s+rvolR, \[rchan, #CHN_VOL\][\s\S]*?ldrb\s+r0, \[rchan, #CHN_PAN\][\s\S]*?rsb\s+r0, r0, #256[\s\S]*?mul\s+rvolL, r0, rvolR[\s\S]*?mov\s+rvolL, rvolL, lsr #8[\s\S]*?mul\s+rvolR, r0, rvolR[\s\S]*?mov\s+rvolR, rvolR, lsr #8/,
  'Maxmod scales the two stereo mixer channels by (256-pan)/256 and pan/256');
const maxmodVolumeSlideHandler = maxmodMas.match(/static void mppe_VolumeSlide\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodVolumeSlideHandler, 'the checked-in Maxmod core contains the Dxy note-volume handler');
assert.match(maxmodVolumeSlideHandler, /channel->volume = mpph_VolumeSlide64\(channel->volume, param, layer->tick, layer\);/,
  'Maxmod Dxy uses the same exact 64-step IT volume-slide helper as Nxy');
const maxmodPortaVolumeBody = maxmodMas.match(/static mm_word mppe_PortaVolume\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodPortaVolumeBody, 'the checked-in Maxmod core contains the Lxy combined handler');
assert.match(maxmodPortaVolumeBody, /mppe_Glissando\(mem, period, act_ch, channel, layer\)[\s\S]*?mppe_VolumeSlide\(param, channel, layer\)/,
  'Maxmod Lxy combines remembered portamento with the same IT note-volume slide routine');
assert.match(maxmodMas, /case 4:\s*mppe_VolumeSlide\(param, channel, layer\);[\s\S]*?case 12:\s*return mppe_PortaVolume\(param, period, act_ch, channel, layer\);/,
  'Maxmod dispatches IT Dxy and Lxy to the verified note-volume slide handlers');
const previewVolumeSlideScheduler = previewPlayerSource.match(/const scheduleS3mVolumeSlide = \([^)]*\) => \{([\s\S]*?)\n    \};/)?.[1];
assert.ok(previewVolumeSlideScheduler, 'the Preview contains the shared Dxy/Kxy/Lxy volume-slide scheduler');
assert.match(previewVolumeSlideScheduler, /parameter === 0x0f[\s\S]*?applyOnFirstAndEveryTick = true;[\s\S]*?low === 0x0f && high > 0[\s\S]*?firstTickOnly = true;[\s\S]*?high === 0x0f && low > 0[\s\S]*?firstTickOnly = true;[\s\S]*?if \(applyOnFirstAndEveryTick\) applyAt\(0\);[\s\S]*?for \(let tick = 1; tick < ticks; tick \+= 1\)/,
  'the Preview Dxy scheduler distinguishes repeated, regular, and fine slides at Maxmod tick boundaries');
assert.match(previewVolumeSlideScheduler, /if \(format === 'IT'\)\s*\{[\s\S]*?for \(let tick = 0; tick < ticks; tick \+= 1\)[\s\S]*?applyTrackerItVolumeSlideTick\(s3mActiveNoteVolumes\[channel\], parameter, tick\)[\s\S]*?return;/,
  'the IT Dxy/Kxy/Lxy scheduler uses the tested Maxmod volume-slide calculation for every active tick');
const maxmodArpeggioBody = maxmodMas.match(/static mm_word mppe_Arpeggio\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodArpeggioBody, 'the checked-in Maxmod core contains the IT Jxy arpeggio handler');
assert.match(maxmodArpeggioBody, /if \(layer->tick == 0\)\s*channel->fxmem = 0;[\s\S]*?if \(act_ch == NULL\)\s*return period;[\s\S]*?if \(channel->fxmem > 1\)[\s\S]*?semitones = param & 0xF;[\s\S]*?else if \(channel->fxmem == 1\)[\s\S]*?semitones = param >> 4;[\s\S]*?else[\s\S]*?channel->fxmem = 1;\s*return period;[\s\S]*?semitones \*= 16;[\s\S]*?mpph_LinearPitchSlide_Up\(period, semitones, layer\)/,
  'Maxmod Jxy uses base/high/low ticks, resets phase on tick zero, and applies semitone offsets through its linear period slide');
assert.match(maxmodMas, /case 10:\s*return mppe_Arpeggio\(param, period, act_ch, channel, layer\);/,
  'Maxmod dispatches IT Jxy to its arpeggio handler');
const previewTremoloScheduler = previewPlayerSource.match(/const scheduleItTremolo = \([^)]*\) => \{([\s\S]*?)\n    \};/)?.[1];
assert.ok(previewTremoloScheduler, 'the Preview contains the tick-based IT Rxy tremolo scheduler');
assert.match(previewTremoloScheduler, /const speed = \(parameter >> 4\) & 0x0f;[\s\S]*?const depth = parameter & 0x0f;[\s\S]*?const startPhase = itTremoloPhases\[channel\];[\s\S]*?for \(let tick = 0; tick < ticks; tick \+= 1\)[\s\S]*?startPhase \+ tick \* speed \* 4[\s\S]*?trackerItMaxmodTremoloVolumeAt\(baseMaxmodVolume, position, depth\)[\s\S]*?when \+ tick \* tickDuration[\s\S]*?itTremoloPhases\[channel\] = \(startPhase \+ Math.max\(0, ticks - 1\) \* speed \* 4\) & 0xff;/,
  'Preview Rxy schedules Maxmod sine-table volume at each tick and advances the 256-step phase only for elapsed ticks');
assert.match(maxmodMas, /case 18:\s*mppe_Tremolo\(param, channel, layer\);/,
  'Maxmod dispatches IT Rxy to its checked tremolo handler');
assert.match(previewPlayerSource, /if \(format === 'IT' && !keyOff && effect === 18 && channelVoices\[channel\]\)[\s\S]*?scheduleItTremolo\(channel, voice\.gain, baseGain, baseVolume, parameter, currentTickCount, tickDuration, when\);/,
  'Preview applies Rxy to an active IT voice using the scheduled tick duration');
const maxmodFineVolumeUpBody = maxmodMas.match(/static void mppex_XM_FVolSlideUp\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
const maxmodFineVolumeDownBody = maxmodMas.match(/static void mppex_XM_FVolSlideDown\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodFineVolumeUpBody && maxmodFineVolumeDownBody, 'Maxmod defines both fine-volume handlers used by IT S0x/S1x');
assert.match(maxmodFineVolumeUpBody, /if \(layer->tick != 0\)\s*return;[\s\S]*?channel->volume \+ \(param & 0xF\)[\s\S]*?if \(volume > 64\)\s*volume = 64;[\s\S]*?channel->volume = volume;/,
  'S0x changes channel volume only on tick zero, adds its low nibble, and clamps at 64');
assert.match(maxmodFineVolumeDownBody, /if \(layer->tick != 0\)\s*return;[\s\S]*?channel->volume - \(param & 0xF\)[\s\S]*?if \(volume < 0\)\s*volume = 0;[\s\S]*?channel->volume = volume;/,
  'S1x changes channel volume only on tick zero, subtracts its low nibble, and clamps at zero');
assert.match(maxmodMas, /case 0x0: \/\/ S0x\s*mppex_XM_FVolSlideUp\(param, channel, layer\);[\s\S]*?case 0x1: \/\/ S1x\s*mppex_XM_FVolSlideDown\(param, channel, layer\);/,
  'Maxmod dispatches IT S0x/S1x to the corresponding deterministic handlers');
const maxmodRetriggerBody = maxmodMas.match(/static void mppe_Retrigger\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodRetriggerBody, 'the checked-in Maxmod core contains the Qxy retrigger routine');
assert.match(maxmodRetriggerBody, /if \(mem == 0\)[\s\S]*?channel->fxmem = \(param & 0xF\) \+ 1;[\s\S]*?mem--;[\s\S]*?if \(mem != 1\)/,
  'Maxmod seeds the Qxy countdown on the first tick and retriggers only when the interval expires');
assert.match(maxmodMas, /case 17:\s*mppe_Retrigger\(param, act_ch, channel\);/, 'IT Qxy dispatches to Maxmod’s Qxy countdown');
assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(ticks => trackerMaxmodRowRetriggerCount(3, ticks)), [0, 0, 0, 0, 1, 1, 1, 2],
  'IT Qxy executes after each interval and cannot retrigger beyond the current row');
assert.equal(trackerMaxmodRowRetriggerCount(0, 6), 0, 'Qx0 does not retrigger');
const processTickBody = maxmodMas.match(/IWRAM_CODE void mppProcessTick\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(processTickBody, 'the checked-in Maxmod core contains its tick-advance routine');
assert.equal((processTickBody.match(/fpattdelay/g) ?? []).length, 2, 'Maxmod only checks for and decrements fpattdelay in its row-advance routine');
assert.match(processTickBody, /if \(layer->fpattdelay != 0\)\s*layer->fpattdelay--;/);
assert.match(maxmodMas, /static void mppex_FPattDelay[^\{]*\{[^}]*layer->tick != 0[^}]*layer->fpattdelay = param & 0xF;/,
  'IT S6x only writes the unused fine-delay counter');
const maxmodPatternLoopBody = maxmodMas.match(/static void mppex_PatternLoop\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodPatternLoopBody, 'the checked-in Maxmod core contains the IT SBx loop handler');
assert.match(maxmodPatternLoopBody, /if \(layer->tick != 0\)\s*return;[\s\S]*?subparam == 0[\s\S]*?layer->ploop_row = layer->row[\s\S]*?if \(counter == 0\)[\s\S]*?layer->ploop_times = subparam[\s\S]*?layer->ploop_jump = 1[\s\S]*?layer->ploop_times = counter - 1/,
  'Maxmod IT SB0 stores the loop start and SBx counts the requested additional passes from tick zero');
const maxmodNoteCutBody = maxmodMas.match(/static void mppex_NoteCut\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
const maxmodNoteDelayBody = maxmodMas.match(/static void mppex_NoteDelay\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
const maxmodPatternDelayBody = maxmodMas.match(/static void mppex_PatternDelay\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1];
assert.ok(maxmodNoteCutBody && maxmodNoteDelayBody && maxmodPatternDelayBody, 'Maxmod defines IT SCx/SDx/SEx timing handlers');
assert.match(maxmodNoteCutBody, /reference = param & 0xF[\s\S]*?layer->tick != reference[\s\S]*?channel->volume = 0;/,
  'IT SCx sets channel volume to silence on its selected tick');
assert.match(maxmodNoteDelayBody, /reference = param & 0xF[\s\S]*?layer->tick >= reference[\s\S]*?mpp_vars\.notedelay = reference;/,
  'IT SDx delays the note start until the selected tick');
assert.match(maxmodPatternDelayBody, /layer->tick != 0[\s\S]*?if \(layer->pattdelay == 0\)[\s\S]*?layer->pattdelay = \(param & 0xF\) \+ 1;/,
  'IT SEx records the row-repeat count only on tick zero');
const templateSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/xmBeatTemplate.ts'), 'utf8');
const templateCompiled = ts.transpileModule(templateSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const templateUrl = `data:text/javascript;base64,${Buffer.from(templateCompiled).toString('base64')}`;
const instrumentLibrarySource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerInstrumentLibrary.ts'), 'utf8');
const instrumentLibraryCompiled = ts.transpileModule(instrumentLibrarySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const instrumentLibraryUrl = `data:text/javascript;base64,${Buffer.from(instrumentLibraryCompiled).toString('base64')}`;
const compatibilitySource = fs.readFileSync(path.resolve('src/shared/trackerItBuildCompatibility.ts'), 'utf8');
const compatibilityCompiled = ts.transpileModule(compatibilitySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const compatibilityUrl = `data:text/javascript;base64,${Buffer.from(compatibilityCompiled).toString('base64')}`;
const compiled = inlineTrackerIdentity(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
  .replace("from './xmBeatTemplate'", `from '${templateUrl}'`)
  .replaceAll("from './trackerInstrumentLibrary'", `from '${instrumentLibraryUrl}'`)
  .replace("from '../../../../shared/trackerItBuildCompatibility'", `from '${compatibilityUrl}'`);
const { analyzeTrackerPreview, flattenItInstrumentModeForBuild, parseItPatternRows, parseItSamples, parseTrackerCompatibilityWarnings, parseTrackerModule, parseTrackerPlaybackRows, updateItPatternEvent } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
assert.equal(applyTrackerItFineVolume(32, 0x08), 40, 'IT S0x raises channel volume on the row tick');
assert.equal(applyTrackerItFineVolume(32, 0x12), 30, 'IT S1x lowers channel volume on the row tick');
assert.equal(applyTrackerItFineVolume(60, 0x0f), 64, 'IT S0x saturates at the channel volume maximum');
assert.equal(applyTrackerItFineVolume(4, 0x1f), 0, 'IT S1x saturates at silence');
const volumeSlideSequence = (start, parameter, ticks, maximum = 64) => Array.from({ length: ticks }, (_, tick) => tick)
  .reduce((values, tick) => [...values, applyTrackerItVolumeSlideTick(values.at(-1) ?? start, parameter, tick, maximum)], []);
assert.deepEqual(volumeSlideSequence(64, 0x0f, 6), [49, 34, 19, 4, 0, 0], 'IT N0F decreases channel volume on tick zero and every following tick');
assert.deepEqual(volumeSlideSequence(32, 0x20, 4), [32, 34, 36, 38], 'IT N20 increases after tick zero');
assert.deepEqual(volumeSlideSequence(32, 0x03, 4), [32, 29, 26, 23], 'IT N03 decreases after tick zero');
assert.deepEqual(volumeSlideSequence(32, 0x2f, 3), [34, 34, 34], 'IT N2F applies a two-step fine increase only at tick zero');
assert.deepEqual(volumeSlideSequence(32, 0xf2, 3), [30, 30, 30], 'IT NF2 applies a two-step fine decrease only at tick zero');
assert.equal(applyTrackerItVolumeSlideTick(62, 0x20, 1), 64, 'IT Nxy increase clamps at channel volume maximum');
assert.equal(applyTrackerItVolumeSlideTick(3, 0x03, 1), 0, 'IT Nxy decrease clamps at silence');
assert.deepEqual(volumeSlideSequence(128, 0x0f, 6, 128), [113, 98, 83, 68, 53, 38], 'IT W0F decreases global volume from tick zero on the 128-step scale');
assert.deepEqual(volumeSlideSequence(32, 0x20, 4, 128), [32, 34, 36, 38], 'IT W20 increases global volume after tick zero');
assert.equal(applyTrackerItVolumeSlideTick(126, 0x20, 1, 128), 128, 'IT Wxy increase clamps at global volume maximum');
assert.equal(trackerItChannelVolumeSet(32), 32, 'IT Mxx accepts an in-range channel volume');
assert.equal(trackerItChannelVolumeSet(64), 64, 'IT Mxx accepts the channel volume maximum');
assert.equal(trackerItChannelVolumeSet(65), null, 'IT Mxx ignores values above the channel volume maximum');
assert.equal(trackerItGlobalVolumeSet(32), 32, 'IT Vxx stores an in-range global volume');
assert.equal(trackerItGlobalVolumeSet(255), 128, 'IT Vxx clamps to Maxmod global volume 128');
for (let pan = 0; pan <= 255; pan += 1) {
  const expected = (pan - 128) / 128;
  assert.equal(trackerItPanByteToNormalized(pan), expected, `IT Xxx pan byte ${pan} maps to the Maxmod balance point`);
}
for (let nibble = 0; nibble <= 15; nibble += 1) {
  const panByte = nibble << 4;
  const expected = (panByte - 128) / 128;
  assert.equal(trackerItExtendedPanToNormalized(nibble), expected, `IT S8${nibble.toString(16)} maps to the Maxmod pan byte ${panByte}`);
}
assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(command => applyTrackerItRetriggerVolume(32, command)), [32, 31, 30, 28, 24, 16, 21, 16, 32, 33, 34, 36, 40, 48, 48, 64], 'Qxy applies Maxmod volume subcommands and clamps channel volume');
assert.equal(applyTrackerItRetriggerVolume(64, 0x0f), 64, 'Qxy volume increase saturates at Maxmod channel maximum');
assert.equal(applyTrackerItRetriggerVolume(3, 0x05), 0, 'Qxy volume decrease saturates at silence');
assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect: 19, parameter: 0x08 }, { note: 60, instrument: 1, effect: 19, parameter: 0x12 }]], new Map(), 2).unsupportedEffects, [], 'IT S0x/S1x are implemented fine volume slides');
assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect: 19, parameter: 0x23 }]], new Map(), 1).unsupportedEffects, [], 'IT S2x legacy retrigger is implemented by the structural preview');
assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect: 17, parameter: 0x53 }]], new Map(), 1).unsupportedEffects, [], 'IT Qxy row retrigger is implemented by the structural preview');
assert.deepEqual(analyzeTrackerPreview('S3M', [[{ note: 60, instrument: 1, effect: 17, parameter: 0x53 }]], new Map(), 1).unsupportedEffects, [], 'S3M Qxy row retrigger is implemented by the structural preview');
for (const parameter of [0x77, 0x78]) {
  assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect: 19, parameter }]], new Map(), 1).unsupportedEffects, [], `IT S7${parameter & 0x0f} volume-envelope control is implemented by the structural preview`);
}
for (let subcommand = 0; subcommand < 16; subcommand += 1) {
  const expected = subcommand >= 3 ? [] : [19];
  assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect: 19, parameter: 0x70 | subcommand }]], new Map(), 1).unsupportedEffects, expected,
    `IT S7${subcommand.toString(16).toUpperCase()} is preview-supported only when its Maxmod behavior is handled or a true target-compatible no-op`);
}
assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect: 19, parameter: 0x73 }]], new Map(), 1).unsupportedEffects, [], 'IT S73 selects Maxmod default CUT and matches the preview channel retrigger behavior');
assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect: 19, parameter: 0x74 }]], new Map(), 1).unsupportedEffects, [], 'IT S74 continue is implemented by extending the old voice past the next note');
assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect: 19, parameter: 0x75 }]], new Map(), 1).unsupportedEffects, [], 'IT S75 note-off is implemented for the old voice when a new note triggers');
assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect: 19, parameter: 0x76 }]], new Map(), 1).unsupportedEffects, [], 'IT S76 fade is implemented for the old voice when a new note triggers');
assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect: 19, parameter: 0x79 }]], new Map(), 1).unsupportedEffects, [], 'IT S79 is a no-op in the checked-in Maxmod GBA core and the target-compatible preview');
for (const parameter of [0x30, 0x31, 0x32, 0x33, 0x40, 0x41, 0x42, 0x43]) {
  assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect: 19, parameter }]], new Map(), 1).unsupportedEffects, [19], `IT S${parameter.toString(16).toUpperCase()} is ignored by Maxmod and remains diagnosed`);
}
for (const parameter of [0x34, 0x4f]) {
  assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect: 19, parameter }]], new Map(), 1).unsupportedEffects, [19], `IT S${parameter.toString(16).toUpperCase()} outside the defined waveform range remains diagnosed`);
}
for (let effect = 1; effect <= 26; effect += 1) {
  const diagnostics = analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect, parameter: 0x01 }]], new Map(), 1);
  const expected = [9, 16, 25, 26].includes(effect) ? [effect] : [];
  assert.deepEqual(diagnostics.unsupportedEffects, expected, `IT ${String.fromCharCode(64 + effect)} command ${effect} Preview support classification`);
}
for (const [effect, parameter, expected, label] of [
  [0x52, 0x41, [], 'ASCII R maps to supported IT Rxy tremolo'],
  [0x56, 0x80, [], 'ASCII V maps to supported IT Vxx global volume'],
  [0x53, 0x31, [19], 'ASCII S maps to IT S3x and keeps the Maxmod no-op warning'],
  [0x59, 0x82, [25], 'ASCII Y maps to IT Yxy and keeps the target compatibility warning'],
  [40, 0x41, [], 'IT raw effect 40 is normalized to command H before diagnostics'],
]) {
  assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect, parameter }]], new Map(), 1).unsupportedEffects, expected, label);
}
for (let command = 1; command <= 26; command += 1) {
  const parameter = command === 19 ? 0x31 : 0x01;
  const numeric = analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect: command, parameter }]], new Map(), 1);
  const ascii = analyzeTrackerPreview('IT', [[{ note: 60, instrument: 1, effect: command + 0x40, parameter }]], new Map(), 1);
  assert.deepEqual(ascii.unsupportedEffects, numeric.unsupportedEffects, `IT ASCII ${String.fromCharCode(command + 0x40)} is diagnosed like numeric command ${command}`);
}
const bytes = new Uint8Array(256);
bytes.set([... 'IMPM'].map(character => character.charCodeAt(0)), 0);
bytes[0x26] = 1;
bytes[192] = 224;
bytes[224] = 22;
bytes[226] = 5;
bytes.set([0x81, 0x0f, 48, 2, 32, 15, 6, 0, 0x81, 0xf0, 0, 0xc0, 0x01, 50, 0, 0x81, 0x04, 0, 0, 0x81, 0x40, 0], 232);
const rows = parseItPatternRows(bytes.buffer);
assert.equal(rows[0][0].note, 48);
assert.equal(rows[0][0].instrument, 2);
assert.equal(rows[0][0].volume, 32);
assert.equal(rows[0][0].effect, 15);
const asciiSEffectModule = updateItPatternEvent(bytes.buffer, 0, 0, 0, { effect: 0x53, parameter: 0x31 });
assert.ok(parseTrackerCompatibilityWarnings(asciiSEffectModule, 'IT').includes('The default GBA build core ignores these IT effects: S3x.'), 'the compatibility scanner normalizes ASCII S before reporting target no-ops');
const asciiYEffectModule = updateItPatternEvent(bytes.buffer, 0, 0, 0, { effect: 0x59, parameter: 0x82 });
assert.ok(parseTrackerCompatibilityWarnings(asciiYEffectModule, 'IT').includes('The default GBA build core ignores these IT effects: Yxy.'), 'the compatibility scanner normalizes ASCII Y before reporting target no-ops');
const itPastNotesTodo = updateItPatternEvent(bytes.buffer, 0, 0, 0, { effect: 19, parameter: 0x72 });
assert.ok(parseTrackerCompatibilityWarnings(itPastNotesTodo, 'IT').includes('The default GBA build core ignores these IT effects: S70-S72.'), 'the compatibility scanner warns that Maxmod leaves S70-S72 past-note actions unimplemented');
assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 0, instrument: 0, effect: 19, parameter: 0x72 }]], new Map(), 1).unsupportedEffects, [19], 'IT S72 remains diagnosed as unreproduced by Preview');
const itReservedControlTodo = updateItPatternEvent(bytes.buffer, 0, 0, 0, { effect: 19, parameter: 0x7a });
assert.ok(parseTrackerCompatibilityWarnings(itReservedControlTodo, 'IT').includes('The default GBA build core ignores these IT effects: S7A-S7F.'), 'the compatibility scanner warns that Maxmod ignores reserved S7A-S7F commands');
assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 0, instrument: 0, effect: 19, parameter: 0x7a }]], new Map(), 1).unsupportedEffects, [], 'reserved S7A-S7F no-ops are target-compatible in the Preview');
const itSoundControlTodo = updateItPatternEvent(bytes.buffer, 0, 0, 0, { effect: 19, parameter: 0x91 });
assert.ok(parseTrackerCompatibilityWarnings(itSoundControlTodo, 'IT').includes('The default GBA build core ignores these IT effects: S9x.'), 'the compatibility scanner warns that Maxmod leaves S9x surround control unimplemented');
for (let parameter = 0; parameter <= 0xff; parameter += 1) {
  const subcommand = parameter >> 4;
  const subvalue = parameter & 0x0f;
  const previewUnsupported = (subcommand >= 3 && subcommand <= 6)
    || subcommand === 7 && subvalue <= 2
    || subcommand === 0x0a;
  const expectedWarnings = subcommand === 3 ? ['S3x']
    : subcommand === 4 ? ['S4x']
      : subcommand === 5 ? ['S5x']
        : subcommand === 6 ? ['S6x']
          : subcommand === 7 && subvalue <= 2 ? ['S70-S72']
            : subcommand === 7 && subvalue >= 0x0a ? ['S7A-S7F']
              : subcommand === 9 ? ['S9x']
                : subcommand === 0x0a ? ['SAx']
                  : [];
  const effectModule = updateItPatternEvent(bytes.buffer, 0, 0, 0, { effect: 19, parameter });
  const diagnostics = analyzeTrackerPreview('IT', [[{ note: 0, instrument: 0, effect: 19, parameter }]], new Map(), 1);
  assert.deepEqual(diagnostics.unsupportedEffects, previewUnsupported ? [19] : [], `IT S${parameter.toString(16).padStart(2, '0').toUpperCase()} Preview support classification`);
  const warningText = parseTrackerCompatibilityWarnings(effectModule, 'IT').join('\n');
  for (const warning of ['S3x', 'S4x', 'S5x', 'S6x', 'S70-S72', 'S7A-S7F', 'S9x', 'SAx']) {
    assert.equal(warningText.includes(warning), expectedWarnings.includes(warning), `IT S${parameter.toString(16).padStart(2, '0').toUpperCase()} build warning classification for ${warning}`);
  }
}
const asciiOEffectModule = updateItPatternEvent(bytes.buffer, 0, 0, 0, { effect: 0x4f, parameter: 0x08 });
assert.equal(parseItPatternRows(asciiOEffectModule)[0][0].effect, 0x0f, 'editing IT Oxx writes the five-bit tracker command ID, not an ASCII byte');
assert.equal(rows[0][0].parameter, 6);
assert.deepEqual(rows[1][0], rows[0][0], 'IT masks reuse the previous note, instrument, volume, and effect on the same channel');
const instrumentAbsentBytes = new Uint8Array(bytes);
instrumentAbsentBytes[241] = 0x10;
const instrumentAbsentRows = parseItPatternRows(instrumentAbsentBytes.buffer);
assert.equal(instrumentAbsentRows[1][0].instrument, 0, 'IT note-only reuse leaves the instrument value implicit');
assert.equal(instrumentAbsentRows[1][0].instrumentPresent, false, 'IT note-only reuse is distinguishable from an explicit instrument column');
let rememberedItInstrument = 0;
const itInstrumentEvents = [
  { note: 60, notePresent: true, instrument: 1, instrumentPresent: true },
  { note: 61, notePresent: true, instrument: 0, instrumentPresent: true },
  { note: 62, notePresent: true, instrument: 0, instrumentPresent: false },
  { note: 0, notePresent: false, instrument: 1, instrumentPresent: true },
  { note: 63, notePresent: true, instrument: 0, instrumentPresent: false },
];
const itInstrumentTriggers = itInstrumentEvents.map(event => {
  rememberedItInstrument = trackerItInstrumentMemoryAfterEvent(event, rememberedItInstrument);
  return trackerItEventTriggersNote(event, rememberedItInstrument);
});
assert.deepEqual(itInstrumentTriggers, [true, false, false, false, true],
  'an explicit IT instrument zero suppresses that note and clears instrument memory until a new instrument is selected');
assert.equal(rows[2][63].note, 50, 'IT marker 64 addresses tracker channel 64');
assert.equal(rows[3][0].volumePresent, true, 'an explicit IT volume zero remains distinguishable from an absent volume column');
assert.equal(rows[4][0].volumePresent, true, 'an IT reused volume zero retains its column presence');
const channel64Edit = updateItPatternEvent(bytes.buffer, 0, 2, 63, { note: 51 });
assert.equal(parseItPatternRows(channel64Edit, 0, 3)[2][63].note, 51, 'the IT writer encodes zero-based editor channel 63 as IT channel 64');
const explicitZeroVolumeEdit = updateItPatternEvent(bytes.buffer, 0, 3, 0, { effect: 1, parameter: 6 });
assert.equal(parseItPatternRows(explicitZeroVolumeEdit, 0, 5)[3][0].volumePresent, true, 'IT rewriting preserves an explicit zero volume column');
const shooterIt = fs.readFileSync(path.resolve('templateEngineGame/shooter_game/assets/musics/minor_boss_r.it'));
const shooterItBuffer = shooterIt.buffer.slice(shooterIt.byteOffset, shooterIt.byteOffset + shooterIt.byteLength);
const shooterItInfo = parseTrackerModule(shooterItBuffer, 'it');
assert.equal(shooterItInfo.format, 'IT');
assert.equal(shooterItInfo.speed, shooterIt[0x32] || 6);
assert.equal(shooterItInfo.tempo, shooterIt[0x33] >= 32 ? shooterIt[0x33] : 125);
assert.ok(parseTrackerPlaybackRows(shooterItBuffer, 'IT', 2048).length > 0, 'real Shooter IT should produce ordered playback rows');
for (const filename of ['minor_boss_r.it', 'battle_clean.it']) {
  const fileBytes = fs.readFileSync(path.resolve('templateEngineGame/shooter_game/assets/musics', filename));
  const fileBuffer = fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength);
  const fileInfo = parseTrackerModule(fileBuffer, 'IT');
  const filePositions = [];
  const fileRows = parseTrackerPlaybackRows(fileBuffer, 'IT', 65_536, position => filePositions.push(position));
  const allPatternRows = Array.from({ length: fileInfo.patterns }, (_, patternIndex) => parseItPatternRows(fileBuffer, patternIndex, 256)).flat();
  const fileSamples = parseItSamples(fileBuffer);
  assert.ok(fileRows.length > 0, `${filename} should expand to ordered playback rows`);
  assert.equal(filePositions.length, fileRows.length, `${filename} should retain one source position for each playback row`);
  assert.deepEqual(parseTrackerCompatibilityWarnings(fileBuffer, 'IT'), [], `${filename} should not have IT features rejected by the build core`);
  assert.deepEqual(analyzeTrackerPreview('IT', allPatternRows, fileSamples, fileInfo.channels).unsupportedEffects, [], `${filename} preview effects should remain supported across every pattern`);
  if (filename === 'minor_boss_r.it') {
    const noteEvents = [];
    const effectCounts = new Map();
    for (let playbackRow = 0; playbackRow < fileRows.length; playbackRow += 1) {
      for (let channel = 0; channel < fileRows[playbackRow].length; channel += 1) {
        const event = fileRows[playbackRow][channel];
        if (!event) continue;
        if (event.note > 0 && event.note < 254) noteEvents.push({ playbackRow, ...filePositions[playbackRow], channel, note: event.note, instrument: event.instrument });
        if (event.effect) effectCounts.set(event.effect, (effectCounts.get(event.effect) ?? 0) + 1);
      }
    }
    assert.equal(fileRows.length, 1_984, 'minor_boss_r.it expands to the full 28-order musical timeline');
    assert.equal(noteEvents.length, 2_832, 'minor_boss_r.it retains every note in playback order');
    assert.deepEqual(filePositions[0], { order: 0, pattern: 0, row: 0 }, 'the real IT song starts at its first source row');
    assert.deepEqual(filePositions.at(-1), { order: 27, pattern: 17, row: 63 }, 'the real IT song ends at the final source row');
    assert.deepEqual([...effectCounts.entries()].sort((a, b) => a[0] - b[0]), [[1, 8], [2, 1], [3, 27], [5, 4]], 'the expanded real IT timeline retains its A/B/C/E effect events');
    assert.deepEqual(noteEvents[0], { playbackRow: 0, order: 0, pattern: 0, row: 0, channel: 0, note: 48, instrument: 3 }, 'the first real IT note retains its source coordinates and instrument');
    assert.deepEqual(noteEvents.at(-1), { playbackRow: 1_982, order: 27, pattern: 17, row: 62, channel: 4, note: 58, instrument: 3 }, 'the final real IT note retains its source coordinates and instrument');
  }
}
const flowIt = new Uint8Array(352);
flowIt.set([... 'IMPM'].map(character => character.charCodeAt(0)), 0);
flowIt[0x20] = 3; flowIt[0x26] = 3;
flowIt.set([0, 1, 2], 192);
const writeFlowU16 = (offset, value) => { flowIt[offset] = value & 0xff; flowIt[offset + 1] = value >> 8; };
const writeFlowU32 = (offset, value) => { flowIt[offset] = value & 0xff; flowIt[offset + 1] = (value >> 8) & 0xff; flowIt[offset + 2] = (value >> 16) & 0xff; flowIt[offset + 3] = value >> 24; };
writeFlowU32(195, 224); writeFlowU32(199, 256); writeFlowU32(203, 288);
const writeFlowPattern = (offset, packed, rows) => {
  writeFlowU16(offset, packed.length);
  writeFlowU16(offset + 2, rows);
  flowIt.set(packed, offset + 8);
};
writeFlowPattern(224, [0x81, 0x08, 2, 1, 0], 1); // B01 to order 1.
writeFlowPattern(256, [0x81, 0x03, 60, 1, 0, 0x81, 0x08, 3, 0, 0], 2); // Note, then C00.
writeFlowPattern(288, [0x81, 0x03, 64, 1, 0], 1);
const flowItPositions = [];
const flowItRows = parseTrackerPlaybackRows(flowIt.buffer, 'IT', 4, position => flowItPositions.push(position));
assert.equal(flowItRows.length, 4, 'IT Bxx/Cxx flow expands only the selected orders and rows');
assert.deepEqual(flowItPositions, [
  { order: 0, pattern: 0, row: 0 },
  { order: 1, pattern: 1, row: 0 },
  { order: 1, pattern: 1, row: 1 },
  { order: 2, pattern: 2, row: 0 },
], 'IT playback positions retain the source order, pattern, and row through Bxx/Cxx jumps');
assert.equal(flowItRows[0][0].effect, 2);
assert.equal(flowItRows[0][0].parameter, 1);
assert.equal(flowItRows[1][0].note, 60, 'IT B01 enters the target order');
assert.equal(flowItRows[2][0].effect, 3);
assert.equal(flowItRows[3][0].note, 64, 'IT C00 advances to row zero of the next order');
const loopIt = new Uint8Array(320);
loopIt.set([... 'IMPM'].map(character => character.charCodeAt(0)), 0);
loopIt[0x20] = 1; loopIt[0x26] = 1; loopIt[192] = 0;
const loopWriteU16 = (offset, value) => { loopIt[offset] = value & 0xff; loopIt[offset + 1] = value >> 8; };
const loopWriteU32 = (offset, value) => { loopIt[offset] = value & 0xff; loopIt[offset + 1] = (value >> 8) & 0xff; loopIt[offset + 2] = (value >> 16) & 0xff; loopIt[offset + 3] = value >> 24; };
loopWriteU32(193, 224);
const loopPackedRows = [0x81, 0x08, 19, 0xb0, 0, 0x81, 0x01, 60, 0, 0x81, 0x09, 61, 19, 0xb2, 0, 0x81, 0x01, 62, 0];
loopWriteU16(224, loopPackedRows.length); loopWriteU16(226, 4); loopIt.set(loopPackedRows, 232);
const loopedPositions = [];
const loopedRows = parseTrackerPlaybackRows(loopIt.buffer, 'IT', 32, position => loopedPositions.push(position));
assert.deepEqual(loopedRows.map(row => row.find(event => event.note > 0)?.note ?? 0), [0, 60, 61, 0, 60, 61, 0, 60, 61, 62],
  'IT SB0/SB2 expands three passes of rows 0-2 before continuing to row 3');
assert.deepEqual(loopedPositions.map(({ order, pattern, row }) => [order, pattern, row]), [
  [0, 0, 0], [0, 0, 1], [0, 0, 2],
  [0, 0, 0], [0, 0, 1], [0, 0, 2],
  [0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 0, 3],
], 'IT pattern-loop callbacks preserve the source row each time Maxmod replays it');
assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 0, instrument: 0, effect: 19, parameter: 0xb2 }]], new Map(), 1).unsupportedEffects, [], 'IT SBx pattern loops are target-supported');
assert.deepEqual(parseTrackerCompatibilityWarnings(loopIt.buffer, 'IT'), [], 'IT SBx loop commands do not produce a build compatibility warning');
for (const parameter of [0xc3, 0xd3, 0xe3]) {
  assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 0x40, notePresent: true, instrument: 1, effect: 19, parameter }]], new Map(), 1).unsupportedEffects, [],
    `IT S${(parameter >> 4).toString(16).toUpperCase()}x cut/delay command ${parameter.toString(16).toUpperCase()} is supported`);
}
const shooterItSamples = parseItSamples(shooterItBuffer);
const shooterItRates = [...shooterItSamples.values()].flatMap(sample => [sample, ...(sample.variants ?? [])]).map(sample => sample.sampleRate);
assert.ok(shooterItRates.length > 0, 'real Shooter IT should expose uncompressed samples');
assert.ok(shooterItRates.every(rate => rate >= 3000 && rate <= 768000), `IT sample rates must be valid Web Audio rates: ${shooterItRates.join(', ')}`);
assert.ok([...shooterItSamples.values()].every(sample => sample.rootNote === 61), 'IT C5 speed maps to canonical pitch 61 because IT note fields are zero-based');
assert.equal(shooterItInfo.instruments, 0, 'the real Shooter IT fixture is sample mode');
const shooterFirstPattern = parseItPatternRows(shooterItBuffer, 0, 256);
const shooterFirstSampleNote = shooterFirstPattern.flatMap((row, rowIndex) => row.map((event, channelIndex) => ({ event, rowIndex, channelIndex })))
  .find(({ event }) => event.note > 0 && event.note < 254 && event.instrument > 0 && shooterItSamples.get(event.instrument)?.samples.length);
assert.ok(shooterFirstSampleNote, 'the first real IT pattern should contain a sample-mode note with decoded PCM');
const shooterSamplePcm = shooterItSamples.get(shooterFirstSampleNote.event.instrument).samples;
const shooterPatternEdit = updateItPatternEvent(shooterItBuffer, 0, shooterFirstSampleNote.rowIndex, shooterFirstSampleNote.channelIndex, { note: shooterFirstSampleNote.event.note + 1 });
const shooterEditedRows = parseItPatternRows(shooterPatternEdit, 0, 256);
assert.equal(shooterEditedRows[shooterFirstSampleNote.rowIndex][shooterFirstSampleNote.channelIndex].note, shooterFirstSampleNote.event.note + 1);
assert.notEqual(shooterEditedRows[shooterFirstSampleNote.rowIndex][shooterFirstSampleNote.channelIndex].volumePresent, true, 'rewriting a real IT row does not invent an explicit zero-volume column');
assert.deepEqual(parseItSamples(shooterPatternEdit).get(shooterFirstSampleNote.event.instrument).samples, shooterSamplePcm, 'writing an IT pattern must leave the original decoded sample PCM unchanged');
const sampleBytes = new Uint8Array(806);
sampleBytes.set([... 'IMPM'].map(character => character.charCodeAt(0)), 0);
sampleBytes[0x2a] = 0; sampleBytes[0x2b] = 2;
sampleBytes[0x22] = 1;
sampleBytes[0x24] = 2;
sampleBytes[192] = 0; sampleBytes[193] = 1;
sampleBytes[196] = 0; sampleBytes[197] = 2; sampleBytes[198] = 0; sampleBytes[199] = 0;
sampleBytes[200] = 0x58; sampleBytes[201] = 0x02; sampleBytes[202] = 0; sampleBytes[203] = 0;
sampleBytes.set([... 'IMPI'].map(character => character.charCodeAt(0)), 256);
sampleBytes[320] = 0; sampleBytes[322] = 13;
sampleBytes[321] = 1; sampleBytes[323] = 2;
sampleBytes.set([... 'IMPS'].map(character => character.charCodeAt(0)), 512);
sampleBytes.set([... 'IMPS'].map(character => character.charCodeAt(0)), 600);
sampleBytes[560] = 2; sampleBytes[648] = 2;
const writeU32 = (offset, value) => { sampleBytes[offset] = value & 0xff; sampleBytes[offset + 1] = (value >> 8) & 0xff; sampleBytes[offset + 2] = (value >> 16) & 0xff; sampleBytes[offset + 3] = value >> 24; };
writeU32(584, 680); writeU32(672, 700); sampleBytes[680] = 16; sampleBytes[681] = 32; sampleBytes[700] = 48; sampleBytes[701] = 64;
const itSamples = parseItSamples(sampleBytes.buffer);
assert.equal(itSamples.get(1)?.noteMap?.[0], 0);
assert.equal(itSamples.get(1)?.noteMap?.[1], 1);
assert.equal(itSamples.get(1)?.rootNote, 61, 'IT sample C5 speed reference maps to canonical pitch 61');
assert.equal(itSamples.get(1)?.noteTranspose?.[0], 0);
assert.equal(itSamples.get(1)?.noteTranspose?.[1], 12);
assert.equal(itSamples.get(1)?.variants?.length, 2);
const flattenedInstrumentModule = flattenItInstrumentModeForBuild(sampleBytes.buffer);
assert.ok(flattenedInstrumentModule, 'valid IT instrument mode should produce build-compatible sample mode');
assert.equal(new DataView(flattenedInstrumentModule).getUint16(0x22, true), 0);
assert.equal(new DataView(flattenedInstrumentModule).getUint16(0x2c, true) & 0x04, 0);
assert.equal(new DataView(flattenedInstrumentModule).getUint32(192, true), 512, 'sample pointers move into the compacted sample table');
sampleBytes[512 + 0x12] |= 0x08;
assert.match(parseTrackerCompatibilityWarnings(sampleBytes.buffer, 'IT')[0], /compression/);
console.log('IT tracker parser native contract passed.');

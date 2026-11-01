import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Project safety margins, not hardware limits or measured runtime free RAM.
export const DEFAULT_MIN_IWRAM_TAIL = 8 * 1024;
export const DEFAULT_MIN_EWRAM_TAIL = 32 * 1024;
const REQUIRED_EWRAM_STATES = ['GraphicsManager::instance()::gm', 'ScriptCommand::instance()::sc'];

function armTool(name) {
  const arm = process.env.DEVKITARM || (process.env.DEVKITPRO && path.join(process.env.DEVKITPRO, 'devkitARM'));
  const executable = `arm-none-eabi-${name}${process.platform === 'win32' ? '.exe' : ''}`;
  return arm ? path.join(arm, 'bin', executable) : executable;
}

function runTool(name, args) {
  const result = spawnSync(armTool(name), args, { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${name} failed: ${result.error?.message ?? result.stderr.trim()}`);
  }
  return result.stdout;
}

export function inspectGbaMemory(elf, { minIwramTail = DEFAULT_MIN_IWRAM_TAIL, minEwramTail = DEFAULT_MIN_EWRAM_TAIL } = {}) {
  for (const [name, value] of Object.entries({ minIwramTail, minEwramTail })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a nonnegative byte count`);
  }
  const filename = path.resolve(elf);
  const magic = fs.readFileSync(filename).subarray(0, 4);
  if (!magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) throw new Error('Pass a generated ELF, not a GBA ROM');
  const headers = runTool('objdump', ['-h', filename]).split(/\r?\n/);
  const sections = [];
  for (let index = 0; index < headers.length; index += 1) {
    const match = /^\s*\d+\s+(\S+)\s+([\da-f]+)\s+([\da-f]+)\s+[\da-f]+\s+[\da-f]+/i.exec(headers[index]);
    if (!match || !/\bALLOC\b/.test(headers[index + 1] ?? '')) continue;
    const size = Number.parseInt(match[2], 16);
    if (size > 0) sections.push({ name: match[1], size, address: Number.parseInt(match[3], 16) });
  }
  const symbols = runTool('nm', ['-S', '-C', filename]).split(/\r?\n/).flatMap(line => {
    const match = /^\s*([\da-f]+)\s+(?:([\da-f]+)\s+)?([a-z])\s+(.+)$/i.exec(line);
    return match ? [{ address: Number.parseInt(match[1], 16), size: match[2] ? Number.parseInt(match[2], 16) : 0, name: match[4].trim() }] : [];
  });
  const errors = [];
  const regions = [
    { name: 'IWRAM', start: 0x03000000, end: 0x03008000, minTail: minIwramTail },
    { name: 'EWRAM', start: 0x02000000, end: 0x02040000, minTail: minEwramTail },
  ].map(region => {
    const allocated = sections.filter(section => section.address < region.end && section.address + section.size > region.start);
    if (!allocated.length) errors.push(`No allocated ${region.name} sections found; check the target ELF`);
    let staticEnd = region.start;
    for (const section of allocated) {
      if (section.address < region.start || section.address + section.size > region.end) {
        errors.push(`${section.name} exceeds ${region.name}`);
      }
      staticEnd = Math.max(staticEnd, section.address + section.size);
    }
    let availableEnd = region.end;
    if (region.name === 'EWRAM') {
      const heapStart = symbols.find(symbol => symbol.name === '__eheap_start');
      const heapEnd = symbols.find(symbol => symbol.name === '__eheap_end');
      if (heapStart) staticEnd = Math.max(staticEnd, heapStart.address);
      if (heapEnd) {
        if (heapEnd.address < region.start || heapEnd.address > region.end) errors.push('EWRAM heap end is outside physical EWRAM');
        availableEnd = Math.min(availableEnd, heapEnd.address);
      }
    }
    const tail = Math.max(0, availableEnd - staticEnd);
    if (tail < region.minTail) errors.push(`${region.name} static tail is ${tail} bytes; minimum project margin is ${region.minTail} bytes`);
    return { ...region, availableEnd, staticEnd, staticSpan: staticEnd - region.start, tail, sections: allocated };
  });
  const motionStateName = 'ActorMotionManager::instance()::manager';
  const scriptStateName = 'ScriptCommand::instance()::sc';
  const directory = path.dirname(path.resolve(filename));
  const manifestFile = path.join(directory, 'runtime-feature-manifest.json');
  let scriptExcluded = false;
  if (fs.existsSync(manifestFile)) {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const featuresFile = path.join(directory, 'include/gba_studio_features.h');
    scriptExcluded = manifest.selectionApplied === true && Array.isArray(manifest.modules) && !manifest.modules.includes('scripts')
      && Array.isArray(manifest.sourceFiles) && !manifest.sourceFiles.includes('src/script_command_manager.cpp')
      && Array.isArray(manifest.eventCodes) && manifest.eventCodes.length === 0
      && Array.isArray(manifest.scriptIds) && manifest.scriptIds.length === 0
      && fs.existsSync(featuresFile) && /^#define GBA_STUDIO_FEATURE_SCRIPTS 0\s*$/m.test(fs.readFileSync(featuresFile, 'utf8'))
      && !fs.existsSync(path.join(directory, 'src/script_command_manager.cpp'));
  }
  if (scriptExcluded && symbols.some(symbol => symbol.name === scriptStateName)) errors.push('Excluded ScriptCommand state remains in the ELF; inspect incremental project objects');
  const requiredStates = REQUIRED_EWRAM_STATES.filter(name => name !== scriptStateName || !scriptExcluded);
  const checkedStates = [...requiredStates, ...(symbols.some(symbol => symbol.name === motionStateName) ? [motionStateName] : [])];
  const singletons = checkedStates.flatMap(name => {
    // Exact names exclude the tiny "guard variable for ..." entries in IWRAM.
    const symbol = symbols.find(entry => entry.name === name);
    if (!symbol) {
      errors.push(`Missing ${name}; use the full, unstripped GBA Studio ELF`);
      return [];
    }
    if (symbol.address < 0x02000000 || symbol.address + symbol.size > 0x02040000) errors.push(`${name} must remain in EWRAM`);
    return [symbol];
  });
  return { elf: filename, regions, singletons, errors };
}

export function formatGbaMemoryReport(report) {
  const kib = bytes => `${(bytes / 1024).toFixed(1)} KiB`;
  return [
    ...report.regions.map(region => `${region.name}: static span ${kib(region.staticSpan)}, remaining static tail ${kib(region.tail)} (minimum ${kib(region.minTail)})`),
    ...report.singletons.map(symbol => `${symbol.name}: 0x${symbol.address.toString(16).padStart(8, '0')} (${kib(symbol.size)})`),
    'Static tail excludes runtime stack, IRQ stack and dynamic allocations; test peak runtime paths too.',
    ...report.errors.map(error => `FAIL: ${error}`),
  ].join('\n');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    const elf = args.find(arg => !arg.startsWith('--'));
    if (!elf || args.includes('--help')) {
      console.log('Usage: node tools/verification/verify-gba-memory.mjs <project.elf> [--min-iwram-tail=8192] [--min-ewram-tail=32768]');
      process.exitCode = args.includes('--help') ? 0 : 1;
    } else {
      const options = {};
      for (const arg of args.filter(arg => arg.startsWith('--'))) {
        const match = /^--min-(iwram|ewram)-tail=(\d+)$/.exec(arg);
        if (!match) throw new Error(`Unknown option: ${arg}`);
        options[match[1] === 'iwram' ? 'minIwramTail' : 'minEwramTail'] = Number(match[2]);
      }
      const report = inspectGbaMemory(elf, options);
      console.log(formatGbaMemoryReport(report));
      if (report.errors.length) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

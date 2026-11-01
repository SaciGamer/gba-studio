export type MusicModuleFormat = 'MOD' | 'XM' | 'S3M' | 'IT';

export interface MusicEditorFormatCapabilities {
  maxInstruments?: number;
  patternName: boolean;
  patternLength: boolean;
  patternOrder: boolean;
  noteVolume: boolean;
  sampleVolumeLoop: boolean;
  sampleTuning: boolean;
  sampleFineTune: boolean;
  createInstrument: boolean;
  importWavSample: boolean;
  tempo: boolean;
  romPreview: boolean;
}

const capabilities: Record<MusicModuleFormat, MusicEditorFormatCapabilities> = {
  MOD: {
    patternName: false, patternLength: false, patternOrder: false, noteVolume: false,
    sampleVolumeLoop: true, sampleTuning: false, sampleFineTune: true,
    createInstrument: false, importWavSample: true, tempo: false, romPreview: true,
  },
  XM: {
    patternName: true, patternLength: true, patternOrder: true, noteVolume: true,
    sampleVolumeLoop: true, sampleTuning: true, sampleFineTune: true,
    createInstrument: true, importWavSample: true, tempo: true, romPreview: true,
  },
  S3M: {
    patternName: false, patternLength: false, patternOrder: false, noteVolume: false,
    sampleVolumeLoop: true, sampleTuning: false, sampleFineTune: false,
    createInstrument: false, importWavSample: true, tempo: false, romPreview: true,
  },
  IT: {
    patternName: false, patternLength: false, patternOrder: false, noteVolume: false,
    sampleVolumeLoop: false, sampleTuning: false, sampleFineTune: false,
    createInstrument: false, importWavSample: true, tempo: false, romPreview: true,
  },
};

const unsupportedCapabilities: MusicEditorFormatCapabilities = {
  patternName: false, patternLength: false, patternOrder: false, noteVolume: false,
  sampleVolumeLoop: false, sampleTuning: false, sampleFineTune: false,
  createInstrument: false, importWavSample: false, tempo: false, romPreview: false,
};

export function getMusicEditorFormatCapabilities(format: string, canonicalProject = false): MusicEditorFormatCapabilities {
  if (canonicalProject && format in capabilities) {
    return { ...capabilities[format as MusicModuleFormat], maxInstruments: format === 'MOD' ? 31 : format === 'S3M' ? 99 : 128, patternName: true, patternOrder: true,
      patternLength: format === 'XM' || format === 'IT', createInstrument: true,
      sampleVolumeLoop: true, noteVolume: true, tempo: true };
  }
  return capabilities[format as MusicModuleFormat] ?? unsupportedCapabilities;
}

export function canCreateScratchInstrument(format: string, scratch: boolean): boolean {
  return scratch && getMusicEditorFormatCapabilities(format).createInstrument;
}

export function canImportWavSample(format: string, scratch: boolean): boolean {
  return format === 'MOD' || format === 'XM' || format === 'S3M' || format === 'IT';
}

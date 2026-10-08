import { Alert, Button, Card, Descriptions, Empty, Flex, Select, Spin, Tag, Typography } from 'antd';
import { PauseOutlined, PlayCircleOutlined } from '@ant-design/icons';
import React, { useEffect, useRef, useState } from 'react';
import { analyzeTrackerPreview, isTrackerExtension, parseItPatternRows, parseItSamples, parseS3mPatternRows, parseS3mSamples, parseTrackerCompatibilityWarnings, parseTrackerModule, parseTrackerPlaybackRows, parseXmPatternRows, parseXmSamples, TrackerModuleInfo, TrackerPatternEvent, TrackerSample, updateItPatternEvent, updateItSample, updateS3mPatternEvent, updateS3mSample, updateXmPatternEvent, updateXmSample } from '@/utils/trackerModule';
import { ModEvent, ModPlayer, parseModModule, ParsedMod, updateModEvent, updateModSample } from '@/utils/modPlayer';
import { TrackerPreviewPlayer } from '@/utils/trackerPreviewPlayer';

interface TrackerModuleViewerProps {
  url: string;
  extension: string;
  filename?: string;
  onSaved?: () => void;
}

const TrackerModuleViewer: React.FC<TrackerModuleViewerProps> = ({ url, extension, filename, onSaved }) => {
  const [info, setInfo] = useState<TrackerModuleInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mod, setMod] = useState<ParsedMod | null>(null);
  const [playing, setPlaying] = useState(false);
  const [modUndo, setModUndo] = useState<ParsedMod[]>([]);
  const [modRedo, setModRedo] = useState<ParsedMod[]>([]);
  const [mutedChannels, setMutedChannels] = useState<boolean[]>([]);
  const [channelVolumes, setChannelVolumes] = useState<number[]>([]);
  const [channelPans, setChannelPans] = useState<number[]>([]);
  const [selectedCell, setSelectedCell] = useState({ row: 0, channel: 0 });
  const [selectedPattern, setSelectedPattern] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState(0);
  const [xmPatternRows, setXmPatternRows] = useState<TrackerPatternEvent[][]>([]);
  const [s3mPatternRows, setS3mPatternRows] = useState<TrackerPatternEvent[][]>([]);
  const [itPatternRows, setItPatternRows] = useState<TrackerPatternEvent[][]>([]);
  const [moduleBytes, setModuleBytes] = useState<ArrayBuffer | null>(null);
  const [trackerSamples, setTrackerSamples] = useState<Map<number, TrackerSample>>(new Map());
  const [xmUndo, setXmUndo] = useState<ArrayBuffer[]>([]);
  const [xmRedo, setXmRedo] = useState<ArrayBuffer[]>([]);
  const [s3mUndo, setS3mUndo] = useState<ArrayBuffer[]>([]);
  const [s3mRedo, setS3mRedo] = useState<ArrayBuffer[]>([]);
  const [itUndo, setItUndo] = useState<ArrayBuffer[]>([]);
  const [itRedo, setItRedo] = useState<ArrayBuffer[]>([]);
  const player = useRef(new ModPlayer());
  const trackerPlayer = useRef(new TrackerPreviewPlayer());
  const trackerTimer = useRef<number | null>(null);
  const trackerGeneration = useRef(0);
  const [trackerPlaying, setTrackerPlaying] = useState(false);
  const mixerStorageKey = `gba-studio-tracker-mixer:${url}`;

  useEffect(() => {
    if (!info || mutedChannels.length === 0) return;
    localStorage.setItem(mixerStorageKey, JSON.stringify({ muted: mutedChannels, volumes: channelVolumes, pans: channelPans }));
  }, [channelPans, channelVolumes, info, mixerStorageKey, mutedChannels]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setInfo(null);
    setMod(null);
    setPlaying(false);
    setTrackerPlaying(false);
    setModUndo([]);
    setModRedo([]);
    setMutedChannels([]);
    setChannelVolumes([]);
    setChannelPans([]);
    setSelectedCell({ row: 0, channel: 0 });
    setSelectedPattern(0);
    setSelectedOrder(0);
    setXmPatternRows([]);
    setS3mPatternRows([]);
    setItPatternRows([]);
    setModuleBytes(null);
    setTrackerSamples(new Map());
    setXmUndo([]);
    setXmRedo([]);
    setS3mUndo([]);
    setS3mRedo([]);
    setItUndo([]);
    setItRedo([]);
    if (!isTrackerExtension(extension)) {
      setLoading(false);
      return;
    }
    void window.electronAPI.readImageBytes(url).then((bytes: ArrayBuffer) => {
      if (!cancelled) {
        setModuleBytes(bytes);
        const format = extension.toUpperCase();
        setTrackerSamples(format === 'XM' ? parseXmSamples(bytes) : format === 'S3M' ? parseS3mSamples(bytes) : format === 'IT' ? parseItSamples(bytes) : new Map());
        setInfo(parseTrackerModule(bytes, extension));
        const parsedInfo = parseTrackerModule(bytes, extension);
        const defaultMixer = {
          muted: Array.from({ length: parsedInfo.channels }, () => false),
          volumes: Array.from({ length: parsedInfo.channels }, () => 1),
          pans: Array.from({ length: parsedInfo.channels }, () => 0),
        };
        let savedMixer: Partial<typeof defaultMixer> = {};
        try {
          savedMixer = JSON.parse(localStorage.getItem(`gba-studio-tracker-mixer:${url}`) ?? '{}');
        } catch {
          savedMixer = {};
        }
        const channels = parsedInfo.channels;
        setMutedChannels(Array.from({ length: channels }, (_, index) => savedMixer.muted?.[index] === true));
        setChannelVolumes(Array.from({ length: channels }, (_, index) => Number.isFinite(savedMixer.volumes?.[index]) ? Math.max(0, Math.min(1, Number(savedMixer.volumes?.[index]))) : defaultMixer.volumes[index]));
        setChannelPans(Array.from({ length: channels }, (_, index) => Number.isFinite(savedMixer.pans?.[index]) ? Math.max(-1, Math.min(1, Number(savedMixer.pans?.[index]))) : defaultMixer.pans[index]));
        if (extension.toUpperCase() === 'MOD') {
          const parsed = parseModModule(bytes);
          setMod(parsed);
          if (!parsed) setMutedChannels([]);
        }
        if (extension.toUpperCase() === 'XM') setXmPatternRows(parseXmPatternRows(bytes));
        if (extension.toUpperCase() === 'S3M') setS3mPatternRows(parseS3mPatternRows(bytes));
        if (extension.toUpperCase() === 'IT') setItPatternRows(parseItPatternRows(bytes));
      }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to inspect module.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; trackerGeneration.current += 1; if (trackerTimer.current !== null) window.clearTimeout(trackerTimer.current); player.current.dispose(); trackerPlayer.current.stop(); };
  }, [extension, url]);

  useEffect(() => {
    if (!moduleBytes || extension.toUpperCase() === 'MOD') return;
    const format = extension.toUpperCase();
    if (format === 'XM') setXmPatternRows(parseXmPatternRows(moduleBytes, selectedPattern));
    if (format === 'S3M') setS3mPatternRows(parseS3mPatternRows(moduleBytes, selectedPattern));
    if (format === 'IT') setItPatternRows(parseItPatternRows(moduleBytes, selectedPattern));
  }, [extension, moduleBytes, selectedPattern]);

  useEffect(() => {
    if (!moduleBytes || !info || info.format === 'MOD') return;
    setTrackerSamples(info.format === 'XM' ? parseXmSamples(moduleBytes) : info.format === 'S3M' ? parseS3mSamples(moduleBytes) : parseItSamples(moduleBytes));
  }, [info, moduleBytes]);

  // This hook must remain before the loading/error returns below. Tracker
  // inspection is asynchronous, so returning before it on the first render
  // changes the hook count and triggers React's "rendered more hooks" error.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!mod || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key.toLowerCase() === 'z' && !event.shiftKey && modUndo.length) {
        event.preventDefault();
        const previous = modUndo.at(-1);
        if (!previous) return;
        setModRedo(history => [...history.slice(-31), mod]);
        setModUndo(history => history.slice(0, -1));
        setMod(previous);
      } else if ((event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)) && modRedo.length) {
        event.preventDefault();
        const next = modRedo.at(-1);
        if (!next) return;
        setModUndo(history => [...history.slice(-31), mod]);
        setModRedo(history => history.slice(0, -1));
        setMod(next);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mod, modRedo, modUndo]);

  if (loading) return <Flex justify="center" align="center" style={{ height: '100%' }}><Spin />;</Flex>;
  if (error) return <Alert type="error" showIcon message="Tracker inspection failed" description={error} />;
  if (!info || info.format === 'unknown') return <Empty description="Unknown tracker module format" />;

  const togglePlayback = async () => {
    if (!mod) return;
    if (playing) {
      player.current.stop();
      setPlaying(false);
    } else {
      player.current.load(mod);
      mutedChannels.forEach((muted, channel) => player.current.setChannelMuted(channel, muted));
      channelVolumes.forEach((volume, channel) => player.current.setChannelVolume(channel, volume));
      channelPans.forEach((pan, channel) => player.current.setChannelPan(channel, pan));
      await player.current.play();
      setPlaying(true);
    }
  };
  const toggleTrackerPreview = async () => {
    if (trackerPlaying) {
      trackerGeneration.current += 1;
      if (trackerTimer.current !== null) window.clearTimeout(trackerTimer.current);
      trackerPlayer.current.stop();
      setTrackerPlaying(false);
      return;
    }
    const generation = ++trackerGeneration.current;
    const rows = moduleBytes
      ? parseTrackerPlaybackRows(moduleBytes, info.format, 1024)
      : (info.format === 'XM' ? xmPatternRows : info.format === 'S3M' ? s3mPatternRows : itPatternRows);
    setTrackerPlaying(true);
    const durationMs = await trackerPlayer.current.play(rows, info.channels, info.speed, info.tempo, mutedChannels, trackerSamples, info.format === 'XM' || info.format === 'S3M' || info.format === 'IT' ? info.format : 'XM', channelVolumes, channelPans);
    if (generation !== trackerGeneration.current) return;
    if (!durationMs) {
      setTrackerPlaying(false);
      return;
    }
    trackerTimer.current = window.setTimeout(() => {
      trackerTimer.current = null;
      if (generation === trackerGeneration.current) setTrackerPlaying(false);
    }, durationMs);
  };

  const toggleChannel = (channel: number) => {
    const muted = !mutedChannels[channel];
    setMutedChannels(current => current.map((value, index) => index === channel ? muted : value));
    player.current.setChannelMuted(channel, muted);
    if (muted && trackerPlaying) {
      trackerGeneration.current += 1;
      if (trackerTimer.current !== null) window.clearTimeout(trackerTimer.current);
      trackerPlayer.current.stop();
      setTrackerPlaying(false);
    }
  };

  const updateChannelVolume = (channel: number, value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setChannelVolumes(current => current.map((item, index) => index === channel ? next : item));
    player.current.setChannelVolume(channel, next);
  };

  const updateChannelPan = (channel: number, value: number) => {
    const next = Math.max(-1, Math.min(1, value));
    setChannelPans(current => current.map((item, index) => index === channel ? next : item));
    player.current.setChannelPan(channel, next);
  };

  const channelMixer = <Flex gap={6} wrap="wrap" style={{ margin: '6px 0 12px' }} aria-label="Tracker channel mixer">
    {mutedChannels.map((muted, channel) => <Flex key={channel} align="center" gap={4} style={{ padding: '3px 6px', background: '#202020', borderRadius: 3 }}>
      <Button size="small" type={muted ? 'default' : 'primary'} onClick={() => toggleChannel(channel)}>{muted ? 'Unmute' : 'Mute'} CH {channel + 1}</Button>
      <label style={{ color: '#ddd', fontSize: 11 }}>Vol <input aria-label={`Channel ${channel + 1} volume`} type="range" min={0} max={100} value={Math.round((channelVolumes[channel] ?? 1) * 100)} onChange={event => updateChannelVolume(channel, Number(event.target.value) / 100)} /></label>
      <label style={{ color: '#ddd', fontSize: 11 }}>Pan <input aria-label={`Channel ${channel + 1} pan`} type="range" min={-100} max={100} value={Math.round((channelPans[channel] ?? 0) * 100)} onChange={event => updateChannelPan(channel, Number(event.target.value) / 100)} /></label>
    </Flex>)}
  </Flex>;

  const currentPattern = mod ? Math.min(Math.max(0, selectedPattern), Math.max(0, mod.patterns.length - 1)) : 0;
  const patternRows = mod?.patterns[currentPattern]?.slice(0, 16) ?? [];
  const selectedEvent: ModEvent = mod?.patterns[currentPattern]?.[selectedCell.row]?.[selectedCell.channel] ?? { period: 0, sample: 0, effect: 0, parameter: 0 };
  const editEvent = (patch: Partial<ModEvent>) => {
    if (!mod) return;
    const next = updateModEvent(mod, currentPattern, selectedCell.row, selectedCell.channel, patch);
    if (next === mod) return;
    setModUndo(history => [...history.slice(-31), mod]);
    setModRedo([]);
    setMod(next);
  };
  const editSample = (sampleIndex: number, patch: { volume?: number; loopStart?: number; loopLength?: number }) => {
    if (!mod) return;
    const next = updateModSample(mod, sampleIndex, patch);
    if (next === mod) return;
    setModUndo(history => [...history.slice(-31), mod]);
    setModRedo([]);
    setMod(next);
  };
  const undoModEdit = () => {
    const previous = modUndo.at(-1);
    if (!mod || !previous) return;
    setModRedo(history => [...history.slice(-31), mod]);
    setModUndo(history => history.slice(0, -1));
    setMod(previous);
  };
  const redoModEdit = () => {
    const next = modRedo.at(-1);
    if (!mod || !next) return;
    setModUndo(history => [...history.slice(-31), mod]);
    setModRedo(history => history.slice(0, -1));
    setMod(next);
  };
  const exportEditedMod = () => {
    if (!mod) return;
    const blob = new Blob([mod.bytes.buffer as ArrayBuffer], { type: 'audio/mod' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(info.title || 'edited-module').replace(/[^a-z0-9_-]+/gi, '_')}.mod`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const xmEvent = xmPatternRows[selectedCell.row]?.[selectedCell.channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
  const editXmEvent = (patch: Partial<TrackerPatternEvent>) => {
    if (!moduleBytes || info.format !== 'XM') return;
    const next = updateXmPatternEvent(moduleBytes, selectedPattern, selectedCell.row, selectedCell.channel, patch);
    if (next === moduleBytes) return;
    setXmUndo(history => [...history.slice(-31), moduleBytes]);
    setXmRedo([]);
    setModuleBytes(next);
  };
  const undoXmEdit = () => {
    const previous = xmUndo.at(-1);
    if (!moduleBytes || !previous) return;
    setXmRedo(history => [...history.slice(-31), moduleBytes]);
    setXmUndo(history => history.slice(0, -1));
    setModuleBytes(previous);
  };
  const redoXmEdit = () => {
    const next = xmRedo.at(-1);
    if (!moduleBytes || !next) return;
    setXmUndo(history => [...history.slice(-31), moduleBytes]);
    setXmRedo(history => history.slice(0, -1));
    setModuleBytes(next);
  };
  const s3mEvent = s3mPatternRows[selectedCell.row]?.[selectedCell.channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
  const editS3mEvent = (patch: Partial<TrackerPatternEvent>) => {
    if (!moduleBytes || info.format !== 'S3M') return;
    const next = updateS3mPatternEvent(moduleBytes, selectedPattern, selectedCell.row, selectedCell.channel, patch);
    if (next === moduleBytes) return;
    setS3mUndo(history => [...history.slice(-31), moduleBytes]);
    setS3mRedo([]);
    setModuleBytes(next);
  };
  const undoS3mEdit = () => {
    const previous = s3mUndo.at(-1);
    if (!moduleBytes || !previous) return;
    setS3mRedo(history => [...history.slice(-31), moduleBytes]);
    setS3mUndo(history => history.slice(0, -1));
    setModuleBytes(previous);
  };
  const redoS3mEdit = () => {
    const next = s3mRedo.at(-1);
    if (!moduleBytes || !next) return;
    setS3mUndo(history => [...history.slice(-31), moduleBytes]);
    setS3mRedo(history => history.slice(0, -1));
    setModuleBytes(next);
  };
  const itEvent = itPatternRows[selectedCell.row]?.[selectedCell.channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
  const editItEvent = (patch: Partial<TrackerPatternEvent>) => {
    if (!moduleBytes || info.format !== 'IT') return;
    const next = updateItPatternEvent(moduleBytes, selectedPattern, selectedCell.row, selectedCell.channel, patch);
    if (next === moduleBytes) return;
    setItUndo(history => [...history.slice(-31), moduleBytes]);
    setItRedo([]);
    setModuleBytes(next);
  };
  const undoItEdit = () => {
    const previous = itUndo.at(-1);
    if (!moduleBytes || !previous) return;
    setItRedo(history => [...history.slice(-31), moduleBytes]);
    setItUndo(history => history.slice(0, -1));
    setModuleBytes(previous);
  };
  const redoItEdit = () => {
    const next = itRedo.at(-1);
    if (!moduleBytes || !next) return;
    setItUndo(history => [...history.slice(-31), moduleBytes]);
    setItRedo(history => history.slice(0, -1));
    setModuleBytes(next);
  };
  const editTrackerSample = (sampleIndex: number, patch: { volume?: number; loopStart?: number; loopEnd?: number }) => {
    if (!moduleBytes || !info || info.format === 'MOD') return;
    const next = info.format === 'XM'
      ? updateXmSample(moduleBytes, sampleIndex, patch)
      : info.format === 'S3M'
        ? updateS3mSample(moduleBytes, sampleIndex, patch)
        : updateItSample(moduleBytes, sampleIndex, patch);
    if (next === moduleBytes) return;
    const pushUndo = info.format === 'XM' ? setXmUndo : info.format === 'S3M' ? setS3mUndo : setItUndo;
    const clearRedo = info.format === 'XM' ? setXmRedo : info.format === 'S3M' ? setS3mRedo : setItRedo;
    pushUndo(history => [...history.slice(-31), moduleBytes]);
    clearRedo([]);
    setModuleBytes(next);
  };
  const exportEditedTracker = () => {
    if (!moduleBytes || !info || info.format === 'MOD') return;
    const blob = new Blob([moduleBytes], { type: `audio/${info.format.toLowerCase()}` });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(info.title || 'edited-module').replace(/[^a-z0-9_-]+/gi, '_')}.${info.format.toLowerCase()}`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const saveEditedTrackerProject = async () => {
    if ((!moduleBytes && !mod) || !info) return;
    const sourceName = filename || `${info.title || 'module'}.${info.format.toLowerCase()}`;
    const extensionWithDot = `.${info.format.toLowerCase()}`;
    const stem = sourceName.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_') || 'module';
    const targetName = `${stem}-edited${extensionWithDot}`;
    const bytes = info.format === 'MOD' && mod ? mod.bytes : new Uint8Array(moduleBytes!);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
    }
    const result = await window.electronAPI.saveTrackerModule(targetName, btoa(binary));
    if (result?.status === 'success') onSaved?.();
  };
  const previewRows = info.format === 'XM' ? xmPatternRows : info.format === 'S3M' ? s3mPatternRows : itPatternRows;
  const diagnosticRows = mod
    ? mod.patterns.flatMap(pattern => pattern.slice(0, 1024).map(row => row.map(event => ({ note: event.period ? 1 : 0, instrument: event.sample, volume: 0, effect: event.effect, parameter: event.parameter }))))
    : moduleBytes
      ? parseTrackerPlaybackRows(moduleBytes, info.format, 1024)
      : previewRows;
  const previewDiagnostics = moduleBytes || mod ? (() => {
    const diagnostics = analyzeTrackerPreview(info.format, diagnosticRows, trackerSamples);
    return { ...diagnostics, warnings: [...parseTrackerCompatibilityWarnings(moduleBytes ?? new ArrayBuffer(0), info.format), ...diagnostics.warnings] };
  })() : null;
  const trackerOrderTable = !mod && moduleBytes ? parseTrackerOrderTable(moduleBytes, info.format) : [];

  return <Card title={info.title || 'Untitled tracker module'} style={{ width: 'min(680px, 100%)' }}>
    <Flex gap={8} wrap="wrap" style={{ marginBottom: 12 }}>
      <Tag color="blue">{info.format}</Tag>
      <Tag>{info.channels} channels</Tag>
      <Tag>{info.patterns} patterns</Tag>
      <Tag>{info.instruments} instruments</Tag>
      {mod && <Button size="small" icon={playing ? <PauseOutlined /> : <PlayCircleOutlined />} onClick={() => void togglePlayback()}>{playing ? 'Pause' : 'Play MOD preview'}</Button>}
      {!mod && <Button size="small" icon={trackerPlaying ? <PauseOutlined /> : <PlayCircleOutlined />} onClick={() => void toggleTrackerPreview()}>{trackerPlaying ? 'Pause' : `Play ${info.format} structural preview`}</Button>}
      {moduleBytes && <Button size="small" onClick={() => void saveEditedTrackerProject()}>Save edited copy to project</Button>}
    </Flex>
    {previewDiagnostics?.warnings.map(warning => <Alert key={warning} type="warning" showIcon message={warning} style={{ marginBottom: 8 }} />)}
    {mod && <>
      <Typography.Text strong>Channels</Typography.Text>
      {channelMixer}
      <Typography.Text strong>Pattern {currentPattern} preview</Typography.Text>
      <Flex align="center" gap={8} style={{ marginTop: 6 }}>
        <Typography.Text>Pattern</Typography.Text>
        <Select
          aria-label="MOD pattern"
          size="small"
          value={currentPattern}
          onChange={value => { setSelectedPattern(Number(value)); setSelectedCell({ row: 0, channel: 0 }); }}
          options={mod.patterns.map((_pattern, index) => ({ value: index, label: `Pattern ${index}` }))}
          style={{ minWidth: 140 }}
        />
        <Typography.Text>Order</Typography.Text>
        <Select
          aria-label="MOD order"
          size="small"
          value={selectedOrder}
          onChange={value => {
            const order = Number(value);
            setSelectedOrder(order);
            setSelectedPattern(mod.patternTable[order] ?? 0);
            setSelectedCell({ row: 0, channel: 0 });
          }}
          options={mod.patternTable.slice(0, mod.orders).map((pattern, order) => ({ value: order, label: `${order + 1}: Pattern ${pattern}` }))}
          style={{ minWidth: 150 }}
        />
      </Flex>
      <pre style={{ marginTop: 6, maxHeight: 180, overflow: 'auto', background: '#202020', color: '#e8e8e8', padding: 8, fontSize: 11 }}>{patternRows.map((row, rowIndex) => `${String(rowIndex).padStart(2, '0')}  ${row.map(event => event.period ? `${event.sample.toString(16).padStart(2, '0')}:${event.period.toString(16).padStart(3, '0')}:${event.effect.toString(16)}${event.parameter.toString(16).padStart(2, '0')}` : '---:---:--00').join(' | ')}`).join('\n')}</pre>
      <Typography.Text strong>Edit selected event</Typography.Text>
      <Flex gap={6} wrap="wrap" style={{ marginTop: 6 }}>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, row: Math.max(0, current.row - 1) }))}>Row −</Button>
        <Typography.Text>Row {selectedCell.row + 1}, CH {selectedCell.channel + 1}</Typography.Text>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, row: Math.min(63, current.row + 1) }))}>Row +</Button>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, channel: Math.max(0, current.channel - 1) }))}>CH −</Button>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, channel: Math.min((mod?.channels ?? 1) - 1, current.channel + 1) }))}>CH +</Button>
      </Flex>
      <Flex gap={6} wrap="wrap" style={{ marginTop: 6 }}>
        {(['period', 'sample', 'effect', 'parameter'] as const).map(field => <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{field}<input type="number" min={0} max={field === 'period' ? 4095 : field === 'sample' ? 31 : field === 'effect' ? 15 : 255} value={selectedEvent[field]} onChange={event => editEvent({ [field]: Number(event.target.value) })} style={{ width: 68 }} /></label>)}
      </Flex>
      <Typography.Text strong style={{ display: 'block', marginTop: 10 }}>Samples</Typography.Text>
      <div aria-label="MOD samples" style={{ marginTop: 6, maxHeight: 140, overflow: 'auto', background: '#202020', color: '#e8e8e8', padding: 8, fontSize: 11 }}>
        {mod.samples.map((sample, index) => <Flex key={index} align="center" gap={6} style={{ minHeight: 22 }}>
          <span style={{ flex: 1 }}>{`${String(index + 1).padStart(2, '0')} ${sample.name || '(unnamed)'} · ${sample.length} bytes · loop ${sample.loopLength > 2 ? `${sample.loopStart}+${sample.loopLength}` : 'off'}`}</span>
          <label>vol <input aria-label={`MOD sample ${index + 1} volume`} type="number" min={0} max={64} value={sample.volume} onChange={event => editSample(index, { volume: Number(event.target.value) })} style={{ width: 48 }} /></label>
          <label>start <input aria-label={`MOD sample ${index + 1} loop start`} type="number" min={0} max={sample.length} step={2} value={sample.loopStart} onChange={event => editSample(index, { loopStart: Number(event.target.value) })} style={{ width: 58 }} /></label>
          <label>len <input aria-label={`MOD sample ${index + 1} loop length`} type="number" min={0} max={sample.length - sample.loopStart} step={2} value={sample.loopLength} onChange={event => editSample(index, { loopLength: Number(event.target.value) })} style={{ width: 58 }} /></label>
        </Flex>)}
      </div>
      <Flex gap={6} wrap="wrap" style={{ marginTop: 6 }}>
        <Button size="small" onClick={undoModEdit} disabled={!modUndo.length}>Undo</Button>
        <Button size="small" onClick={redoModEdit} disabled={!modRedo.length}>Redo</Button>
        <Button size="small" onClick={exportEditedMod}>Export edited MOD</Button>
      </Flex>
    </>}
    {!mod && <>
      <Typography.Text strong>Channels</Typography.Text>
      {channelMixer}
    </>}
    {!mod && trackerOrderTable.length > 0 && <Flex align="center" gap={8} style={{ marginBottom: 8 }}>
      <Typography.Text strong>Order</Typography.Text>
      <Select
        aria-label={`${info.format} order`}
        size="small"
        value={Math.min(selectedOrder, trackerOrderTable.length - 1)}
        onChange={value => {
          const order = Number(value);
          const pattern = trackerOrderTable[order];
          setSelectedOrder(order);
          if (pattern < info.patterns) setSelectedPattern(pattern);
          setSelectedCell({ row: 0, channel: 0 });
        }}
        options={trackerOrderTable.map((pattern, order) => ({ value: order, label: `${order + 1}: ${pattern === 254 ? 'separator' : pattern === 255 ? 'end' : `Pattern ${pattern}`}` }))}
        style={{ minWidth: 160 }}
      />
    </Flex>}
    {!mod && info.patterns > 0 && <Flex align="center" gap={8} style={{ marginBottom: 8 }}>
      <Typography.Text strong>Pattern</Typography.Text>
      <Select
        aria-label={`${info.format} pattern`}
        size="small"
        value={Math.min(selectedPattern, info.patterns - 1)}
        onChange={value => setSelectedPattern(Number(value))}
        options={Array.from({ length: info.patterns }, (_, index) => ({ value: index, label: `Pattern ${index}` }))}
        style={{ minWidth: 140 }}
      />
    </Flex>}
    {info.format === 'XM' && <>
      <Typography.Text strong style={{ display: 'block', marginTop: 10 }}>XM instruments / samples</Typography.Text>
      <div aria-label="XM samples" style={{ marginTop: 6, maxHeight: 140, overflow: 'auto', background: '#202020', color: '#e8e8e8', padding: 8, fontSize: 11 }}>
        {[...trackerSamples.entries()].map(([sampleIndex, sample]) => <Flex key={sampleIndex} align="center" gap={6} style={{ minHeight: 22 }}>
          <span style={{ flex: 1 }}>{`Instrument ${String(sampleIndex).padStart(2, '0')} · ${sample.samples.length} samples · loop ${sample.loopEnd > sample.loopStart ? `${sample.loopStart}+${sample.loopEnd - sample.loopStart}` : 'off'}`}</span>
          <label>vol <input aria-label={`XM sample ${sampleIndex} volume`} type="number" min={0} max={64} value={sample.volume ?? 64} onChange={event => editTrackerSample(sampleIndex, { volume: Number(event.target.value) })} style={{ width: 48 }} /></label>
          <label>start <input aria-label={`XM sample ${sampleIndex} loop start`} type="number" min={0} max={sample.samples.length} value={sample.loopStart} onChange={event => editTrackerSample(sampleIndex, { loopStart: Number(event.target.value) })} style={{ width: 58 }} /></label>
          <label>end <input aria-label={`XM sample ${sampleIndex} loop end`} type="number" min={0} max={sample.samples.length} value={sample.loopEnd} onChange={event => editTrackerSample(sampleIndex, { loopEnd: Number(event.target.value) })} style={{ width: 58 }} /></label>
        </Flex>)}
      </div>
      <Typography.Text strong>XM pattern {selectedPattern} preview</Typography.Text>
      <pre style={{ marginTop: 6, maxHeight: 220, overflow: 'auto', background: '#202020', color: '#e8e8e8', padding: 8, fontSize: 11 }}>{xmPatternRows.map((row, rowIndex) => `${String(rowIndex).padStart(2, '0')}  ${row.map(event => event.note ? `${event.note.toString(16).padStart(2, '0')}:${event.instrument.toString(16).padStart(2, '0')}:${event.volume.toString(16).padStart(2, '0')}:${event.effect.toString(16)}${event.parameter.toString(16).padStart(2, '0')}` : '---:--:--:----').join(' | ')}`).join('\n')}</pre>
      <Typography.Text strong>Edit XM event</Typography.Text>
      <Flex gap={6} wrap="wrap" style={{ marginTop: 6 }}>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, row: Math.max(0, current.row - 1) }))}>Row −</Button>
        <Typography.Text>Row {selectedCell.row + 1}, CH {selectedCell.channel + 1}</Typography.Text>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, row: Math.min(Math.max(0, xmPatternRows.length - 1), current.row + 1) }))}>Row +</Button>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, channel: Math.max(0, current.channel - 1) }))}>CH −</Button>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, channel: Math.min((info.channels ?? 1) - 1, current.channel + 1) }))}>CH +</Button>
      </Flex>
      <Flex gap={6} wrap="wrap" style={{ marginTop: 6 }}>
        {(['note', 'instrument', 'volume', 'effect', 'parameter'] as const).map(field => <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{field}<input type="number" min={0} max={255} value={xmEvent[field]} onChange={event => editXmEvent({ [field]: Number(event.target.value) })} style={{ width: 68 }} /></label>)}
      </Flex>
      <Flex gap={6} wrap="wrap" style={{ marginTop: 6 }}>
        <Button size="small" onClick={undoXmEdit} disabled={!xmUndo.length}>Undo XM</Button>
        <Button size="small" onClick={redoXmEdit} disabled={!xmRedo.length}>Redo XM</Button>
        <Button size="small" onClick={exportEditedTracker}>Export edited XM</Button>
      </Flex>
    </>}
    {info.format === 'S3M' && <>
      <Typography.Text strong style={{ display: 'block', marginTop: 10 }}>S3M instruments / samples</Typography.Text>
      <div aria-label="S3M samples" style={{ marginTop: 6, maxHeight: 140, overflow: 'auto', background: '#202020', color: '#e8e8e8', padding: 8, fontSize: 11 }}>
        {[...trackerSamples.entries()].map(([sampleIndex, sample]) => <Flex key={sampleIndex} align="center" gap={6} style={{ minHeight: 22 }}>
          <span style={{ flex: 1 }}>{`Sample ${String(sampleIndex).padStart(2, '0')} · ${sample.samples.length} samples · loop ${sample.loopEnd > sample.loopStart ? `${sample.loopStart}+${sample.loopEnd - sample.loopStart}` : 'off'}`}</span>
          <label>vol <input aria-label={`S3M sample ${sampleIndex} volume`} type="number" min={0} max={64} value={sample.volume ?? 64} onChange={event => editTrackerSample(sampleIndex, { volume: Number(event.target.value) })} style={{ width: 48 }} /></label>
          <label>start <input aria-label={`S3M sample ${sampleIndex} loop start`} type="number" min={0} max={sample.samples.length} value={sample.loopStart} onChange={event => editTrackerSample(sampleIndex, { loopStart: Number(event.target.value) })} style={{ width: 58 }} /></label>
          <label>end <input aria-label={`S3M sample ${sampleIndex} loop end`} type="number" min={0} max={sample.samples.length} value={sample.loopEnd} onChange={event => editTrackerSample(sampleIndex, { loopEnd: Number(event.target.value) })} style={{ width: 58 }} /></label>
        </Flex>)}
      </div>
      <Typography.Text strong>S3M pattern {selectedPattern} preview</Typography.Text>
      <pre style={{ marginTop: 6, maxHeight: 220, overflow: 'auto', background: '#202020', color: '#e8e8e8', padding: 8, fontSize: 11 }}>{s3mPatternRows.map((row, rowIndex) => `${String(rowIndex).padStart(2, '0')}  ${row.map(event => event.note ? `${event.note.toString(16).padStart(2, '0')}:${event.instrument.toString(16).padStart(2, '0')}:${event.volume.toString(16).padStart(2, '0')}:${event.effect.toString(16)}${event.parameter.toString(16).padStart(2, '0')}` : '---:--:--:----').join(' | ')}`).join('\n')}</pre>
      <Typography.Text strong>Edit S3M event</Typography.Text>
      <Flex gap={6} wrap="wrap" style={{ marginTop: 6 }}>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, row: Math.max(0, current.row - 1) }))}>Row −</Button>
        <Typography.Text>Row {selectedCell.row + 1}, CH {selectedCell.channel + 1}</Typography.Text>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, row: Math.min(Math.max(0, s3mPatternRows.length - 1), current.row + 1) }))}>Row +</Button>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, channel: Math.max(0, current.channel - 1) }))}>CH −</Button>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, channel: Math.min((info.channels ?? 1) - 1, current.channel + 1) }))}>CH +</Button>
      </Flex>
      <Flex gap={6} wrap="wrap" style={{ marginTop: 6 }}>
        {(['note', 'instrument', 'volume', 'effect', 'parameter'] as const).map(field => <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{field}<input type="number" min={0} max={255} value={s3mEvent[field]} onChange={event => editS3mEvent({ [field]: Number(event.target.value) })} style={{ width: 68 }} /></label>)}
      </Flex>
      <Flex gap={6} wrap="wrap" style={{ marginTop: 6 }}>
        <Button size="small" onClick={undoS3mEdit} disabled={!s3mUndo.length}>Undo S3M</Button>
        <Button size="small" onClick={redoS3mEdit} disabled={!s3mRedo.length}>Redo S3M</Button>
        <Button size="small" onClick={exportEditedTracker}>Export edited S3M</Button>
      </Flex>
    </>}
    {info.format === 'IT' && <>
      <Typography.Text strong style={{ display: 'block', marginTop: 10 }}>IT instruments / samples</Typography.Text>
      <div aria-label="IT samples" style={{ marginTop: 6, maxHeight: 140, overflow: 'auto', background: '#202020', color: '#e8e8e8', padding: 8, fontSize: 11 }}>
        {[...trackerSamples.entries()].map(([sampleIndex, sample]) => <Flex key={sampleIndex} align="center" gap={6} style={{ minHeight: 22 }}>
          <span style={{ flex: 1 }}>{`Sample ${String(sampleIndex).padStart(2, '0')} · ${sample.samples.length} samples · loop ${sample.loopEnd > sample.loopStart ? `${sample.loopStart}+${sample.loopEnd - sample.loopStart}` : 'off'}`}</span>
          <label>vol <input aria-label={`IT sample ${sampleIndex} volume`} type="number" min={0} max={64} value={sample.volume ?? 64} onChange={event => editTrackerSample(sampleIndex, { volume: Number(event.target.value) })} style={{ width: 48 }} /></label>
          <label>start <input aria-label={`IT sample ${sampleIndex} loop start`} type="number" min={0} max={sample.samples.length} value={sample.loopStart} onChange={event => editTrackerSample(sampleIndex, { loopStart: Number(event.target.value) })} style={{ width: 58 }} /></label>
          <label>end <input aria-label={`IT sample ${sampleIndex} loop end`} type="number" min={0} max={sample.samples.length} value={sample.loopEnd} onChange={event => editTrackerSample(sampleIndex, { loopEnd: Number(event.target.value) })} style={{ width: 58 }} /></label>
        </Flex>)}
      </div>
      <Typography.Text strong>IT pattern {selectedPattern} preview</Typography.Text>
      <pre style={{ marginTop: 6, maxHeight: 220, overflow: 'auto', background: '#202020', color: '#e8e8e8', padding: 8, fontSize: 11 }}>{itPatternRows.map((row, rowIndex) => `${String(rowIndex).padStart(2, '0')}  ${row.map(event => event.note ? `${event.note.toString(16).padStart(2, '0')}:${event.instrument.toString(16).padStart(2, '0')}:${event.volume.toString(16).padStart(2, '0')}:${event.effect.toString(16)}${event.parameter.toString(16).padStart(2, '0')}` : '---:--:--:----').join(' | ')}`).join('\n')}</pre>
      <Typography.Text strong>Edit IT event</Typography.Text>
      <Flex gap={6} wrap="wrap" style={{ marginTop: 6 }}>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, row: Math.max(0, current.row - 1) }))}>Row −</Button>
        <Typography.Text>Row {selectedCell.row + 1}, CH {selectedCell.channel + 1}</Typography.Text>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, row: Math.min(Math.max(0, itPatternRows.length - 1), current.row + 1) }))}>Row +</Button>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, channel: Math.max(0, current.channel - 1) }))}>CH −</Button>
        <Button size="small" onClick={() => setSelectedCell(current => ({ ...current, channel: Math.min(63, current.channel + 1) }))}>CH +</Button>
      </Flex>
      <Flex gap={6} wrap="wrap" style={{ marginTop: 6 }}>
        {(['note', 'instrument', 'volume', 'effect', 'parameter'] as const).map(field => <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{field}<input type="number" min={0} max={255} value={itEvent[field]} onChange={event => editItEvent({ [field]: Number(event.target.value) })} style={{ width: 68 }} /></label>)}
      </Flex>
      <Flex gap={6} wrap="wrap" style={{ marginTop: 6 }}>
        <Button size="small" onClick={undoItEdit} disabled={!itUndo.length}>Undo IT</Button>
        <Button size="small" onClick={redoItEdit} disabled={!itRedo.length}>Redo IT</Button>
        <Button size="small" onClick={exportEditedTracker}>Export edited IT</Button>
      </Flex>
    </>}
    <Descriptions size="small" column={2} bordered>
      <Descriptions.Item label="Orders">{info.orders}</Descriptions.Item>
      <Descriptions.Item label="Speed">{info.speed ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Tempo">{info.tempo ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Playback">{mod ? 'MOD Web Audio preview' : 'Structural oscillator preview (samples/effects simplified)'}</Descriptions.Item>
    </Descriptions>
    <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
      This module is inspected from its tracker structure. MOD preview uses a bounded channel scheduler; XM/S3M/IT use PCM samples when available, with channel mute and a structural fallback. Advanced effects and instrument mappings still require ROM/runtime validation.
    </Typography.Paragraph>
  </Card>;
};

export default TrackerModuleViewer;

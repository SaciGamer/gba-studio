import { AudioOutlined, DownloadOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { App, Button, Card, Flex, Input, Select, Slider, Space, Tag, theme, Tooltip, Typography } from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SFX_LIMITS, SFX_WAVEFORMS, DEFAULT_SFX_HARMONICS, isSfxWaveform, defaultSfxParameters, encodePcm16Wav, generateSfx, SfxParameters, SfxWaveform } from '@/utils/sfxGenerator';
import { useI18n } from '@/i18n/I18n';
import MusicDial from './MusicDial';
import './MusicDial.css';

function pcmBase64(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let offset = 0; offset < view.length; offset += 0x8000) binary += String.fromCharCode(...view.subarray(offset, Math.min(view.length, offset + 0x8000)));
  return btoa(binary);
}

function Waveform({ pcm, fadeInMs, fadeOutMs, durationMs, progress, playing, ariaLabel }: { pcm: Float32Array; fadeInMs: number; fadeOutMs: number; durationMs: number; progress: number; playing: boolean; ariaLabel: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { token } = theme.useToken();
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
    const context = element.getContext('2d');
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, element.clientWidth); const height = Math.max(1, element.clientHeight);
    element.width = width * ratio; element.height = height * ratio; context.scale(ratio, ratio);
    const plotHeight = height - 18;
    const fadeInEnd = Math.min(width, fadeInMs / Math.max(1, durationMs) * width);
    const fadeStart = Math.max(0, durationMs - fadeOutMs) / Math.max(1, durationMs) * width;
    if (fadeInMs > 0) { context.fillStyle = token.colorInfoBg; context.fillRect(0, 0, fadeInEnd, plotHeight); }
    if (fadeOutMs > 0) { context.fillStyle = token.colorWarningBg; context.fillRect(fadeStart, 0, width - fadeStart, plotHeight); }
    context.strokeStyle = token.colorBorderSecondary; context.lineWidth = 1;
    for (let division = 0; division <= 4; division += 1) {
      const y = plotHeight * division / 4;
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
      if (division < 4) { const x = width * division / 4; context.beginPath(); context.moveTo(x, 0); context.lineTo(x, plotHeight); context.stroke(); }
    }
    if (fadeOutMs > 0) {
      context.strokeStyle = token.colorWarning; context.setLineDash([3, 3]);
      context.beginPath(); context.moveTo(fadeStart, 0); context.lineTo(fadeStart, plotHeight); context.stroke(); context.setLineDash([]);
    }
    if (fadeInMs > 0) {
      context.strokeStyle = token.colorInfo; context.setLineDash([3, 3]);
      context.beginPath(); context.moveTo(fadeInEnd, 0); context.lineTo(fadeInEnd, plotHeight); context.stroke(); context.setLineDash([]);
    }
    context.strokeStyle = token.colorPrimary; context.lineWidth = 1.5;
    context.beginPath();
    for (let x = 0; x < width; x += 1) {
      const sampleIndex = Math.min(pcm.length - 1, Math.floor((x + 0.5) * pcm.length / width));
      const y = plotHeight * (0.5 - (pcm[sampleIndex] ?? 0) * 0.46);
      if (x === 0) context.moveTo(x + 0.5, y);
      else context.lineTo(x + 0.5, y);
    }
    context.stroke();
    context.fillStyle = token.colorTextSecondary; context.font = '10px sans-serif';
    context.fillText('+1', 3, 10); context.fillText('0', 3, plotHeight / 2 + 3); context.fillText('-1', 3, plotHeight - 2);
    context.fillText('0 s', 3, height - 3); context.fillText(`${(durationMs / 1000).toFixed(2)} s`, Math.max(3, width - 42), height - 3);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [durationMs, fadeInMs, fadeOutMs, pcm, token.colorBgContainer, token.colorBorderSecondary, token.colorInfo, token.colorInfoBg, token.colorPrimary, token.colorTextSecondary, token.colorWarningBg]);
  return <div style={{ position: 'relative' }}><canvas aria-label={ariaLabel} style={{ display: 'block', width: '100%', height: 172, borderRadius: 8 }} ref={canvas} />{playing && <div aria-hidden="true" style={{ position: 'absolute', left: `${Math.min(1, progress) * 100}%`, top: 0, bottom: 18, width: 2, background: token.colorError, boxShadow: `0 0 8px ${token.colorError}`, pointerEvents: 'none' }} />}</div>;
}

function Spectrum({ pcm, ariaLabel }: { pcm: Float32Array; ariaLabel: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { token } = theme.useToken();
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
    const context = element.getContext('2d');
    if (!context) return;
    const ratio = window.devicePixelRatio || 1; const width = Math.max(1, element.clientWidth); const height = Math.max(1, element.clientHeight);
    element.width = width * ratio; element.height = height * ratio; context.scale(ratio, ratio);
    // Keep the waveform canvas transparent so the enclosing Sound Design panel shows through.
    context.strokeStyle = token.colorBorderSecondary; context.beginPath(); context.moveTo(0, height - 1); context.lineTo(width, height - 1); context.stroke();
    const size = Math.min(512, 2 ** Math.floor(Math.log2(Math.max(2, pcm.length))));
    const bars = Math.max(16, Math.floor(width / 5)); const barWidth = width / bars;
    for (let bar = 0; bar < bars; bar += 1) {
      const lowBin = Math.max(1, Math.floor(Math.pow(size / 2, bar / bars)));
      const highBin = Math.max(lowBin + 1, Math.floor(Math.pow(size / 2, (bar + 1) / bars)));
      let maxMagnitude = 0;
      for (let bin = lowBin; bin < Math.min(size / 2, highBin); bin += 1) {
        let real = 0; let imaginary = 0;
        for (let sample = 0; sample < size; sample += 1) {
          const value = (pcm[sample] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * sample) / Math.max(1, size - 1)));
          const angle = 2 * Math.PI * bin * sample / size;
          real += value * Math.cos(angle); imaginary -= value * Math.sin(angle);
        }
        maxMagnitude = Math.max(maxMagnitude, Math.sqrt(real * real + imaginary * imaginary) / size);
      }
      const barHeight = Math.min(height, Math.max(1, Math.log1p(maxMagnitude * 180) / Math.log(181) * height));
      context.fillStyle = token.colorPrimary; context.fillRect(bar * barWidth, height - barHeight, Math.max(1, barWidth - 1), barHeight);
    }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pcm, token.colorBgContainer, token.colorBorderSecondary, token.colorPrimary]);
  return <canvas aria-label={ariaLabel} style={{ display: 'block', width: '100%', height: 52 }} ref={canvas} />;
}

export default function SfxGenerator({ sourceDocument, sourceFilename, onSaved, onApply, onDirtyChange, saveRef }: { sourceDocument?: any; sourceFilename?: string; onSaved: (filename?: string, document?: any) => void; onApply?: (parameters: SfxParameters) => void; onDirtyChange?: (dirty: boolean) => void; saveRef?: React.MutableRefObject<(() => Promise<boolean>) | null> }) {
  const { message } = App.useApp();
  const { modal } = App.useApp();
  const { t } = useI18n();
  const { token } = theme.useToken();
  const [parameters, setParameters] = useState<SfxParameters>(defaultSfxParameters);
  const [name, setName] = useState('new_effect');
  const [savedSourceName, setSavedSourceName] = useState<string | undefined>(sourceFilename);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [playing, setPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const generated = useMemo(() => generateSfx(parameters), [parameters]);
  useEffect(() => {
    const loadedParameters = sourceDocument?.parameters;
    setParameters(generateSfx(loadedParameters && isSfxWaveform(loadedParameters.waveform)
      ? { ...defaultSfxParameters, ...loadedParameters } : defaultSfxParameters).parameters);
    setName(typeof sourceDocument?.name === 'string' ? sourceDocument.name : 'new_effect');
    setSavedSourceName(sourceFilename);
    setSavedSnapshot(JSON.stringify({
      name: typeof sourceDocument?.name === 'string' ? sourceDocument.name : 'new_effect',
      parameters: generateSfx(loadedParameters && isSfxWaveform(loadedParameters.waveform) ? { ...defaultSfxParameters, ...loadedParameters } : defaultSfxParameters).parameters,
    }));
  }, [sourceDocument, sourceFilename]);
  const dirty = savedSnapshot !== '' && JSON.stringify({ name, parameters: generated.parameters }) !== savedSnapshot;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const update = (patch: Partial<SfxParameters>) => setParameters(current => ({ ...current, ...patch }));
  const stop = () => { try { sourceRef.current?.stop(); } catch { /* already stopped */ } sourceRef.current = null; setPlaying(false); setPlayProgress(0); };
  useEffect(() => () => { stop(); void contextRef.current?.close(); }, []);
  useEffect(() => { if (playing) stop(); }, [generated]);
  const preview = async () => {
    stop();
    const AudioContextType = window.AudioContext;
    if (!AudioContextType) { message.error(t('sfx.previewUnavailable')); return; }
    const context = contextRef.current && contextRef.current.state !== 'closed' ? contextRef.current : new AudioContextType();
    contextRef.current = context;
    await context.resume();
    const audio = context.createBuffer(1, generated.pcm.length, generated.parameters.sampleRate);
    audio.copyToChannel(new Float32Array(generated.pcm), 0);
    const source = context.createBufferSource(); source.buffer = audio; source.connect(context.destination);
    const startedAt = context.currentTime;
    source.onended = () => { if (sourceRef.current === source) { sourceRef.current = null; setPlaying(false); setPlayProgress(0); } };
    sourceRef.current = source; setPlayProgress(0); setPlaying(true);
    const updateCursor = () => {
      if (sourceRef.current !== source) return;
      setPlayProgress(Math.min(1, (context.currentTime - startedAt) / (generated.pcm.length / generated.parameters.sampleRate)));
      requestAnimationFrame(updateCursor);
    };
    requestAnimationFrame(updateCursor); source.start();
  };
  const persist = async (mode: 'source' | 'wav', overwriteExisting = false): Promise<boolean> => {
    const safeName = name.trim().replace(/\.(gbasfx|wav)$/i, '');
    if (!/^[A-Za-z0-9_]{1,64}$/.test(safeName)) { message.error(t('sfx.invalidName')); return false; }
    const wav = encodePcm16Wav(generated.pcm, generated.parameters.sampleRate);
    const document = { schema: 'gba-studio/sfx', version: 1, name: safeName, parameters: generated.parameters };
    const result = await window.electronAPI.saveGeneratedSfx(`${safeName}.gbasfx`, JSON.stringify(document), `${safeName}.wav`, pcmBase64(wav), mode, overwriteExisting);
    if (mode === 'source' && result?.status === 'conflict' && !overwriteExisting) {
      return new Promise(resolve => {
        modal.confirm({ title: t('sfx.overwriteTitle'), content: t('sfx.overwriteSourceConfirm'), okText: t('sfx.replace'), cancelText: t('sfx.cancel'),
          onOk: async () => { const saved = await persist(mode, true); resolve(saved); },
          onCancel: () => resolve(false),
        });
      });
    }
    if (result?.status !== 'success') {
      message.error(result?.message ?? t('sfx.saveFailed'));
      return false;
    }
    window.dispatchEvent(new CustomEvent('gba-studio:assets-reloaded'));
    if (mode === 'source') {
      setSavedSourceName(`${safeName}.gbasfx`);
      setSavedSnapshot(JSON.stringify({ name, parameters: generated.parameters }));
      onDirtyChange?.(false);
      onSaved(`${safeName}.gbasfx`, document);
      message.success(t('sfx.projectSaved'));
    } else {
      onSaved();
      message.success(t('sfx.wavExportedFile', { filename: result.filename }));
    }
    return true;
  };
  const save = (mode: 'source' | 'wav') => persist(mode, mode === 'source' && savedSourceName === `${name.trim().replace(/\.(gbasfx|wav)$/i, '')}.gbasfx`);
  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = () => save('source');
    return () => { saveRef.current = null; };
  }, [saveRef, name, generated, savedSourceName]);
  const duration = generated.pcm.length / generated.parameters.sampleRate;
  const sampleEditorSliderStyle = { width: '100%', margin: 0, '--music-accent': token.colorPrimary } as React.CSSProperties;
  return <Flex data-testid="sfx-generator-workspace" vertical gap={18} style={{ width: 'min(1080px, 100%)', marginInline: 'auto', padding: 8, '--music-surface-raised': token.colorBgElevated, '--music-border': token.colorBorder } as React.CSSProperties}>
      {!onApply && <Flex align="center" justify="space-between" gap={16} wrap="wrap">
        <Space align="start"><AudioOutlined style={{ fontSize: 24, marginTop: 7 }} /><div><Typography.Title level={3} style={{ margin: 0 }}>{t('sfx.title')}</Typography.Title><Typography.Text type="secondary">{t('sfx.workspaceHint')}</Typography.Text></div><Tag color="cyan">{t('sfx.oneShot')}</Tag></Space>
      </Flex>}
      {!onApply && <Typography.Text strong>{savedSourceName ?? `${name}.gbasfx`}{dirty ? ' *' : ''}</Typography.Text>}
      {!onApply && <Input aria-label={t('sfx.name')} placeholder={t('sfx.namePlaceholder')} value={name} onChange={event => setName(event.target.value)} />}
      <Card size="small" styles={{ body: { padding: 12 } }}>
        <Flex justify="space-between" style={{ marginTop: 8 }}>
          <Typography.Text type="secondary">{playing ? t('sfx.playheadTime', { elapsed: (playProgress * duration).toFixed(2), duration: duration.toFixed(2) }) : `${duration.toFixed(3)} s`} · {generated.parameters.sampleRate} Hz · Peak {generated.peak.toFixed(2)} · RMS {generated.rms.toFixed(2)}</Typography.Text>
          <Typography.Text type="secondary">{parameters.waveform === 'noise' ? t('sfx.noise') : t('sfx.frequency', { value: generated.parameters.frequency })}</Typography.Text>
        </Flex>
        <div style={{ marginTop: 10, marginBottom: 18, padding: '8px 10px 4px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6, background: token.colorBgElevated }}>
          <Typography.Text type="secondary">{t('sfx.spectrum')}</Typography.Text>
          <Spectrum pcm={generated.pcm} ariaLabel={t('sfx.spectrum')} />
        </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(240px, 1fr)', gap: 20, alignItems: 'stretch' }}>
        <div className="gba-sfx-design-panel"><Typography.Text strong>{t('sfx.waveform')}</Typography.Text><Space.Compact block direction="vertical"><Select aria-label={t('sfx.waveform')} value={parameters.waveform} options={SFX_WAVEFORMS.map(value => ({ value, label: t(`sfx.${value}`) }))} onChange={(waveform: SfxWaveform) => update({ waveform })} style={{ width: '100%' }} /><div style={{ width: '100%', padding: 8 }}><Waveform pcm={generated.pcm} fadeInMs={generated.parameters.fadeInMs} fadeOutMs={generated.parameters.fadeOutMs} durationMs={generated.parameters.durationMs} progress={playProgress} playing={playing} ariaLabel={t('sfx.waveformPreview')} /></div></Space.Compact>
          {parameters.waveform === 'custom' && <Flex vertical gap={12} style={{ marginTop: 12 }}>
            <Typography.Text type="secondary">{t('sfx.customHint')}</Typography.Text>
            <Flex gap={12} wrap="wrap" justify="center">
              {(generated.parameters.harmonics ?? DEFAULT_SFX_HARMONICS).map((level, index) => <Flex key={index} vertical align="center" gap={4}>
                <Tooltip title={(index + 1) * parameters.frequency > SFX_LIMITS.maxFrequency ? t('sfx.harmonicLimit', { frequency: (index + 1) * parameters.frequency, limit: SFX_LIMITS.maxFrequency }) : undefined}><span><MusicDial disabled={(index + 1) * parameters.frequency > SFX_LIMITS.maxFrequency} label={t(index === 0 ? 'sfx.fundamental' : `sfx.harmonic${index + 1}`)} min={0} max={100} step={1} value={level} valueText={`${level}%`}
                  onChange={value => update({ harmonics: (parameters.harmonics ?? DEFAULT_SFX_HARMONICS).map((current, harmonic) => harmonic === index ? value : current) })} /></span></Tooltip>
                <Typography.Text>{t(index === 0 ? 'sfx.fundamental' : `sfx.harmonic${index + 1}`)}</Typography.Text>
                <Typography.Text type="secondary">{level}%</Typography.Text>
              </Flex>)}
            </Flex>
            <Button size="small" onClick={() => update({ harmonics: [...DEFAULT_SFX_HARMONICS] })}>{t('sfx.resetHarmonics')}</Button>
          </Flex>}
        </div>
        <div className="gba-sfx-design-panel">
          <Typography.Text strong>{t('sfx.controls')}</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>{t('sfx.gbaLimits', { frequency: SFX_LIMITS.maxFrequency, duration: SFX_LIMITS.maxDurationMs / 1000 })}</Typography.Paragraph>
          <Flex vertical gap={14} style={{ marginTop: 10 }}>
            <Tooltip title={parameters.waveform === 'noise' ? t('sfx.frequencyNoiseHint') : undefined}><div tabIndex={parameters.waveform === 'noise' ? 0 : undefined} aria-label={parameters.waveform === 'noise' ? t('sfx.frequencyNoiseHint') : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><Typography.Text>{t('sfx.frequency', { value: parameters.frequency })}</Typography.Text><Slider className="gba-music-fader gba-sample-volume-fader" aria-label={t('sfx.frequency', { value: parameters.frequency })} ariaLabelForHandle={t('sfx.frequency', { value: parameters.frequency })} min={SFX_LIMITS.minFrequency} max={SFX_LIMITS.maxFrequency} step={10} value={parameters.frequency} disabled={parameters.waveform === 'noise'} onChange={frequency => update({ frequency })} style={sampleEditorSliderStyle} /></div></Tooltip>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><Typography.Text>{t('sfx.duration', { value: parameters.durationMs })}</Typography.Text><Slider className="gba-music-fader gba-sample-volume-fader" aria-label={t('sfx.duration', { value: parameters.durationMs })} ariaLabelForHandle={t('sfx.duration', { value: parameters.durationMs })} min={SFX_LIMITS.minDurationMs} max={SFX_LIMITS.maxDurationMs} step={10} value={parameters.durationMs} onChange={durationMs => update({ durationMs })} style={sampleEditorSliderStyle} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><Typography.Text>{t('sfx.fadeIn', { value: parameters.fadeInMs })}</Typography.Text><Slider className="gba-music-fader gba-sample-volume-fader" aria-label={t('sfx.fadeIn', { value: parameters.fadeInMs })} ariaLabelForHandle={t('sfx.fadeIn', { value: parameters.fadeInMs })} min={0} max={parameters.durationMs} step={1} value={parameters.fadeInMs} onChange={fadeInMs => update({ fadeInMs })} style={sampleEditorSliderStyle} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><Typography.Text>{t('sfx.fadeOut', { value: parameters.fadeOutMs })}</Typography.Text><Slider className="gba-music-fader gba-sample-volume-fader" aria-label={t('sfx.fadeOut', { value: parameters.fadeOutMs })} ariaLabelForHandle={t('sfx.fadeOut', { value: parameters.fadeOutMs })} min={0} max={parameters.durationMs} step={1} value={parameters.fadeOutMs} onChange={fadeOutMs => update({ fadeOutMs })} style={sampleEditorSliderStyle} /></div>
            <Flex align="center" gap={12}><Typography.Text>{t('sfx.volumeLabel')}</Typography.Text><MusicDial label={t('sfx.volume', { value: parameters.volume })} min={0} max={100} step={1} value={parameters.volume} valueText={`${parameters.volume}%`} onChange={volume => update({ volume })} /><Typography.Text type="secondary">{parameters.volume}%</Typography.Text></Flex>
          </Flex>
        </div>
      </div>
      </Card>
      <Flex gap={8} wrap="wrap"><Button icon={playing ? <StopOutlined /> : <PlayCircleOutlined />} onClick={playing ? stop : () => void preview()}>{playing ? t('sfx.stop') : t('sfx.preview')}</Button>{onApply ? <Button type="primary" onClick={() => onApply(generated.parameters)}>{t('events.sound.apply')}</Button> : <><Button onClick={() => save('source')}>{t('sfx.saveProject')}</Button><Button type="primary" icon={<DownloadOutlined />} onClick={() => save('wav')}>{t('sfx.exportWav')}</Button></>}</Flex>
    </Flex>;
}

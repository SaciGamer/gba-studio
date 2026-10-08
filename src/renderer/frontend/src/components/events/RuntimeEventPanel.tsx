import { useI18n } from '@/i18n/I18n';
import useAppContexts from '@/providers/contexts/AppContexts';
import { ETypeScene, IArgs, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { App, Button, Flex, Form, Input, Segmented, Select, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import StepInputNumber, { InputNumber } from '../StepInputNumber';
import NumericEventInput from '../NumericEventInput';
import { NUMERIC_EVENT_FIELDS } from '../../../../../shared/numericEventFields';
import ActorMotionSpeedControl from './ActorMotionSpeedControl';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EEvents } from './interfaces/IEvents';
import { CurrentBackgroundThumbnail } from './BackgroundEvents';
import frameImage from '@/img/frame.png';
import { DIALOGUE_MAX_BYTES, truncateUtf8, utf8ByteLength } from '@/utils/dialogueText';
import { fontCharacterWidth as metricCharacterWidth, fontGlyphIndex as metricGlyphIndex, measureFontText, PREVIEW_FONTS, type PreviewFontId } from '@/utils/fontMetrics';
import { getPaletteIndexZeroColor, loadPaletteTransparentImage } from '@/utils/paletteTransparency';

type Props = { event: IScriptsElement; customTitle?: (newTitle: string) => void; onValueChange: (id: string, args: IArgs) => void };

function VariableTextArea({ value, rows, variables, onChange, onFocus, onBlur }: { value: string; rows: number; variables: any[]; onChange: (value: string) => void; onFocus?: () => void; onBlur?: () => void }) {
  const [query, setQuery] = useState('');
  const match = value.match(/\$([A-Za-z_][A-Za-z0-9_]*)?$/);
  useEffect(() => setQuery(match ? (match[1] ?? '') : ''), [value]);
  const suggestions = match ? variables.filter(variable => `${variable.symbol} ${variable.name}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : [];
  const insert = (symbol: string) => onChange(value.replace(/\$[A-Za-z_][A-Za-z0-9_]*$|\$$/, `\${${symbol}}`));
  const previewParts = value.split(/(\$\{[^}]+\})/g);
  return <>
    <Input.TextArea rows={rows} maxLength={255} showCount={{ formatter: dialogueCount }} value={value} onFocus={onFocus} onBlur={onBlur} onChange={event => onChange(event.target.value)} />
    {suggestions.length > 0 && <Select showSearch value={undefined} placeholder="Escolha uma variável" options={suggestions.map(variable => ({ value: variable.symbol, label: `${variable.name || variable.symbol} ($${variable.symbol})` }))} onChange={insert} style={{ width: '100%', marginTop: 4 }} />}
    {value.includes('${') && <Typography.Text type="secondary">Preview: {previewParts.map((part, index) => part.startsWith('${') ? <Tag color="blue" key={index}>{part}</Tag> : <React.Fragment key={index}>{part}</React.Fragment>)}</Typography.Text>}
  </>;
}

const dialogueLineWidth = 224;

function wrapDialogueText(value: string, font: PreviewFontId, maxWidth = dialogueLineWidth): string[] {
  const lines: string[] = [];
  value.split('\n').forEach(paragraph => {
    if (!paragraph) {
      lines.push('');
      return;
    }
    let remaining = Array.from(paragraph);
    while (remaining.length > 0) {
      const line: string[] = [];
      let width = 0;
      let index = 0;
      while (index < remaining.length) {
        const characterWidth = metricCharacterWidth(font, remaining[index]);
        if (width + characterWidth > maxWidth) break;
        line.push(remaining[index]);
        width += characterWidth;
        index += 1;
      }

      if (index === remaining.length) {
        lines.push(line.join(''));
        break;
      }

      let splitAt = line.length - 1;
      while (splitAt >= 0 && line[splitAt] !== ' ') splitAt -= 1;
      if (splitAt >= 0) {
        lines.push(line.slice(0, splitAt).join(''));
        remaining = [...line.slice(splitAt + 1), ...remaining.slice(index)];
        while (remaining[0] === ' ') remaining.shift();
      } else {
        // Match the runtime's hard-wrap behavior: keep the last complete
        // glyph for the next line when there is no space to break on.
        const keep = line.length > 0 ? line.length - 1 : 1;
        lines.push(line.slice(0, keep).join(''));
        remaining = [...line.slice(keep), ...remaining.slice(index)];
      }
    }
  });
  return lines.length ? lines : [''];
}

function sanitizeDialogueText(value: string): string {
  // Matches common_variable_8x16_sprite_font: printable ASCII plus the
  // accented characters explicitly present in Butano's UTF-8 map.
  return value.replace(/[^\x20-\x7EÁÉÍÓÚÜÑáéíóúüñ¡¿\n]/g, '');
}

function unsupportedDialogueCharacters(value: string): string[] {
  return Array.from(new Set(Array.from(value).filter(character => sanitizeDialogueText(character) !== character)));
}

const dialogueCount = ({ value }: { value: string }) => `${utf8ByteLength(value)}/${DIALOGUE_MAX_BYTES} bytes`;

const fontAccents = ['Á', 'É', 'Í', 'Ó', 'Ú', 'Ü', 'Ñ', 'á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ', '¡', '¿'];
// Must match common_variable_8x16_sprite_font.h. The runtime font has
// variable advances, including for accented characters and punctuation.
const fontCharacterWidths = [
  6, 4, 7, 8, 8, 7, 8, 4, 5, 5, 7, 7, 4, 7, 4, 7,
  7, 4, 7, 7, 7, 7, 7, 7, 7, 7, 4, 4, 6, 7, 6, 7,
  8, 7, 7, 7, 7, 7, 7, 7, 7, 5, 7, 7, 7, 8, 7, 7,
  7, 8, 7, 7, 7, 7, 7, 8, 7, 7, 7, 5, 7, 5, 4, 7,
  4, 7, 7, 7, 7, 7, 6, 7, 7, 3, 4, 6, 3, 8, 7, 7,
  7, 7, 6, 7, 6, 7, 7, 8, 7, 7, 7, 6, 3, 6, 8,
];
const fontAccentWidths = [7, 7, 5, 7, 7, 7, 7, 7, 7, 4, 7, 7, 7, 7, 3, 7];
const fontCharacterWidth = (character: string) => {
  const code = character.charCodeAt(0);
  if (code >= 32 && code <= 126) return fontCharacterWidths[code - 32] ?? 7;
  const accentIndex = fontAccents.indexOf(character);
  return accentIndex >= 0 ? fontAccentWidths[accentIndex] : 7;
};
const fontGlyphIndex = (character: string) => {
  const code = character.charCodeAt(0);
  // Butano handles space separately and starts the graphics table at '!':
  // graphics_index = character - '!'. UTF-8 entries follow the 94 ASCII
  // glyphs in the order declared by common_variable_8x16_sprite_font.h.
  if (code >= 33 && code <= 126) return code - 33;
  const accentIndex = fontAccents.indexOf(character);
  return accentIndex >= 0 ? 94 + accentIndex : -1;
};

const selectedFontCharacterWidth = (font: PreviewFontId, character: string) => metricCharacterWidth(font, character);
const selectedFontGlyphIndex = (character: string) => metricGlyphIndex(character);

export function FontOptionPreview({ font, fontSources, paletteColors }: { font: PreviewFontId; fontSources: Record<string, string>; paletteColors: Record<string, string> }) {
  const metrics = PREVIEW_FONTS[font];
  const text = font === 'fixed8x8' ? '8x8' : '8x16';
  const width = Array.from(text).reduce((total, character) => total + selectedFontCharacterWidth(font, character), 0);
  const scale = Math.max(1, Math.min(2, 56 / Math.max(1, width), 24 / metrics.glyphHeight));
  return <span style={{ width: 56, height: 28, flex: '0 0 56px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: paletteColors[metrics.image] ?? 'transparent', borderRadius: 4, overflow: 'hidden' }}>
    <span style={{ display: 'flex', alignItems: 'center', height: Math.min(24, metrics.glyphHeight * scale) }}>
      {Array.from(text).map((character, index) => <span key={`${character}-${index}`} style={{ width: selectedFontCharacterWidth(font, character) * scale, height: metrics.glyphHeight * scale, flex: `0 0 ${selectedFontCharacterWidth(font, character) * scale}px`, backgroundImage: `url(${fontSources[metrics.image] ?? '/common_variable_8x16_font.png'})`, backgroundRepeat: 'no-repeat', backgroundSize: `${metrics.glyphWidth * scale}px auto`, backgroundPosition: `0 -${selectedFontGlyphIndex(character) * metrics.glyphHeight * scale}px`, imageRendering: 'pixelated' }} />)}
    </span>
  </span>;
}

function DialogueGlyphText({ lines, horizontalAlign, font, fontSources }: { lines: string[]; horizontalAlign: 'left' | 'center' | 'right'; font: PreviewFontId; fontSources: Record<string, string> }) {
  const metrics = PREVIEW_FONTS[font];
  return <>{lines.map((line, lineIndex) => <div key={lineIndex} style={{ height: metrics.glyphHeight, lineHeight: `${metrics.glyphHeight}px`, textAlign: horizontalAlign, whiteSpace: 'nowrap' }}>
    {line.split('').map((character, characterIndex) => {
      const glyphIndex = selectedFontGlyphIndex(character);
      if (character === ' ') return <span key={`${lineIndex}-${characterIndex}`} aria-hidden style={{ display: 'inline-block', width: selectedFontCharacterWidth(font, character), height: metrics.glyphHeight }} />;
      if (glyphIndex < 0) return null;
      return <span key={`${lineIndex}-${characterIndex}`} aria-hidden style={{
        display: 'inline-block', width: selectedFontCharacterWidth(font, character), height: metrics.glyphHeight,
        verticalAlign: 'top', backgroundImage: `url(${fontSources[metrics.image] ?? '/common_variable_8x16_font.png'})`,
        backgroundRepeat: 'no-repeat', backgroundSize: `${metrics.glyphWidth}px auto`, backgroundPosition: `0 -${glyphIndex * metrics.glyphHeight}px`,
        imageRendering: 'pixelated',
      }} />;
    })}
  </div>)}</>;
}

function DialoguePreview({ text, anchor, frameSource, showFrame, horizontalAlign, font, fontSources }: { text: string; anchor: DOMRect; frameSource: string; showFrame: boolean; horizontalAlign: 'left' | 'center' | 'right'; font: PreviewFontId; fontSources: Record<string, string> }) {
  const lines = useMemo(() => wrapDialogueText(text, font), [text, font]);
  const height = Math.max(64, lines.length * PREVIEW_FONTS[font].glyphHeight + 16);
  // The engine canvas is immediately to the left of the RightPanel. Keep the
  // preview there, aligned with the hovered dialogue field instead of covering
  // the event editor itself.
  const left = Math.max(8, anchor.left - 252);
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - height - 8));

  return createPortal(
    <div aria-label="Dialogue preview" style={{
      position: 'fixed', left, top, width: 240, height, zIndex: 2000,
      boxSizing: 'border-box', padding: 8, color: '#111',
      background: showFrame ? '#fff' : 'transparent', imageRendering: 'pixelated', pointerEvents: 'none', isolation: 'isolate',
      overflow: 'hidden', fontFamily: 'monospace', fontSize: 8, lineHeight: `${PREVIEW_FONTS[font].glyphHeight}px`,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: horizontalAlign,
    }}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', boxSizing: 'border-box', border: '8px solid transparent', borderImage: `url(${frameSource}) 8 fill / 8px / 0 stretch`, filter: showFrame ? undefined : 'grayscale(1) opacity(.55)', zIndex: 0 }} />
      <div style={{ position: 'relative', zIndex: 1 }}><DialogueGlyphText lines={lines} horizontalAlign={horizontalAlign} font={font} fontSources={fontSources} /></div>
    </div>,
    document.body,
  );
}

function UiTextPreview({ text, anchor, x, y, font, fontSources, effect }: { text: string; anchor: DOMRect; x: number; y: number; font: PreviewFontId; fontSources: Record<string, string>; effect?: { id: string; animation: 'move' | 'blink'; targetX: number; targetY: number; speed: number; durationFrames?: number } }) {
  const width = 240;
  const height = 160;
  const left = Math.max(8, anchor.left - width - 12);
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - height - 8));
  const metrics = PREVIEW_FONTS[font];
  const source = fontSources[metrics.image] ?? '/common_fixed_8x16_font.png';
  const rows = text.split('\n');
  const animationName = `ui-preview-${effect?.id.replace(/[^a-zA-Z0-9_-]/g, '') || 'event'}`;
  const speed = Math.max(0.0625, effect?.speed ?? 1);
  const moveDuration = Math.max(0.05, Math.hypot(effect ? effect.targetX - x : 0, effect ? effect.targetY - y : 0) / speed / 60);
  const effectCss = effect?.animation === 'move'
    ? `@keyframes ${animationName}{to{transform:translate(${effect.targetX - x}px,${effect.targetY - y}px)}}`
    : effect?.animation === 'blink'
      ? `@keyframes ${animationName}{0%,49%{opacity:1}50%,100%{opacity:0}}`
      : '';
  const effectDuration = effect?.animation === 'move' ? `${moveDuration}s` : `${Math.max(0.05, 2 / speed)}s`;
  const iterationCount = effect?.animation === 'blink' && effect.durationFrames ? Math.max(1, effect.durationFrames / 60 * speed / 2) : 'infinite';

  return createPortal(
    <div aria-label="UI text preview" style={{ position: 'fixed', left, top, width, height, zIndex: 2000, overflow: 'hidden', background: '#000', color: '#fff', pointerEvents: 'none', imageRendering: 'pixelated', boxShadow: '0 4px 18px rgba(0,0,0,.35)' }}>
      {effectCss && <style>{effectCss}</style>}
      <div style={{ position: 'absolute', left: x, top: y, fontSize: 0, lineHeight: 0, animation: effect ? `${animationName} ${effectDuration} ${effect.animation === 'move' ? 'linear forwards' : 'steps(1,end)'} ${iterationCount}` : undefined }}>
        {rows.map((row, rowIndex) => <div key={rowIndex} style={{ display: 'flex', height: metrics.glyphHeight, whiteSpace: 'nowrap' }}>
          {Array.from(row).map((character, index) => {
            const glyph = metricGlyphIndex(character);
            const glyphWidth = metricCharacterWidth(font, character);
            if (character === ' ') return <span key={`${character}-${index}`} style={{ width: glyphWidth, height: metrics.glyphHeight, flex: `0 0 ${glyphWidth}px` }} />;
            if (glyph < 0) return null;
            return <span key={`${character}-${index}`} style={{ width: glyphWidth, height: metrics.glyphHeight, flex: `0 0 ${glyphWidth}px`, backgroundImage: `url(${source})`, backgroundRepeat: 'no-repeat', backgroundSize: `${metrics.glyphWidth}px auto`, backgroundPosition: `0 -${glyph * metrics.glyphHeight}px` }} />;
          })}
        </div>)}
      </div>
    </div>,
    document.body,
  );
}

function HBlankEffectPreview({ eventId, layerId, preset, intensity, anchor }: { eventId: string; layerId: number; preset: string; intensity: number; anchor: DOMRect }) {
  const strength = Math.max(0, Math.min(16, intensity)) / 16;
  const width = 240;
  const height = 160;
  const left = Math.max(8, anchor.left - width - 12);
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - height - 8));
  const overlayStyle: React.CSSProperties = preset === 'backdrop_gradient'
    ? { background: `linear-gradient(to bottom, rgba(0,80,255,${strength}), rgba(255,32,0,${strength}))` }
    : preset === 'palette_wave'
      ? { background: `linear-gradient(to bottom, transparent 35%, rgba(80,255,80,${strength}) 48%, rgba(80,255,80,${strength}) 58%, transparent 72%)` }
      : preset === 'green_swap'
        ? { background: 'transparent' }
        : { background: `repeating-linear-gradient(to bottom, transparent 0 3px, rgba(0,0,0,${strength * 0.5}) 3px 6px)` };

  return createPortal(
    <div aria-label="H-Blank effect preview" style={{ position: 'fixed', left, top, width, height, zIndex: 2000, overflow: 'hidden', background: '#000', pointerEvents: 'none', imageRendering: 'pixelated', boxShadow: '0 4px 18px rgba(0,0,0,.35)' }}>
      <CurrentBackgroundThumbnail eventId={eventId} layerId={layerId} width={width} height={height} greenSwap={preset === 'green_swap'} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...overlayStyle }} />
    </div>,
    document.body,
  );
}

function HBlankPreviewArea({ eventId, layerId, preset, intensity, children }: { eventId: string; layerId: number; preset: string; intensity: number; children: React.ReactNode }) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const showPreview = () => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (rect) {
      window.dispatchEvent(new CustomEvent('gba-studio:event-preview-open', { detail: { eventId } }));
      setAnchor(rect);
    }
  };
  useEffect(() => {
    if (!anchor) return undefined;
    const updatePosition = () => {
      const rect = fieldRef.current?.getBoundingClientRect();
      if (rect) setAnchor(rect);
      else setAnchor(null);
    };
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [Boolean(anchor)]);

  return <div ref={fieldRef} onMouseEnter={showPreview} onMouseLeave={() => setAnchor(null)} onFocusCapture={showPreview} onBlurCapture={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAnchor(null);
  }}>
    {children}
    {anchor && <HBlankEffectPreview eventId={eventId} layerId={layerId} preset={preset} intensity={intensity} anchor={anchor} />}
  </div>;
}

/** Inspector for runtime events that previously appeared as unconfigurable nodes. */
export default function RuntimeEventPanel({ event, customTitle, onValueChange }: Props) {
  const { t } = useI18n();
  const { elementSelected, variables, settings } = useAppContexts();
  const singleLayerScene = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;
  const { notification } = App.useApp();
  const [musicFiles, setMusicFiles] = useState<string[]>([]);
  const [soundFiles, setSoundFiles] = useState<string[]>([]);
  const [dialoguePreview, setDialoguePreview] = useState<{ text: string; anchor: DOMRect; showFrame: boolean; horizontalAlign: 'left' | 'center' | 'right'; font: PreviewFontId } | null>(null);
  const [uiTextPreviewAnchor, setUiTextPreviewAnchor] = useState<DOMRect | null>(null);
  const [uiAnimationPreviewAnchor, setUiAnimationPreviewAnchor] = useState<DOMRect | null>(null);
  const [dialogueFrameSource, setDialogueFrameSource] = useState(frameImage);
  const [fontSources, setFontSources] = useState<Record<string, string>>({});
  const [fontPaletteColors, setFontPaletteColors] = useState<Record<string, string>>({});
  const [assetReloadVersion, setAssetReloadVersion] = useState(0);
  useEffect(() => {
    const reload = () => setAssetReloadVersion(version => version + 1);
    window.addEventListener('gba-studio:assets-reloaded', reload);
    return () => window.removeEventListener('gba-studio:assets-reloaded', reload);
  }, []);
  useEffect(() => {
    const closeWhenAnotherEventOpens = (previewEvent: Event) => {
      const openedEventId = (previewEvent as CustomEvent<{ eventId?: string }>).detail?.eventId;
      if (openedEventId === event.id) return;
      setDialoguePreview(null);
      setUiTextPreviewAnchor(null);
      setUiAnimationPreviewAnchor(null);
    };
    window.addEventListener('gba-studio:event-preview-open', closeWhenAnotherEventOpens);
    return () => window.removeEventListener('gba-studio:event-preview-open', closeWhenAnotherEventOpens);
  }, [event.id]);
  const dialogueBodyRef = useRef<HTMLDivElement>(null);
  const dialogueFieldRef = useRef<HTMLDivElement>(null);
  const choiceFieldRef = useRef<HTMLDivElement>(null);
  const uiTextFieldRef = useRef<HTMLDivElement>(null);
  const uiAnimationFieldRef = useRef<HTMLDivElement>(null);
  const [uiTextFieldFocused, setUiTextFieldFocused] = useState(false);
  const [dialogueFieldFocused, setDialogueFieldFocused] = useState(false);
  const [choiceFieldFocused, setChoiceFieldFocused] = useState(false);
  useEffect(() => {
    const selectedFrame = settings?.uiFrameImage;
    if (!selectedFrame) {
      setDialogueFrameSource(frameImage);
      return;
    }
    let cancelled = false;
    void window.electronAPI.fetchImages('ui').then((response: any) => {
      if (cancelled || response?.status !== 'success') return;
      const filename = (response.fileImages ?? []).find((file: string) => file === selectedFrame);
      if (filename && response.localPath) setDialogueFrameSource(`${response.localPath.replace(/[\\/]+$/, '')}/${filename}`);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [settings?.uiFrameImage]);
  useEffect(() => {
    void Promise.all([window.electronAPI.fetchImages('musics'), window.electronAPI.fetchImages('sounds')])
      .then(([music, sound]) => {
        setMusicFiles(music?.status === 'success' ? music.fileImages ?? [] : []);
        setSoundFiles(sound?.status === 'success' ? sound.fileImages ?? [] : []);
      }).catch(() => { setMusicFiles([]); setSoundFiles([]); });
  }, [assetReloadVersion]);
  useEffect(() => {
    void Promise.all([window.electronAPI.getCommonFontImages(), window.electronAPI.fetchImages('fonts')]).then(async ([images, fontsResponse]: [Record<string, string>, any]) => {
      const sources = { ...(images ?? {}) };
      const customByFont: Array<[PreviewFontId, string | null | undefined]> = [
        ['fixed8x8', settings?.font8x8Image],
        ['fixed8x16', settings?.font8x16Image],
        ['variable8x8', settings?.font8x8VariablesImage],
        ['variable8x16', settings?.font8x16VariablesImage],
        ['variable16x16', settings?.font16x16VariablesImage],
      ];
      if (fontsResponse?.status === 'success') {
        customByFont.forEach(([font, filename]) => {
          if (filename) sources[PREVIEW_FONTS[font].image] = `${fontsResponse.localPath}/${filename}`;
        });
      }
      const processed = await Promise.all(Object.entries(sources).map(async ([name, source]) => {
        const canvas = await loadPaletteTransparentImage(source);
        return [name, canvas?.toDataURL('image/png') ?? source] as const;
      }));
      setFontSources(Object.fromEntries(processed));
      const colors = await Promise.all(Object.entries(sources).map(async ([name, source]) => [name, await getPaletteIndexZeroColor(source)] as const));
      setFontPaletteColors(Object.fromEntries(colors.filter(([, color]) => Boolean(color)) as Array<[string, string]>));
    }).catch(() => undefined);
  }, [settings?.font8x8Image, settings?.font8x16Image, settings?.font8x8VariablesImage, settings?.font8x16VariablesImage, settings?.font16x16VariablesImage, assetReloadVersion]);
  const args: any = event.args ?? {};
  const hblankLayerId = singleLayerScene ? 2 : Math.max(0, Math.min(3, Number(args.layerId ?? 0)));
  const update = (patch: Record<string, unknown>) => {
    const next = { ...args, ...patch };
    if (event.command === EEvents.UI_SET_TEXT) {
      const font = (PREVIEW_FONTS[next.font as PreviewFontId] ? next.font : 'fixed8x16') as PreviewFontId;
      const bounds = measureFontText(font, String(next.text ?? ''));
      if (typeof next.x !== 'object') next.x = Math.max(0, Math.min(Math.max(0, 240 - bounds.width), Math.trunc(Number(next.x) || 0)));
      if (typeof next.y !== 'object') next.y = Math.max(0, Math.min(Math.max(0, 160 - bounds.height), Math.trunc(Number(next.y) || 0)));
    }
    onValueChange(event.id, next);
    if (actorPositionHovered.current) dispatchActorPositionPreview(next);
  };
  const actorPositionHovered = useRef(false);
  const dispatchActorPositionPreview = (next: any) => {
    const coordinate = (axis: 'x' | 'y') => {
      const raw = next[axis] ?? 0;
      const literal = typeof raw === 'number' ? raw : raw?.kind === 'number' || raw?.kind === 'literal' || raw?.type === 'number' ? raw.value : null;
      return Number.isFinite(literal) ? Math.trunc(literal) * (['EVENT_MOVE_ACTOR', 'EVENT_ACTOR_MOVE_TO'].includes(event.command) && next[axis + 'Unit'] === 'tiles' ? 16 : 1) : null;
    };
    const x = coordinate('x'), y = coordinate('y');
    window.dispatchEvent(new CustomEvent('gba-studio:actor-position-preview', { detail: x === null || y === null || !next.actorId ? null : { eventId: event.id, sceneId: elementSelected?.id, actorId: next.actorId, x, y } }));
  };
  useEffect(() => () => { window.dispatchEvent(new CustomEvent('gba-studio:actor-position-preview', { detail: null })); actorPositionHovered.current = false; }, [event.id]);
  const resolveVariablePreview = (value: string) => value.replace(/\$\{([^}]+)\}/g, (_match, id: string) => {
    const variable = variables.variables.find((entry: any) => entry.id === id || entry.symbol === id);
    if (!variable) return '';
    return String(variable.initialValue ?? (variable.type === 'boolean' ? false : variable.type === 'number' ? 0 : ''));
  });
  const sanitizeWithNotice = (value: string): string => {
    const unsupported = unsupportedDialogueCharacters(value);
    if (unsupported.length > 0) {
      notification.warning({
        message: 'Caractere não suportado',
        description: `${unsupported.map(character => JSON.stringify(character)).join(', ')} não é válido para o texto de diálogo.`,
        placement: 'topRight',
        duration: 3,
        showProgress: true,
        pauseOnHover: true,
      });
    }
    return sanitizeDialogueText(value);
  };
  const updateDialoguePreview = (text: string, horizontalAlign: 'left' | 'center' | 'right' = args.horizontalAlign ?? 'center') => {
    const anchor = (dialogueBodyRef.current ?? dialogueFieldRef.current)?.getBoundingClientRect();
    if (anchor) {
      window.dispatchEvent(new CustomEvent('gba-studio:event-preview-open', { detail: { eventId: event.id } }));
      setDialoguePreview({ text, anchor, showFrame: args.showFrame !== false, horizontalAlign, font: args.dialogueFont === 'fixed8x8' ? 'fixed8x8' : 'fixed8x16' });
    }
  };
  const updateUiTextPreview = () => {
    const anchor = uiTextFieldRef.current?.getBoundingClientRect();
    if (anchor) {
      window.dispatchEvent(new CustomEvent('gba-studio:event-preview-open', { detail: { eventId: event.id } }));
      setUiTextPreviewAnchor(anchor);
    }
  };
  const updateUiAnimationPreview = () => {
    const anchor = uiAnimationFieldRef.current?.getBoundingClientRect();
    if (anchor) {
      window.dispatchEvent(new CustomEvent('gba-studio:event-preview-open', { detail: { eventId: event.id } }));
      setUiAnimationPreviewAnchor(anchor);
    }
  };
  const updateChoicePreview = (text: string) => {
    const anchor = choiceFieldRef.current?.getBoundingClientRect();
    if (anchor) {
      window.dispatchEvent(new CustomEvent('gba-studio:event-preview-open', { detail: { eventId: event.id } }));
      setDialoguePreview({ text, anchor, showFrame: true, horizontalAlign: 'left', font: 'fixed8x16' });
    }
  };
  useEffect(() => {
    if (!dialoguePreview) return undefined;
    const updatePreviewPosition = () => {
      const anchor = (dialogueBodyRef.current ?? choiceFieldRef.current ?? dialogueFieldRef.current)?.getBoundingClientRect();
      if (anchor) setDialoguePreview(current => current ? { ...current, anchor } : current);
    };
    window.addEventListener('scroll', updatePreviewPosition, true);
    window.addEventListener('resize', updatePreviewPosition);
    return () => {
      window.removeEventListener('scroll', updatePreviewPosition, true);
      window.removeEventListener('resize', updatePreviewPosition);
    };
  }, [Boolean(dialoguePreview)]);
  useEffect(() => {
    if (!uiTextPreviewAnchor) return undefined;
    const updatePosition = () => {
      const anchor = uiTextFieldRef.current?.getBoundingClientRect();
      if (anchor) setUiTextPreviewAnchor(anchor);
      else setUiTextPreviewAnchor(null);
    };
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [Boolean(uiTextPreviewAnchor)]);
  useEffect(() => {
    if (!uiAnimationPreviewAnchor) return undefined;
    const updatePosition = () => {
      const anchor = uiAnimationFieldRef.current?.getBoundingClientRect();
      if (anchor) setUiAnimationPreviewAnchor(anchor);
      else setUiAnimationPreviewAnchor(null);
    };
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [Boolean(uiAnimationPreviewAnchor)]);
  const choiceOptions = Array.isArray(args.options) && args.options.length > 0 ? args.options.map(String) : [String(args.optionA ?? ''), String(args.optionB ?? '')].filter(Boolean);
  const choicePreviewText = `${String(args.prompt ?? '')}\n${choiceOptions.map((option: string, index: number) => `${index === 0 ? '> ' : '  '}${option}`).join('\n')}`;
  const uiTextFont = (PREVIEW_FONTS[args.font as PreviewFontId] ? args.font : 'fixed8x16') as PreviewFontId;
  const uiTextBounds = measureFontText(uiTextFont, String(args.text ?? ''));
  const uiTextMaxX = Math.max(0, 240 - uiTextBounds.width);
  const uiTextMaxY = Math.max(0, 160 - uiTextBounds.height);
  const dialogueTextField = [EEvents.DISPLAY_DIALOGUE, EEvents.DIALOGUE_SHOW].includes(event.command as EEvents) ? (
    <Form.Item label="Text">
      <div ref={dialogueFieldRef}>
        <VariableTextArea
          rows={5} value={args.text ?? ''} variables={variables.variables}
          onFocus={() => { setDialogueFieldFocused(true); updateDialoguePreview(resolveVariablePreview(String(args.text ?? ''))); }}
          onBlur={() => { setDialogueFieldFocused(false); setDialoguePreview(null); }}
          onChange={value => { const text = truncateUtf8(sanitizeWithNotice(value)); update({ text }); updateDialoguePreview(resolveVariablePreview(text)); }}
        />
      </div>
    </Form.Item>
  ) : null;
  const physicalButtonOptions = ['A', 'B', 'L', 'R', 'START', 'SELECT', 'UP', 'DOWN', 'LEFT', 'RIGHT'].map(button => ({ value: button, label: button }));
  const actionOptions = Object.keys(settings?.inputMap ?? {}).map(action => ({ value: action, label: `Action: ${action}` }));
  const buttonOptions = [...physicalButtonOptions, ...actionOptions];
  useEffect(() => {
    if (event.command === EEvents.WAIT_FOR_BUTTON) {
      const buttons = Array.isArray(args.buttons) && args.buttons.length > 0 ? args.buttons : [args.button ?? 'A'];
      customTitle?.(`Attach Script to ${buttons.join(', ')} Button`);
    }
  }, [event.command, event.id, args.button, args.buttons, customTitle]);
  const actorEntries = [
    ['__PLAYER__', { value: '__PLAYER__', label: 'Player' }] as const,
    ...(elementSelected?.actors ?? [])
      .filter(actor => Boolean(actor.id))
      .map(actor => [actor.id, { value: actor.id, label: actor.name ?? actor.actorId ?? actor.id }] as const),
  ];
  const actors = Array.from(new Map(actorEntries).values());
  const actorSelect = <Select showSearch allowClear style={{ width: '100%' }} value={args.actorId || undefined}
    options={actors} placeholder="Select actor" onChange={actorId => update({ actorId })} />;
  const musicSelect = <Select showSearch allowClear style={{ width: '100%' }} value={args.musicId || undefined}
    options={musicFiles.map(file => ({ value: file.replace(/\.[^/.]+$/, ''), label: file }))} placeholder="Select music" onChange={musicId => update({ musicId })} />;
  const soundSelect = <Select showSearch allowClear style={{ width: '100%' }} value={args.soundId || undefined}
    options={soundFiles.map(file => ({ value: file.replace(/\.[^/.]+$/, ''), label: file }))} placeholder="Select sound" onChange={soundId => update({ soundId })} />;
  const variableSelect = <Select showSearch allowClear style={{ width: '100%' }} value={args.resultVariable || undefined}
    options={variables.variables.map(variable => ({ value: variable.id, label: variable.name || variable.symbol }))} placeholder="Select result variable" onChange={resultVariable => update({ resultVariable })} />;
  const saveVariableSelect = <Select showSearch mode="multiple" allowClear style={{ width: '100%' }} value={args.variableIds ?? (args.variableId ? [args.variableId] : [])}
    options={variables.variables.map(variable => ({ value: variable.id, label: `${variable.name || variable.symbol} (${variable.type})` }))} placeholder="Select variable(s)" onChange={(variableIds: string[]) => update({ variableIds, variableId: variableIds[0] ?? '' })} />;
  const dialogueFontOptions = (['fixed8x8', 'fixed8x16'] as PreviewFontId[]).map(font => {
    return {
      value: font,
      label: font === 'fixed8x8' ? 'Font S' : 'Font M',
    };
  });
  const renderDialogueFontChoice = (font: PreviewFontId, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, textAlign: 'left' }}>
      <FontOptionPreview font={font} fontSources={fontSources} paletteColors={fontPaletteColors} />
      {label}
    </span>
  );
  const number = (label: string, key: string, min = 0, max?: number, defaultValue = min) => <Form.Item label={label}>
    {NUMERIC_EVENT_FIELDS[event.command]?.[key]
      ? <NumericEventInput value={args[key] ?? defaultValue} min={min} max={max} onChange={value => update({ [key]: value })} />
      : <InputNumber addonBefore={key === 'x' ? 'X' : key === 'y' ? 'Y' : undefined} style={{ width: '100%' }} min={min} max={max} precision={0} value={Number(args[key] ?? defaultValue)} onChange={value => update({ [key]: value ?? defaultValue })} />}
  </Form.Item>;
  const uiSources: any[] = [];
  const collectUiEvents = (items: any[]) => items.forEach(item => {
    if (!item || typeof item !== 'object') return;
    if (item.command === EEvents.UI_SET_TEXT || item.command === EEvents.UI_SET_VALUE) {
      const sourceArgs = item.args ?? {};
      const truncateLabel = (value: unknown) => {
        const text = String(value ?? '');
        return text.length > 24 ? `${text.slice(0, 23)}…` : text;
      };
      const label = item.command === EEvents.UI_SET_TEXT
        ? `UI: ${truncateLabel(sourceArgs.text)}`
        : `UI-Var: ${truncateLabel(sourceArgs.label)}`;
      uiSources.push({ value: item.id, label: label.trim(), text: item.command === EEvents.UI_SET_TEXT ? String(sourceArgs.text ?? '') : `${String(sourceArgs.label ?? '')}${sourceArgs.label ? ': ' : ''}${String(sourceArgs.value ?? 0)}`, x: Number(sourceArgs.x ?? 0), y: Number(sourceArgs.y ?? 0), font: sourceArgs.font ?? 'fixed8x16' });
    }
    if (item.children?.then) collectUiEvents(item.children.then);
    if (item.children?.else) collectUiEvents(item.children.else);
  });
  if (elementSelected) {
    const scene: any = elementSelected;
    collectUiEvents(scene.script ?? []);
    Object.values(scene.eventGraphs ?? {}).forEach((graph: any) => collectUiEvents(graph.nodes ?? []));
    [...(scene.triggers ?? []), ...(scene.actors ?? [])].forEach((entry: any) => {
      ['script', 'onEnterScript', 'onLeaveScript', 'onInteractScript', 'onInitScript', 'onUpdateScript'].forEach(key => collectUiEvents(entry[key] ?? []));
    });
  }
  const uniqueUiSources = Array.from(new Map(uiSources.map(source => [source.value, source])).values());
  const selectedUiSource = uniqueUiSources.find(source => source.value === args.uiId);
  const uiSpeedOptions = [
    { value: 0.25, label: 'Speed ¼ (Slower)', ppf: '0.25 PPF' },
    { value: 0.5, label: 'Speed ½', ppf: '0.5 PPF' },
    { value: 1, label: 'Speed 1', ppf: '1 PPF' },
    { value: 2, label: 'Speed 2', ppf: '2 PPF' },
    { value: 3, label: 'Speed 3', ppf: '3 PPF' },
    { value: 4, label: 'Speed 4 (Faster)', ppf: '4 PPF' },
  ];
  const uiSpeed = Number(args.speed ?? settings?.startMoveSpeed ?? 2);
  const customUiSpeed = args.customSpeed === true || !uiSpeedOptions.some(option => option.value === uiSpeed);
  const uiSpeedControl = <>
    <Form.Item label="Speed">
      <Select showSearch optionFilterProp="label" value={customUiSpeed ? 'custom' : uiSpeed} onChange={value => {
        if (value === 'custom') {
          const configuredSpeed = Number(settings?.startMoveSpeed);
          const customSpeed = configuredSpeed > 0 && configuredSpeed <= 10 && !uiSpeedOptions.some(option => option.value === configuredSpeed) ? configuredSpeed : 1.25;
          update({ customSpeed: true, speed: customSpeed });
        } else update({ customSpeed: false, speed: Number(value) });
      }}>
        {uiSpeedOptions.map(option => <Select.Option key={option.value} value={option.value} label={`${option.label} ${option.ppf}`}>
          <span style={{ display: 'flex', justifyContent: 'space-between' }}>{option.label}<span style={{ opacity: 0.6, marginLeft: 8 }}>{option.ppf}</span></span>
        </Select.Option>)}
        <Select.Option value="custom" label="Custom Speed">Custom Speed</Select.Option>
      </Select>
    </Form.Item>
    {customUiSpeed && <Form.Item label="Custom speed (pixels per frame)">
      <InputNumber min={0.0625} max={10} step={0.0625} precision={4} value={uiSpeed} onChange={value => update({ customSpeed: true, speed: value ?? 1.25 })} style={{ width: '100%' }} />
    </Form.Item>}
  </>;

  const actorMoveUnits = event.command === EEvents.MOVE_ACTOR || event.command === EEvents.ACTOR_MOVE_TO;
  const actorPositionHover = {
    onMouseEnter: () => { actorPositionHovered.current = true; dispatchActorPositionPreview(args); },
    onMouseLeave: () => { actorPositionHovered.current = false; window.dispatchEvent(new CustomEvent('gba-studio:actor-position-preview', { detail: null })); },
  };
  const actorPositionControl = <Form.Item>
    <Flex gap={8} style={{ width: '100%' }}>
      {(['x', 'y'] as const).map(axis => <Flex key={axis} vertical gap={4} style={{ flex: 1, minWidth: 0 }}>
        <Flex align="center" gap={4}><Typography.Text style={{ fontSize: 12 }}>{axis.toUpperCase()}</Typography.Text>
          {actorMoveUnits && <Button type="text" size="small" aria-label={t('events.actor.coordinateUnit', { axis: axis.toUpperCase() })} title={t('events.actor.tileUnitHint')} style={{ height: 20, paddingInline: 4, fontSize: 11 }} onClick={() => { const unit = args[axis + 'Unit'] === 'tiles' ? 'pixels' : 'tiles'; update({ xUnit: unit, yUnit: unit }); }}>{args[axis + 'Unit'] === 'tiles' ? t('events.actor.tiles') : 'px'}</Button>}
        </Flex>
        <NumericEventInput min={0} value={args[axis] ?? 0} onChange={value => update({ [axis]: value })} />
      </Flex>)}
    </Flex>
  </Form.Item>;

  switch (event.command) {
    case EEvents.SPAWN_ACTOR:
    case EEvents.ACTOR_SPAWN:
      return <div {...actorPositionHover}><Form layout="vertical"><Form.Item label="Actor ID">{actorSelect}</Form.Item>{actorPositionControl}</Form></div>;
    case EEvents.MOVE_ACTOR:
    case EEvents.ACTOR_MOVE_TO:
    case EEvents.ACTOR_SET_POSITION:
      return <div {...actorPositionHover}><Form layout="vertical"><Form.Item label="Actor ID">{actorSelect}</Form.Item>{actorPositionControl}
        {actorMoveUnits && <ActorMotionSpeedControl enabled={args.animated ?? event.command === EEvents.ACTOR_MOVE_TO} speed={args.speed ?? settings?.startMoveSpeed ?? 1} animationSpeed={args.animationSpeed ?? settings?.startAnimSpeed ?? 6} onChange={update} />}
      </Form></div>;
    case EEvents.REMOVE_ACTOR:
    case EEvents.ACTOR_DESPAWN:
      return <Form layout="vertical"><Form.Item label="Actor ID">{actorSelect}</Form.Item></Form>;
    case EEvents.VISIBLE_ACTOR:
    case EEvents.ACTOR_SET_VISIBLE:
      return <Form layout="vertical"><Form.Item label="Actor ID">{actorSelect}</Form.Item><Form.Item label="Visible"><Switch checked={args.visible !== false} onChange={visible => update({ visible })} /></Form.Item></Form>;
    case EEvents.SET_ACTOR_PRIORITY:
      return <Form layout="vertical"><Form.Item label="Actor ID">{actorSelect}</Form.Item>{number('Priority', 'priority', 0, 3)}</Form>;
    case EEvents.HIDE_ACTOR:
    case EEvents.SHOW_ACTOR:
      return <Form layout="vertical"><Form.Item label="Actor ID">{actorSelect}</Form.Item></Form>;
    case EEvents.HIDE_ALL_SPRITES:
      return <Space><Typography.Text type="secondary">Hides all sprites in the current scene.</Typography.Text></Space>;
    case EEvents.SHOW_ALL_SPRITES:
      return <Space><Typography.Text type="secondary">Shows all sprites in the current scene.</Typography.Text></Space>;
    case EEvents.PLAY_MUSIC:
      return <Form layout="vertical"><Form.Item label="Music">{musicSelect}</Form.Item>{number('Volume', 'volume', 0, 100)}</Form>;
    case EEvents.MUSIC_PLAY_JINGLE:
      return <Form layout="vertical"><Form.Item label="Jingle">{musicSelect}</Form.Item>{number('Volume', 'volume', 0, 100)}</Form>;
    case EEvents.PLAY_SOUND:
      return <Form layout="vertical"><Form.Item label="Sound">{soundSelect}</Form.Item><Form.Item label="Group"><Input value={args.group ?? ''} placeholder="Optional group" onChange={event => update({ group: event.target.value })} /></Form.Item>{number('Volume', 'volume', 0, 100, 100)}{number('Speed (%)', 'speed', 25, 400, 100)}{number('Panning (%)', 'panning', -100, 100, 0)}{number('Priority', 'priority', -32767, 32767, 0)}</Form>;
    case EEvents.RUMBLE:
      return <Form layout="vertical">{number('Duration (frames)', 'durationFrames', 1, 120, 8)}{number('Intensity', 'intensity', 0, 100, 100)}</Form>;
    case EEvents.SET_MUSIC_VOLUME:
      return <Form layout="vertical">{number('Volume', 'volume', 0, 100)}</Form>;
    case EEvents.SOUND_STOP:
      return <Form layout="vertical"><Form.Item label="Group"><Input value={args.group ?? ''} placeholder="Blank stops all sounds" onChange={event => update({ group: event.target.value })} /></Form.Item></Form>;
    case EEvents.HBE_EFFECT_ENABLE:
      return <HBlankPreviewArea eventId={event.id} layerId={hblankLayerId} preset={args.preset ?? 'mosaic_wave'} intensity={Number(args.intensity ?? 8)}><Form layout="vertical">
        <Form.Item label="Preset"><Select value={args.preset ?? 'mosaic_wave'} options={[{ value: 'mosaic_wave', label: 'Mosaic wave' }, { value: 'mosaic_in', label: 'Mosaic in' }, { value: 'backdrop_gradient', label: 'Backdrop gradient' }, { value: 'palette_wave', label: 'Palette wave' }, { value: 'green_swap', label: 'Green swap' }]} onChange={preset => update({ preset })} /></Form.Item>
        {args.preset === 'green_swap'
          ? <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>Green Swap is an on/off hardware effect; intensity does not change it.</Typography.Text>
          : number('Intensity', 'intensity', 0, 16, 8)}
        <Form.Item label="Layer">
          <Segmented block value={hblankLayerId} options={(singleLayerScene ? [2] : [0, 1, 2, 3]).map(layerId => ({ value: layerId, label: `Layer ${layerId}` }))} onChange={value => update({ layerId: value as number })} />
        </Form.Item>
        <Form.Item label="Current background" style={{ marginBottom: 0 }}>
          <CurrentBackgroundThumbnail eventId={event.id} layerId={hblankLayerId} />
        </Form.Item>
      </Form></HBlankPreviewArea>;
    case EEvents.HBE_EFFECT_DISABLE:
      return <Space><Typography.Text type="secondary">Disables the active H-Blank preset.</Typography.Text></Space>;
    case EEvents.BLEND_ALPHA:
      return <Form layout="vertical">{number('Transparency alpha (%)', 'alpha', 0, 100, 100)}</Form>;
    case EEvents.SHOOTER_START:
    case EEvents.SHOOTER_SPAWN_WAVE:
      return <Form layout="vertical"><Form.Item label="Wave ID"><Input value={args.waveId ?? ''} placeholder="Default wave" onChange={event => update({ waveId: event.target.value })} /></Form.Item></Form>;
    case EEvents.SHOOTER_LOAD_STAGE:
      return <Form layout="vertical"><Form.Item label="Wave ID"><Input value={args.waveId ?? ''} placeholder="Default wave" onChange={event => update({ waveId: event.target.value })} /></Form.Item><Form.Item label="Music ID"><Input value={args.musicId ?? ''} placeholder="Keep current music" onChange={event => update({ musicId: event.target.value })} /></Form.Item>{number('Music volume', 'musicVolume', 0, 100, 100)}<Form.Item label="Background ID"><Input value={args.backgroundId ?? ''} placeholder="Keep current background" onChange={event => update({ backgroundId: event.target.value })} /></Form.Item>{number('Background layer', 'backgroundLayer', 0, 3, 0)}</Form>;
    case EEvents.SHOOTER_SET_BACKGROUND_MODE:
      return <Form layout="vertical">{number('Layer', 'layerId', 0, 3, 0)}<Form.Item label="Visible"><Switch checked={args.visible !== false} onChange={visible => update({ visible })} /></Form.Item>{number('Scroll X', 'x', -2048, 2048, 0)}{number('Scroll Y', 'y', -2048, 2048, 0)}{number('Parallax X (%)', 'x', -200, 200, 100)}{number('Parallax Y (%)', 'y', -200, 200, 100)}</Form>;
    case EEvents.SHOOTER_SPAWN_BOSS:
      return <Form layout="vertical"><Form.Item label="Boss archetype"><Input value={args.archetypeId ?? ''} onChange={event => update({ archetypeId: event.target.value })} /></Form.Item>{number('X', 'x', -512, 512, 120)}{number('Y', 'y', -512, 512, 32)}<Form.Item label="Drop ID"><Input value={args.dropId ?? ''} onChange={event => update({ dropId: event.target.value })} /></Form.Item></Form>;
    case EEvents.SHOOTER_SET_BOSS_PHASE:
      return <Form layout="vertical">{number('Boss phase', 'phase', 0, 7, 0)}</Form>;
    case EEvents.SHOOTER_WAIT_SIGNAL:
      return <Form layout="vertical"><Form.Item label="Signal"><Select value={args.signal ?? 'wave_cleared'} options={[{ value: 'wave_cleared', label: 'Wave cleared' }, { value: 'boss_defeated', label: 'Boss defeated' }, { value: 'player_dead', label: 'Player dead' }, { value: 'stage_cleared', label: 'Stage cleared' }]} onChange={signal => update({ signal })} /></Form.Item>{number('Timeout (frames, 0 = infinite)', 'timeoutFrames', 0, 65535, 0)}</Form>;
    case EEvents.SHOOTER_GRANT:
      return <Form layout="vertical"><Form.Item label="Grant"><Select value={args.grant ?? 'score'} options={[{ value: 'weapon', label: 'Weapon level' }, { value: 'bombs', label: 'Bombs' }, { value: 'shield', label: 'Shield' }, { value: 'experience', label: 'Experience' }, { value: 'score', label: 'Score' }]} onChange={grant => update({ grant })} /></Form.Item>{number('Amount', 'value', 0, 9999, 1)}</Form>;
    case EEvents.SHOOTER_SET_STAT:
    case EEvents.SHOOTER_ADD_STAT:
      return <Form layout="vertical"><Form.Item label="Stat"><Select value={args.stat ?? 'player_hit_points'} options={[{ value: 'player_hit_points', label: 'Player hit points' }, { value: 'default_damage', label: 'Default damage' }, { value: 'score', label: 'Score' }, { value: 'level', label: 'Level' }, { value: 'bombs', label: 'Bombs' }, { value: 'shield', label: 'Shield' }, { value: 'experience', label: 'Experience' }, { value: 'mode_flags', label: 'Mode flags' }]} onChange={stat => update({ stat })} /></Form.Item>{number('Value', 'value', event.command === EEvents.SHOOTER_ADD_STAT ? -9999 : 0, 9999, event.command === EEvents.SHOOTER_ADD_STAT ? 1 : 3)}</Form>;
    case EEvents.SHOOTER_PAUSE:
      return <Form layout="vertical"><Form.Item label="Paused"><Switch checked={args.paused === true} onChange={paused => update({ paused })} /></Form.Item></Form>;
    case EEvents.SHOOTER_SET_PLAYER_ENABLED:
      return <Form layout="vertical"><Form.Item label="Player enabled"><Switch checked={args.enabled !== false} onChange={enabled => update({ enabled })} /></Form.Item></Form>;
    case EEvents.SPRITE_EFFECT:
      return <Form layout="vertical"><Form.Item label="Actor ID"><Input value={args.actorId ?? ''} onChange={event => update({ actorId: event.target.value })} /></Form.Item>{number('Rotation (degrees)', 'rotation', -180, 180, 0)}{number('Scale (%)', 'scale', 10, 400, 100)}<Form.Item label="Visible"><Switch checked={args.visible !== false} onChange={visible => update({ visible })} /></Form.Item><Form.Item label="Fade color"><Select value={args.fadeColor ?? 'none'} options={[{ value: 'none', label: 'None' }, { value: 'black', label: 'Black' }, { value: 'white', label: 'White' }]} onChange={fadeColor => update({ fadeColor })} /></Form.Item>{number('Fade intensity (%)', 'fadeIntensity', 0, 100, 0)}{number('Duration (frames)', 'durationFrames', 1, 600, 1)}</Form>;
    case EEvents.UI_SET_TEXT:
      return <>
        <div ref={uiTextFieldRef} onMouseEnter={updateUiTextPreview} onMouseLeave={() => { if (!uiTextFieldFocused) setUiTextPreviewAnchor(null); }}>
          <Form layout="vertical">
            <Form.Item label="Text">
              <Input.TextArea
                rows={3}
                maxLength={DIALOGUE_MAX_BYTES}
                showCount={{ formatter: dialogueCount }}
                value={args.text ?? ''}
                onFocus={() => { setUiTextFieldFocused(true); updateUiTextPreview(); }}
                onBlur={() => { setUiTextFieldFocused(false); setUiTextPreviewAnchor(null); }}
                onChange={event => update({ text: truncateUtf8(sanitizeWithNotice(event.target.value)) })}
              />
            </Form.Item>
            <Form.Item label="Position">
                <Flex gap={8} style={{ width: '100%' }}>
        <NumericEventInput label="X" min={0} max={uiTextMaxX} value={args.x ?? 0} onChange={x => update({ x: x ?? 0 })} style={{ flex: 1, minWidth: 0 }} />
        <NumericEventInput label="Y" min={0} max={uiTextMaxY} value={args.y ?? 0} onChange={y => update({ y: y ?? 0 })} style={{ flex: 1, minWidth: 0 }} />
              </Flex>
            </Form.Item>
            <Form.Item label="Font">
              <Select
                size="large"
                showSearch
                optionFilterProp="label"
                optionRender={option => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, textAlign: 'left' }}><FontOptionPreview font={option.value as PreviewFontId} fontSources={fontSources} paletteColors={fontPaletteColors} />{String(option.label ?? '')}</span>}
                labelRender={({ value, label }) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, textAlign: 'left' }}><FontOptionPreview font={value as PreviewFontId} fontSources={fontSources} paletteColors={fontPaletteColors} />{String(label ?? '')}</span>}
                value={args.font ?? 'fixed8x16'}
                options={[{ value: 'fixed8x8', label: 'Fixed 8x8' }, { value: 'fixed8x16', label: 'Fixed 8x16' }, { value: 'variable8x8', label: 'Variable 8x8' }, { value: 'variable8x16', label: 'Variable 8x16' }, { value: 'variable16x16', label: 'Variable 16x16' }]}
                onChange={font => update({ font })}
              />
            </Form.Item>
          </Form>
        </div>
        {uiTextPreviewAnchor && <UiTextPreview text={String(args.text ?? '')} anchor={uiTextPreviewAnchor} x={Number(args.x ?? 0)} y={Number(args.y ?? 0)} font={(PREVIEW_FONTS[args.font as PreviewFontId] ? args.font : 'fixed8x16') as PreviewFontId} fontSources={fontSources} />}
      </>;
    case EEvents.UI_SET_VALUE:
      return <Form layout="vertical"><Form.Item label="Label"><Input value={args.label ?? ''} placeholder="Score" onChange={event => update({ label: event.target.value })} /></Form.Item>{number('Value', 'value', -99999999, 99999999, 0)}{number('X', 'x', -240, 240, 0)}{number('Y', 'y', -160, 160, 0)}<Form.Item label="Font"><Select value={args.font ?? 'fixed8x16'} options={[{ value: 'fixed8x8', label: 'Fixed 8x8' }, { value: 'fixed8x16', label: 'Fixed 8x16' }, { value: 'variable8x8', label: 'Variable 8x8' }, { value: 'variable8x16', label: 'Variable 8x16' }, { value: 'variable16x16', label: 'Variable 16x16' }]} onChange={font => update({ font })} /></Form.Item></Form>;
    case EEvents.UI_ANIMATE:
      return <>
        <div ref={uiAnimationFieldRef} onMouseEnter={updateUiAnimationPreview} onMouseLeave={() => setUiAnimationPreviewAnchor(null)}>
          <Form layout="vertical">
            <Form.Item label="UI"><Select showSearch optionFilterProp="label" value={args.uiId || undefined} options={uniqueUiSources} placeholder="Select UI" onChange={uiId => { update({ uiId }); updateUiAnimationPreview(); }} /></Form.Item>
            <Form.Item label="Animation"><Select value={args.animation ?? 'move'} options={[{ value: 'move', label: 'Move' }, { value: 'blink', label: 'Blink' }]} onChange={animation => update({ animation })} /></Form.Item>
            <div style={{ borderTop: '1px solid var(--color-border-secondary, #ddd)', margin: '8px 0' }} />
            {args.animation === 'blink' ? <>{uiSpeedControl}<Form.Item label="Duration (optional; empty = infinite)"><NumericEventInput min={1} max={600} value={args.durationFrames ?? 1} onChange={durationFrames => update({ durationFrames: durationFrames ?? undefined })} style={{ width: '100%' }} /></Form.Item></> : <><Form.Item label="Target position"><Flex gap={8} style={{ width: '100%' }}><NumericEventInput label="X" min={0} max={240} value={args.x ?? 0} onChange={x => update({ x: x ?? 0 })} style={{ flex: 1, minWidth: 0 }} /><NumericEventInput label="Y" min={0} max={160} value={args.y ?? 0} onChange={y => update({ y: y ?? 0 })} style={{ flex: 1, minWidth: 0 }} /></Flex></Form.Item>{uiSpeedControl}</>}
          </Form>
        </div>
        {uiAnimationPreviewAnchor && selectedUiSource && <UiTextPreview
          text={selectedUiSource.text} anchor={uiAnimationPreviewAnchor} x={selectedUiSource.x} y={selectedUiSource.y}
          font={(PREVIEW_FONTS[selectedUiSource.font as PreviewFontId] ? selectedUiSource.font : 'fixed8x16') as PreviewFontId} fontSources={fontSources}
          effect={{ id: event.id, animation: args.animation === 'blink' ? 'blink' : 'move', targetX: Number(args.x ?? selectedUiSource.x), targetY: Number(args.y ?? selectedUiSource.y), speed: uiSpeed, durationFrames: args.durationFrames }}
        />}
      </>;
    case EEvents.UI_DESTROY:
    case EEvents.UI_HIDE:
    case EEvents.UI_SHOW:
      return <Form layout="vertical">
        <Typography.Paragraph type="secondary">{t(`events.ui.${event.command === EEvents.UI_DESTROY ? 'destroyHint' : event.command === EEvents.UI_HIDE ? 'hideHint' : 'showHint'}`)}</Typography.Paragraph>
        <Form.Item label={t('events.ui.target')}><Select aria-label={t('events.ui.target')} showSearch optionFilterProp="label" value={args.uiId || undefined} options={uniqueUiSources} placeholder={t('events.ui.selectTarget')} onChange={uiId => update({ uiId })} /></Form.Item>
      </Form>;
    case EEvents.UI_ANIMATION_STOP:
      return <Form layout="vertical"><Form.Item label="UI"><Select showSearch optionFilterProp="label" value={args.uiId || undefined} options={uniqueUiSources} placeholder="Select UI" onChange={uiId => update({ uiId })} /></Form.Item></Form>;
    case EEvents.DISPLAY_DIALOGUE:
    case EEvents.DIALOGUE_SHOW:
    case EEvents.TEXT_SCROLL:
    case EEvents.CREDITS_PLAY:
      return <div ref={dialogueBodyRef} onMouseEnter={() => updateDialoguePreview(resolveVariablePreview(String(args.text ?? '')))} onMouseLeave={() => { if (!dialogueFieldFocused) setDialoguePreview(null); }}><Form layout="vertical">{dialogueTextField}<Form.Item label="Font"><Select size="large" showSearch optionFilterProp="label" optionRender={option => renderDialogueFontChoice(option.value as PreviewFontId, String(option.label ?? ''))} labelRender={({ value, label }) => renderDialogueFontChoice(value as PreviewFontId, typeof label === 'string' ? label : (value === 'fixed8x8' ? 'Font S' : 'Font M'))} value={args.dialogueFont === 'fixed8x8' ? 'fixed8x8' : 'fixed8x16'} options={dialogueFontOptions} onChange={dialogueFont => { update({ dialogueFont }); setDialoguePreview(current => current ? { ...current, font: dialogueFont as PreviewFontId } : current); }} /></Form.Item><Form.Item label="Show frame"><Switch checked={args.showFrame !== false} onChange={showFrame => { update({ showFrame }); setDialoguePreview(current => current ? { ...current, showFrame } : current); }} /></Form.Item><Form.Item label="Horizontal alignment"><Segmented block value={args.horizontalAlign ?? 'center'} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centered' }, { value: 'right', label: 'Right' }]} onChange={horizontalAlign => { update({ horizontalAlign }); setDialoguePreview(current => current ? { ...current, horizontalAlign } : current); }} /></Form.Item><Form.Item label="Vertical position"><Segmented block value={args.verticalAlign ?? 'bottom'} options={[{ value: 'top', label: 'Top' }, { value: 'center', label: 'Center' }, { value: 'bottom', label: 'Bottom' }]} onChange={verticalAlign => update({ verticalAlign })} /></Form.Item><Form.Item label="Animation speed" style={{ marginBottom: 4 }}><Switch checked={args.animate !== false} onChange={animate => update({ animate })} /></Form.Item><Form.Item style={{ marginBottom: 0 }}><Segmented block value={args.animationSpeed ?? 'medium'} options={[{ value: 'slow', label: 'Slow' }, { value: 'medium', label: 'Medium' }, { value: 'fast', label: 'Fast' }]} onChange={animationSpeed => update({ animationSpeed })} /></Form.Item></Form>{dialoguePreview && <DialoguePreview {...dialoguePreview} frameSource={dialogueFrameSource} fontSources={fontSources} />}</div>;
    case EEvents.SAVE_WRITE:
    case EEvents.SAVE_LOAD:
      return <Form layout="vertical">{number('Slot', 'slot', 0, 15, 0)}<Form.Item label="Variable(s)">{saveVariableSelect}</Form.Item>{number('Schema version', 'schema', 1, 255, 1)}</Form>;
    case EEvents.DIALOGUE_CHOICE:
    case EEvents.MENU_OPEN:
      return <><div ref={choiceFieldRef} onMouseEnter={() => updateChoicePreview(choicePreviewText)} onMouseLeave={() => { if (!choiceFieldFocused) setDialoguePreview(null); }}><Form layout="vertical"><Form.Item label="Prompt"><Input.TextArea rows={2} showCount={{ formatter: dialogueCount }} value={args.prompt ?? ''} onFocus={() => { setChoiceFieldFocused(true); updateChoicePreview(choicePreviewText); }} onBlur={() => { setChoiceFieldFocused(false); setDialoguePreview(null); }} onChange={e => { const prompt = truncateUtf8(sanitizeWithNotice(e.target.value)); update({ prompt }); updateChoicePreview(`${prompt}\n${choiceOptions.map((option: string, index: number) => `${index === 0 ? '> ' : '  '}${option}`).join('\n')}`); }} /></Form.Item>{event.command === EEvents.MENU_OPEN ? <Form.Item label="Options"><Select mode="tags" value={Array.isArray(args.options) && args.options.length > 0 ? args.options : choiceOptions} tokenSeparators={[',']} onChange={(options: string[]) => update({ options: options.map(option => truncateUtf8(sanitizeWithNotice(option))), optionA: options[0] ?? '', optionB: options[1] ?? '' })} placeholder="Menu options" /></Form.Item> : <><Form.Item label="Option A"><Input showCount maxLength={DIALOGUE_MAX_BYTES} value={args.optionA ?? ''} onChange={e => update({ optionA: truncateUtf8(sanitizeWithNotice(e.target.value)) })} /></Form.Item><Form.Item label="Option B"><Input showCount maxLength={DIALOGUE_MAX_BYTES} value={args.optionB ?? ''} onChange={e => update({ optionB: truncateUtf8(sanitizeWithNotice(e.target.value)) })} /></Form.Item></>}<Form.Item label="Result variable">{variableSelect}</Form.Item></Form></div>{dialoguePreview && <DialoguePreview {...dialoguePreview} frameSource={dialogueFrameSource} fontSources={fontSources} />}</>;
    case EEvents.FOR:
      return <Form layout="vertical">
        <Form.Item label="Variable"><Select showSearch allowClear style={{ width: '100%' }} value={args.variableId || undefined} options={variables.variables.filter(variable => variable.type === 'number').map(variable => ({ value: variable.id, label: variable.name || variable.symbol }))} placeholder="Select numeric variable" onChange={variableId => update({ variableId })} /></Form.Item>
        {number('Start', 'start')}
        {number('End', 'end')}
        {number('Step (negative decrements)', 'step', -999999)}
      </Form>;
    case EEvents.WAIT_FOR_BUTTON:
      return <Form layout="vertical"><Form.Item label="Buttons"><Select mode="multiple" value={args.buttons ?? (args.button ? [args.button] : ['A'])} options={buttonOptions} onChange={buttons => update({ buttons, button: buttons[0] ?? 'A' })} /></Form.Item><Form.Item><Space><Tooltip title="Set if the script should replace the default game action for the specified button."><Switch checked={args.overrideButton === true} onChange={overrideButton => update({ overrideButton })} /></Tooltip><Typography.Text>Override default button action</Typography.Text></Space></Form.Item></Form>;
    case EEvents.WAIT_INPUT:
      return <Form layout="vertical"><Form.Item label="Input action"><Select showSearch value={args.action ?? 'confirm'} options={actionOptions} placeholder="Select logical action" onChange={action => update({ action })} /></Form.Item>{number('Timeout (frames, 0 = infinite)', 'timeoutFrames', 0)}</Form>;
    case EEvents.IF_BUTTON_HELD:
      return <Form layout="vertical"><Form.Item label="Buttons"><Select mode="multiple" value={args.buttons ?? (args.button ? [args.button] : ['A'])} options={buttonOptions} onChange={buttons => update({ buttons, button: buttons[0] ?? 'A' })} /></Form.Item></Form>;
    case EEvents.INPUT_ENABLE:
    case EEvents.INPUT_DISABLE:
      return <Form layout="vertical"><Form.Item label="Input group"><Select value={args.group ?? 'gameplay'} options={[{ value: 'gameplay', label: 'Gameplay' }, { value: 'menu', label: 'Menu' }, { value: 'interaction', label: 'Interaction' }, { value: 'all', label: 'All input' }]} onChange={group => update({ group })} /></Form.Item></Form>;
    case EEvents.BACKGROUND_SCROLL:
      return <Form layout="vertical">
        <Form.Item label="Current background">
          <Segmented block value={singleLayerScene ? 2 : Number(args.layerId ?? 0)} options={(singleLayerScene ? [2] : [0, 1, 2, 3]).map(layerId => ({ value: layerId, label: `Layer ${layerId}` }))} onChange={value => update({ layerId: Number(value) })} />
        </Form.Item>
        <CurrentBackgroundThumbnail eventId={event.id} layerId={singleLayerScene ? 2 : Number(args.layerId ?? 0)} />
        <Flex gap={8} style={{ width: '100%' }}>
          <NumericEventInput label="X" min={-32768} max={32767} value={args.x ?? 0} onChange={x => update({ x })} style={{ flex: 1, minWidth: 0 }} />
          <NumericEventInput label="Y" min={-32768} max={32767} value={args.y ?? 0} onChange={y => update({ y })} style={{ flex: 1, minWidth: 0 }} />
        </Flex>
      </Form>;
    case EEvents.BACKGROUND_SET_PARALLAX:
      return <Form layout="vertical">{number('Layer', 'layerId', 0, 3, 0)}{number('Factor X (%)', 'x', -200, 200, 100)}{number('Factor Y (%)', 'y', -200, 200, 100)}</Form>;
    case EEvents.BREAK:
      return <Space><Typography.Text type="secondary">Encerra o loop atual; não há parâmetros.</Typography.Text></Space>;
    case EEvents.CONTINUE:
      return <Space><Typography.Text type="secondary">Interrompe a iteração atual e passa para a próxima.</Typography.Text></Space>;
    case EEvents.STOP_MUSIC:
    case EEvents.MUSIC_STOP:
    case EEvents.MUSIC_RESUME:
    case EEvents.MUSIC_PAUSE:
    case EEvents.SHOOTER_STOP:
    case EEvents.SHOOTER_CLEAR_ENEMIES:
    case EEvents.HIDE_DIALOGUE:
    case EEvents.DIALOGUE_CLOSE:
      return <Space><Typography.Text type="secondary">Este evento não possui parâmetros.</Typography.Text></Space>;
    default:
      return null;
  }
}

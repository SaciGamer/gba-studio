import useAppContexts from '@/providers/contexts/AppContexts';
import { IArgs, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { App, Form, Input, Segmented, Select, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import StepInputNumber, { InputNumber } from '../StepInputNumber';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EEvents } from './interfaces/IEvents';
import frameImage from '@/img/frame.png';
import { DIALOGUE_MAX_BYTES, truncateUtf8, utf8ByteLength } from '@/utils/dialogueText';
import { fontCharacterWidth as metricCharacterWidth, fontGlyphIndex as metricGlyphIndex, PREVIEW_FONTS, type PreviewFontId } from '@/utils/fontMetrics';
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
    <Input.TextArea rows={rows} maxLength={255} showCount value={value} onFocus={onFocus} onBlur={onBlur} onChange={event => onChange(event.target.value)} />
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
      boxSizing: 'border-box', padding: 0, color: '#111',
      border: '8px solid transparent', borderImage: showFrame ? `url(${frameSource}) 8 fill / 8px / 0 stretch` : 'none',
      background: showFrame ? '#fff' : 'transparent', imageRendering: 'pixelated', pointerEvents: 'none',
      overflow: 'hidden', fontFamily: 'monospace', fontSize: 8, lineHeight: `${PREVIEW_FONTS[font].glyphHeight}px`,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: horizontalAlign,
    }}><DialogueGlyphText lines={lines} horizontalAlign={horizontalAlign} font={font} fontSources={fontSources} /></div>,
    document.body,
  );
}

/** Inspector for runtime events that previously appeared as unconfigurable nodes. */
export default function RuntimeEventPanel({ event, customTitle, onValueChange }: Props) {
  const { elementSelected, variables, settings } = useAppContexts();
  const { notification } = App.useApp();
  const [musicFiles, setMusicFiles] = useState<string[]>([]);
  const [soundFiles, setSoundFiles] = useState<string[]>([]);
  const [dialoguePreview, setDialoguePreview] = useState<{ text: string; anchor: DOMRect; showFrame: boolean; horizontalAlign: 'left' | 'center' | 'right'; font: PreviewFontId } | null>(null);
  const [dialogueFrameSource, setDialogueFrameSource] = useState(frameImage);
  const [fontSources, setFontSources] = useState<Record<string, string>>({});
  const [fontPaletteColors, setFontPaletteColors] = useState<Record<string, string>>({});
  const dialogueBodyRef = useRef<HTMLDivElement>(null);
  const dialogueFieldRef = useRef<HTMLDivElement>(null);
  const choiceFieldRef = useRef<HTMLDivElement>(null);
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
  }, []);
  useEffect(() => {
    void Promise.all([window.electronAPI.getCommonFontImages(), window.electronAPI.fetchImages('fonts')]).then(async ([images, fontsResponse]: [Record<string, string>, any]) => {
      const sources = { ...(images ?? {}) };
      const customByFont: Array<[PreviewFontId, string | null | undefined]> = [
        ['fixed8x8', settings?.font8x8Image],
        ['fixed8x16', settings?.font8x16Image],
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
  }, [settings?.font8x8Image, settings?.font8x16Image]);
  const args: any = event.args ?? {};
  const update = (patch: Record<string, unknown>) => onValueChange(event.id, { ...args, ...patch });
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
    if (anchor) setDialoguePreview({ text, anchor, showFrame: args.showFrame !== false, horizontalAlign, font: args.dialogueFont === 'fixed8x8' ? 'fixed8x8' : 'fixed8x16' });
  };
  const updateChoicePreview = (text: string) => {
    const anchor = choiceFieldRef.current?.getBoundingClientRect();
    if (anchor) setDialoguePreview({ text, anchor, showFrame: true, horizontalAlign: 'left', font: 'fixed8x16' });
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
  const choicePreviewText = `${String(args.prompt ?? '')}\n> ${String(args.optionA ?? '')}\n  ${String(args.optionB ?? '')}`;
  const dialogueTextField = event.command === EEvents.DISPLAY_DIALOGUE ? (
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
  const buttonOptions = ['A', 'B', 'L', 'R', 'START', 'SELECT', 'UP', 'DOWN', 'LEFT', 'RIGHT'].map(button => ({ value: button, label: button }));
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
  const dialogueFontOptions = (['fixed8x8', 'fixed8x16'] as PreviewFontId[]).map(font => {
    const metrics = PREVIEW_FONTS[font];
    return {
      value: font,
      label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32 }}><FontOptionPreview font={font} fontSources={fontSources} paletteColors={fontPaletteColors} />{font === 'fixed8x8' ? 'Font S' : 'Font M'}</span>,
    };
  });
  const number = (label: string, key: string, min = 0, max?: number) => <Form.Item label={label}>
    <InputNumber addonBefore={key === 'x' ? 'X' : key === 'y' ? 'Y' : undefined} style={{ width: '100%' }} min={min} max={max} precision={0} value={Number(args[key] ?? min)} onChange={value => update({ [key]: value ?? min })} />
  </Form.Item>;

  switch (event.command) {
    case EEvents.SPAWN_ACTOR:
      return <Form layout="vertical"><Form.Item label="Actor ID">{actorSelect}</Form.Item>{number('X', 'x')}{number('Y', 'y')}</Form>;
    case EEvents.MOVE_ACTOR:
      return <Form layout="vertical"><Form.Item label="Actor ID">{actorSelect}</Form.Item>{number('X', 'x')}{number('Y', 'y')}</Form>;
    case EEvents.REMOVE_ACTOR:
      return <Form layout="vertical"><Form.Item label="Actor ID">{actorSelect}</Form.Item></Form>;
    case EEvents.VISIBLE_ACTOR:
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
    case EEvents.PLAY_SOUND:
      return <Form layout="vertical"><Form.Item label="Sound">{soundSelect}</Form.Item>{number('Volume', 'volume', 0, 100)}</Form>;
    case EEvents.SET_MUSIC_VOLUME:
      return <Form layout="vertical">{number('Volume', 'volume', 0, 100)}</Form>;
    case EEvents.DISPLAY_DIALOGUE:
      return <div ref={dialogueBodyRef} onMouseEnter={() => updateDialoguePreview(resolveVariablePreview(String(args.text ?? '')))} onMouseLeave={() => { if (!dialogueFieldFocused) setDialoguePreview(null); }}><Form layout="vertical">{dialogueTextField}<Form.Item label="Font"><Select size="large" value={args.dialogueFont === 'fixed8x8' ? 'fixed8x8' : 'fixed8x16'} options={dialogueFontOptions} onChange={dialogueFont => { update({ dialogueFont }); setDialoguePreview(current => current ? { ...current, font: dialogueFont as PreviewFontId } : current); }} /></Form.Item><Form.Item label="Show frame"><Switch checked={args.showFrame !== false} onChange={showFrame => { update({ showFrame }); setDialoguePreview(current => current ? { ...current, showFrame } : current); }} /></Form.Item><Form.Item label="Horizontal alignment"><Segmented block value={args.horizontalAlign ?? 'center'} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centered' }, { value: 'right', label: 'Right' }]} onChange={horizontalAlign => { update({ horizontalAlign }); setDialoguePreview(current => current ? { ...current, horizontalAlign } : current); }} /></Form.Item><Form.Item label="Vertical position"><Segmented block value={args.verticalAlign ?? 'bottom'} options={[{ value: 'top', label: 'Top' }, { value: 'center', label: 'Center' }, { value: 'bottom', label: 'Bottom' }]} onChange={verticalAlign => update({ verticalAlign })} /></Form.Item><Form.Item label="Animation speed" style={{ marginBottom: 4 }}><Switch checked={args.animate !== false} onChange={animate => update({ animate })} /></Form.Item><Form.Item style={{ marginBottom: 0 }}><Segmented block value={args.animationSpeed ?? 'medium'} options={[{ value: 'slow', label: 'Slow' }, { value: 'medium', label: 'Medium' }, { value: 'fast', label: 'Fast' }]} onChange={animationSpeed => update({ animationSpeed })} /></Form.Item></Form>{dialoguePreview && <DialoguePreview {...dialoguePreview} frameSource={dialogueFrameSource} fontSources={fontSources} />}</div>;
    case EEvents.DIALOGUE_CHOICE:
      return <><div ref={choiceFieldRef} onMouseEnter={() => updateChoicePreview(choicePreviewText)} onMouseLeave={() => { if (!choiceFieldFocused) setDialoguePreview(null); }}><Form layout="vertical"><Form.Item label="Prompt"><Input.TextArea rows={2} showCount={{ formatter: dialogueCount }} value={args.prompt ?? ''} onFocus={() => { setChoiceFieldFocused(true); updateChoicePreview(choicePreviewText); }} onBlur={() => { setChoiceFieldFocused(false); setDialoguePreview(null); }} onChange={e => { const prompt = truncateUtf8(sanitizeWithNotice(e.target.value)); update({ prompt }); updateChoicePreview(`${prompt}\n> ${String(args.optionA ?? '')}\n  ${String(args.optionB ?? '')}`); }} /></Form.Item><Form.Item label="Option A"><Input showCount maxLength={DIALOGUE_MAX_BYTES} value={args.optionA ?? ''} onFocus={() => { setChoiceFieldFocused(true); updateChoicePreview(choicePreviewText); }} onBlur={() => { setChoiceFieldFocused(false); setDialoguePreview(null); }} onChange={e => { const optionA = truncateUtf8(sanitizeWithNotice(e.target.value)); update({ optionA }); updateChoicePreview(`${String(args.prompt ?? '')}\n> ${optionA}\n  ${String(args.optionB ?? '')}`); }} /></Form.Item><Form.Item label="Option B"><Input showCount maxLength={DIALOGUE_MAX_BYTES} value={args.optionB ?? ''} onFocus={() => { setChoiceFieldFocused(true); updateChoicePreview(choicePreviewText); }} onBlur={() => { setChoiceFieldFocused(false); setDialoguePreview(null); }} onChange={e => { const optionB = truncateUtf8(sanitizeWithNotice(e.target.value)); update({ optionB }); updateChoicePreview(`${String(args.prompt ?? '')}\n> ${String(args.optionA ?? '')}\n  ${optionB}`); }} /></Form.Item><Form.Item label="Result variable">{variableSelect}</Form.Item></Form></div>{dialoguePreview && <DialoguePreview {...dialoguePreview} frameSource={dialogueFrameSource} fontSources={fontSources} />}</>;
    case EEvents.FOR:
      return <Form layout="vertical">
        <Form.Item label="Variable"><Select showSearch allowClear style={{ width: '100%' }} value={args.variableId || undefined} options={variables.variables.filter(variable => variable.type === 'number').map(variable => ({ value: variable.id, label: variable.name || variable.symbol }))} placeholder="Select numeric variable" onChange={variableId => update({ variableId })} /></Form.Item>
        {number('Start', 'start')}
        {number('End', 'end')}
        {number('Step (negative decrements)', 'step', -999999)}
      </Form>;
    case EEvents.WAIT_FOR_BUTTON:
      return <Form layout="vertical"><Form.Item label="Buttons"><Select mode="multiple" value={args.buttons ?? (args.button ? [args.button] : ['A'])} options={buttonOptions} onChange={buttons => update({ buttons, button: buttons[0] ?? 'A' })} /></Form.Item><Form.Item><Space><Tooltip title="Set if the script should replace the default game action for the specified button."><Switch checked={args.overrideButton === true} onChange={overrideButton => update({ overrideButton })} /></Tooltip><Typography.Text>Override default button action</Typography.Text></Space></Form.Item></Form>;
    case EEvents.IF_BUTTON_HELD:
      return <Form layout="vertical"><Form.Item label="Buttons"><Select mode="multiple" value={args.buttons ?? (args.button ? [args.button] : ['A'])} options={buttonOptions} onChange={buttons => update({ buttons, button: buttons[0] ?? 'A' })} /></Form.Item></Form>;
    case EEvents.BREAK:
      return <Space><Typography.Text type="secondary">Encerra o loop atual; não há parâmetros.</Typography.Text></Space>;
    case EEvents.CONTINUE:
      return <Space><Typography.Text type="secondary">Interrompe a iteração atual e passa para a próxima.</Typography.Text></Space>;
    case EEvents.STOP_MUSIC:
    case EEvents.HIDE_DIALOGUE:
      return <Space><Typography.Text type="secondary">Este evento não possui parâmetros.</Typography.Text></Space>;
    default:
      return null;
  }
}

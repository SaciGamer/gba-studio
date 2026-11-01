import { resolveTextTemplate } from '../../../../../shared/textTemplate';
import VariableTextArea from './VariableTextArea';
import FacingTargetPreview from './FacingTargetPreview';
import SoundPlaybackControls from './SoundPlaybackControls';
import SoundGroupSelect from './SoundGroupSelect';
import SoundGroupInput from './SoundGroupInput';
import useEventPreviewArea from './useEventPreviewArea';
import { isActiveProjectEntry } from '../../../../../shared/projectCollectionEntries';
import CoordinateInputs from './CoordinateInputs';
import { coordinatePixels, coordinateScale } from '../../../../../shared/events/coordinateUnits';
import { withDefaultInputMap } from '../../../../../shared/inputMap';
import { WarningField } from '../WarningIndicator';
import { getMenuLayout, getMenuLayoutIssues, menuOptionCell, MENU_MAX_OPTIONS, MENU_MAX_PROMPT_CHARACTERS } from '../../../../../shared/menuLayout';
import { floatingPreviewTop } from '../../utils/floatingPreviewPosition';
import { useI18n } from '@/i18n/I18n';
import useActorSelf from './useActorSelf';
import RumbleEvent from './RumbleEvent';
import CameraShakeEvent from './CameraShakeEvent';
import CameraFollowPreview from './CameraFollowPreview';
import useAppContexts from '@/providers/contexts/AppContexts';
import { useScriptParameterVariables } from './ScriptParameterContext';
import { variableOptions } from './variableOptions';
import { ETypeScene, IArgs, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { App, Button, Checkbox, ColorPicker, Flex, Form, Input, Modal, Radio, Segmented, Select, Space, Switch, Tabs, Tag, Tooltip, Typography } from 'antd';
import { AlignCenterOutlined, AlignLeftOutlined, AlignRightOutlined, CaretLeftFilled, CaretUpFilled, CaretDownFilled, CaretRightFilled, PlayCircleOutlined, StopOutlined, VerticalAlignBottomOutlined, VerticalAlignMiddleOutlined, VerticalAlignTopOutlined } from '@ant-design/icons';
import DirectionRadioGroup from '../DirectionRadioGroup';
import StepInputNumber, { InputNumber } from '../StepInputNumber';
import NumericEventInput from '../NumericEventInput';
import { NUMERIC_EVENT_FIELDS } from '../../../../../shared/numericEventFields';
import ActorMotionSpeedControl from './ActorMotionSpeedControl';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EEvents } from './interfaces/IEvents';
import { CurrentBackgroundThumbnail } from './BackgroundEvents';
import BackgroundTransformPreview from './BackgroundTransformPreview';
import frameImage from '@/img/frame.png';
import cursorImage from '@/img/cursor.png';
import { DIALOGUE_MAX_BYTES, truncateUtf8, utf8ByteLength } from '@/utils/dialogueText';
import { fontCharacterWidth as metricCharacterWidth, fontGlyphIndex as metricGlyphIndex, measureFontText, PREVIEW_FONTS, type PreviewFontId } from '@/utils/fontMetrics';
import { getPaletteIndexZeroColor, loadPaletteTransparentImage } from '@/utils/paletteTransparency';
import { mergeEventArgs } from '../../../../../shared/events/sceneReferenceCleanup';
import { generateEventSoundSamples, GENERATED_SOUND_SAMPLE_RATE } from '../../../../../shared/events/generatedEventSound';
import SfxGenerator from '../resourceEditors/SfxGenerator';
import { defaultSfxParameters, generateSfx } from '../../../../../shared/events/sfxGenerator';

type Props = { event: IScriptsElement; customTitle?: (newTitle: string) => void; onValueChange: (id: string, args: IArgs) => void };

const dialogueLineWidth = 224;

function wrapDialogueText(value: string, font: PreviewFontId, maxWidth = dialogueLineWidth, firstLineMaxWidth = maxWidth, rowWidths?: number[]): string[] {
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
        const rowWidth = rowWidths?.[lines.length] ?? (lines.length === 0 ? firstLineMaxWidth : maxWidth);
        if (width + characterWidth > rowWidth) break;
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

function sanitizeEmoteId(filename: string): string {
  let value = filename.replace(/\.[^/.]+$/, '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
  value = value.replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
  if (!/^[a-z]/.test(value)) value = `a_${value}`;
  return value.replace(/_+/g, '_');
}

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

type DialogueLineLayout = { left: number; width: number; rightLeft?: number; rightWidth?: number };

function DialogueGlyphText({ lines, horizontalAlign, font, fontSources, firstLineWidth, firstLineRightWidth, lineLayouts }: { lines: string[]; horizontalAlign: 'left' | 'center' | 'right'; font: PreviewFontId; fontSources: Record<string, string>; firstLineWidth?: number; firstLineRightWidth?: number; lineLayouts?: DialogueLineLayout[] }) {
  const metrics = PREVIEW_FONTS[font];
  const renderLine = (line: string, lineIndex: number) => line.split('').map((character, characterIndex) => {
      const glyphIndex = selectedFontGlyphIndex(character);
      if (character === ' ') return <span key={`${lineIndex}-${characterIndex}`} aria-hidden style={{ display: 'inline-block', width: selectedFontCharacterWidth(font, character), height: metrics.glyphHeight }} />;
      if (glyphIndex < 0) return null;
      return <span key={`${lineIndex}-${characterIndex}`} aria-hidden style={{
        display: 'inline-block', width: selectedFontCharacterWidth(font, character), height: metrics.glyphHeight,
        verticalAlign: 'top', backgroundImage: `url(${fontSources[metrics.image] ?? '/common_variable_8x16_font.png'})`,
        backgroundRepeat: 'no-repeat', backgroundSize: `${metrics.glyphWidth}px auto`, backgroundPosition: `0 -${glyphIndex * metrics.glyphHeight}px`,
        imageRendering: 'pixelated',
      }} />;
    });
  return <>{lines.map((line, lineIndex) => {
    const lineLayout = lineLayouts?.[lineIndex];
    const outsideFrameOpacity = lineIndex >= 3 ? 0.45 : 1;
    if (lineLayout?.rightWidth && lineLayout.rightLeft !== undefined) {
      const lineWidth = measureFontText(font, line).width;
      let splitAt = -1;
      if (lineWidth > lineLayout.width) {
        for (let index = 0; index < line.length; index += 1) {
          if (line[index] === ' ' && measureFontText(font, line.slice(0, index)).width <= lineLayout.width) splitAt = index;
        }
      }
      const leftText = splitAt >= 0 ? line.slice(0, splitAt) : lineWidth <= lineLayout.width ? line : '';
      const rightText = splitAt >= 0 ? line.slice(splitAt + 1) : lineWidth <= lineLayout.width ? '' : line;
      const gapWidth = Math.max(0, lineLayout.rightLeft - 8 - lineLayout.width);
      return <div key={lineIndex} style={{ display: 'flex', height: 16, lineHeight: '16px', whiteSpace: 'nowrap', opacity: outsideFrameOpacity }}>
        <div style={{ width: lineLayout.width, flex: `0 0 ${lineLayout.width}px`, overflow: 'hidden', textAlign: horizontalAlign }}>{renderLine(leftText, lineIndex)}</div>
        <div aria-hidden style={{ width: gapWidth, flex: `0 0 ${gapWidth}px` }} />
        <div style={{ width: lineLayout.rightWidth, flex: `0 0 ${lineLayout.rightWidth}px`, overflow: 'hidden' }}>{renderLine(rightText, lineIndex)}</div>
      </div>;
    }
    if (lineIndex === 0 && firstLineWidth && firstLineRightWidth) {
      const lineWidth = measureFontText(font, line).width;
      let splitAt = -1;
      if (lineWidth > firstLineWidth) {
        for (let index = 0; index < line.length; index += 1) {
          if (line[index] === ' ' && measureFontText(font, line.slice(0, index)).width <= firstLineWidth) splitAt = index;
        }
      }
      const leftText = splitAt >= 0 ? line.slice(0, splitAt) : lineWidth <= firstLineWidth ? line : '';
      const rightText = splitAt >= 0 ? line.slice(splitAt + 1) : lineWidth <= firstLineWidth ? '' : line;
      return <div key={lineIndex} style={{ display: 'flex', height: 16, lineHeight: '16px', whiteSpace: 'nowrap', opacity: outsideFrameOpacity }}>
        <div style={{ width: firstLineWidth, flex: `0 0 ${firstLineWidth}px`, overflow: 'hidden', textAlign: horizontalAlign }}>{renderLine(leftText, lineIndex)}</div>
        <div style={{ width: firstLineRightWidth, flex: `0 0 ${firstLineRightWidth}px`, overflow: 'hidden' }}>{renderLine(rightText, lineIndex)}</div>
      </div>;
    }
    if (lineLayout) return <div key={lineIndex} style={{ position: 'relative', height: 16, lineHeight: '16px', width: '100%', whiteSpace: 'nowrap', opacity: outsideFrameOpacity }}><div style={{ position: 'absolute', left: lineLayout.left - 8, width: lineLayout.width, overflow: 'hidden', textAlign: horizontalAlign }}>{renderLine(line, lineIndex)}</div></div>;
    return <div key={lineIndex} style={{ height: 16, lineHeight: '16px', width: '100%', boxSizing: 'border-box', textAlign: horizontalAlign, whiteSpace: 'nowrap', opacity: outsideFrameOpacity }}>{renderLine(line, lineIndex)}</div>;
  })}</>;
}

type DialoguePreviewState = { text: string; anchor: DOMRect; showFrame: boolean; horizontalAlign: 'left' | 'center' | 'right'; verticalAlign: 'top' | 'center' | 'bottom'; font: PreviewFontId; avatarSource: string; avatarSize: number; avatarPlacement: 'inside' | 'frame-top' | 'above' | 'free'; avatarAnchor: string; avatarX: number; avatarY: number };

function DialoguePreview({ text, anchor, frameSource, showFrame, horizontalAlign, verticalAlign, font, fontSources, avatarSource, avatarSize, avatarPlacement, avatarAnchor, avatarX, avatarY, choicePrompt, cursorSource, backgroundColor = '#fff' }: DialoguePreviewState & { frameSource: string; fontSources: Record<string, string>; choicePrompt?: string; cursorSource?: string; backgroundColor?: string }) {
  const height = 160;
  const frameTop = verticalAlign === 'top' ? 0 : verticalAlign === 'center' ? 48 : 96;
  const textTop = verticalAlign === 'top' ? 8 : verticalAlign === 'center' ? 56 : 104;
  const portraitLeft = avatarPlacement === 'free' ? avatarX
    : avatarAnchor === 'right' || avatarAnchor === 'top-right' || avatarAnchor === 'bottom-right'
      ? 240 - 8 - avatarSize
      : avatarAnchor === 'left' || avatarAnchor === 'top-left' || avatarAnchor === 'bottom-left'
        ? 8 : (240 - avatarSize) / 2;
  const portraitTop = avatarPlacement === 'free' ? avatarY
    : avatarPlacement === 'inside' ? frameTop + (avatarAnchor === 'bottom-left' || avatarAnchor === 'bottom-right' ? 64 - 8 - avatarSize : 8)
      : avatarPlacement === 'above' ? frameTop - avatarSize - 4 : frameTop + 4 - avatarSize / 2;
  const portraitOverText = Boolean(avatarSource) && (avatarPlacement === 'inside' || avatarPlacement === 'frame-top');
  const centeredTopPortrait = portraitOverText && avatarPlacement === 'frame-top' && avatarAnchor === 'center';
  const textArea = { left: 8, width: 224 };
  const firstLineWidth = centeredTopPortrait
    ? Math.max(8, portraitLeft - 12)
    : undefined;
  const firstLineRightWidth = centeredTopPortrait ? Math.max(8, 232 - (portraitLeft + avatarSize + 4)) : undefined;
  const lineLayouts = useMemo<DialogueLineLayout[] | undefined>(() => {
    if (!avatarSource || (avatarPlacement !== 'inside' && avatarPlacement !== 'frame-top')) return undefined;
    const useLeftTextArea = avatarAnchor === 'right' || avatarAnchor === 'top-right' || avatarAnchor === 'bottom-right'
      || (avatarAnchor === 'center' && horizontalAlign === 'right');
    return Array.from({ length: 3 }, (_, row) => {
      const rowTop = textTop + row * 16;
      const overlapsPortrait = portraitTop < rowTop + 16 && portraitTop + avatarSize > rowTop;
      if (!overlapsPortrait) return { left: 8, width: 224 };
      if (avatarPlacement === 'frame-top' && avatarAnchor === 'center') {
        const rightLeft = portraitLeft + avatarSize + 4;
        return {
          left: 8,
          width: Math.max(8, portraitLeft - 12),
          rightLeft,
          rightWidth: Math.max(8, 232 - rightLeft),
        };
      }
      return useLeftTextArea
        ? { left: 8, width: Math.max(8, portraitLeft - 12) }
        : { left: portraitLeft + avatarSize + 4, width: Math.max(8, 232 - (portraitLeft + avatarSize + 4)) };
    });
  }, [avatarSource, avatarPlacement, avatarAnchor, horizontalAlign, textTop, portraitTop, avatarSize, portraitLeft]);
  const firstRowFlowWidth = centeredTopPortrait
    ? (firstLineWidth ?? 0) + (firstLineRightWidth ?? 0)
    : textArea.width;
  const rowWidths = lineLayouts?.map(layout => layout.width + (layout.rightWidth ?? 0));
  const lines = useMemo(() => wrapDialogueText(text, font, textArea.width, firstRowFlowWidth, rowWidths), [text, font, textArea.width, firstRowFlowWidth, rowWidths]);
  const cursorLine = choicePrompt === undefined ? -1 : wrapDialogueText(choicePrompt, font, textArea.width, firstRowFlowWidth, rowWidths).length;
  // The engine canvas is immediately to the left of the RightPanel. Keep the
  // preview there, aligned with the hovered dialogue field instead of covering
  // the event editor itself.
  const left = Math.max(8, anchor.left - 252);
  const top = floatingPreviewTop(anchor.top, height);
  return createPortal(
    <div aria-label="Dialogue preview" style={{
      position: 'fixed', left, top, width: 240, height, zIndex: 2000,
      boxSizing: 'border-box', color: '#111',
      background: backgroundColor, imageRendering: 'pixelated', pointerEvents: 'none', isolation: 'isolate',
      overflow: 'visible', fontFamily: 'monospace', fontSize: 8, lineHeight: '16px',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: horizontalAlign,
    }}>
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: frameTop, width: '100%', height: 64, boxSizing: 'border-box', border: '8px solid transparent', borderImage: `url(${frameSource}) 8 fill / 8px / 0 stretch`, filter: showFrame ? 'none' : 'grayscale(1)', opacity: showFrame ? 1 : 0.5, zIndex: 0 }} />
      <div style={{ position: 'absolute', left: textArea.left, top: textTop, width: textArea.width, boxSizing: 'border-box', zIndex: 1 }}><DialogueGlyphText lines={lines} horizontalAlign={horizontalAlign} font={font} fontSources={fontSources} firstLineWidth={firstLineWidth} firstLineRightWidth={firstLineRightWidth} lineLayouts={lineLayouts} /></div>
      {avatarSource && <img src={avatarSource} alt="" style={{ position: 'absolute', left: portraitLeft, top: portraitTop, width: avatarSize, height: avatarSize, imageRendering: 'pixelated', objectFit: 'contain', zIndex: 2 }} />}
      {cursorSource && cursorLine >= 0 && <img src={cursorSource} alt="" data-testid="dialogue-choice-cursor" style={{ position: 'absolute', left: 16, top: textTop + cursorLine * 16 + 8, transform: 'translate(-50%, -50%)', imageRendering: 'pixelated', zIndex: 3 }} />}
    </div>,
    document.body,
  );
}

function clipMenuOption(option: string, font: PreviewFontId, width: number): string {
  let clipped = '';
  for (const character of Array.from(option)) {
    const next = clipped + character;
    if (measureFontText(font, next).width > width) break;
    clipped = next;
  }
  return clipped;
}

export function ChoiceMenuPreview({ args, anchor, frameSource, fontSources, cursorSource, selectedIndex, supportsColumns = true, backgroundColor = '#fff' }: { args: Record<string, any>; anchor: DOMRect; frameSource: string; fontSources: Record<string, string>; cursorSource: string; selectedIndex: number; supportsColumns?: boolean; backgroundColor?: string }) {
  const { t } = useI18n();
  const layout = getMenuLayout(args, supportsColumns);
  const selected = Math.min(selectedIndex, Math.max(0, layout.options.length - 1));
  const page = Math.floor(selected / layout.capacity);
  const frameTop = args.verticalAlign === 'top' ? 0 : args.verticalAlign === 'center' ? 48 : 96;
  const frameOffset = layout.position === 'dialogue' ? frameTop + 8 : 0;
  const promptX = layout.position === 'right' ? 240 - layout.areaWidth + 8 : layout.position === 'left' ? 8 : 8;
  const promptWidth = layout.promptWidth;
  const font = args.dialogueFont === 'fixed8x8' ? 'fixed8x8' : 'fixed8x16';
  const align = args.horizontalAlign ?? 'left';
  return createPortal(<div aria-label={t('events.menu.preview')} data-testid="menu-preview" style={{ position: 'fixed', left: Math.max(8, anchor.left - 252), top: floatingPreviewTop(anchor.top, 160), width: 240, height: 160, zIndex: 2000, background: backgroundColor, pointerEvents: 'none', imageRendering: 'pixelated', boxShadow: '0 4px 18px #0006' }}>
    {layout.position !== 'full-screen' && args.showFrame !== false && <div data-testid="menu-frame" style={{ position: 'absolute', left: layout.position === 'right' ? 240 - layout.areaWidth : layout.position === 'left' ? 0 : 0, top: layout.position === 'dialogue' ? frameTop : 0, width: layout.position === 'dialogue' ? 240 : layout.areaWidth, height: layout.position === 'dialogue' ? 64 : 160, boxSizing: 'border-box', border: '8px solid transparent', borderImage: `url(${frameSource}) 8 fill / 8px / 0 stretch` }} />}
    <div style={{ position: 'absolute', left: promptX, top: frameOffset + (layout.position === 'dialogue' ? 0 : 8), width: promptWidth }}><DialogueGlyphText lines={layout.promptLines.slice(0, 2)} horizontalAlign={align} font={font} fontSources={fontSources} /></div>
    {layout.options.map((option, index) => {
      const cell = menuOptionCell(index, layout);
      if (cell.page !== page) return null;
      const visibleOption = clipMenuOption(option, font, layout.optionWidth);
      const width = measureFontText(font, visibleOption).width;
      const offset = align === 'right' ? layout.optionWidth - width : align === 'center' ? (layout.optionWidth - width) / 2 : 0;
      return <React.Fragment key={index}><div data-menu-option={index} style={{ position: 'absolute', left: cell.x + 16, top: frameOffset + cell.y, width: layout.optionWidth, overflow: 'hidden' }}><DialogueGlyphText lines={[visibleOption]} horizontalAlign={align} font={font} fontSources={fontSources} /></div>
        {index === selected && (cursorSource ? <img src={cursorSource} alt="" data-testid="menu-cursor" style={{ position: 'absolute', left: cell.x + 8 + Math.max(0, offset), top: frameOffset + 8 + cell.y, transform: 'translate(-50%, -50%)', imageRendering: 'pixelated' }} /> : <div style={{ position: 'absolute', left: cell.x + Math.max(0, offset), top: frameOffset + cell.y }}><DialogueGlyphText lines={['>']} horizontalAlign="left" font={font} fontSources={fontSources} /></div>)}</React.Fragment>;
    })}
  </div>, document.body);
}

function UiTextPreview({ text, anchor, x, y, font, fontSources, backgroundColor = '#000', effect }: { text: string; anchor: DOMRect; x: number; y: number; font: PreviewFontId; fontSources: Record<string, string>; backgroundColor?: string; effect?: { id: string; animation: 'move' | 'blink'; targetX: number; targetY: number; speed: number; durationFrames?: number } }) {
  const width = 240;
  const height = 160;
  const left = Math.max(8, anchor.left - width - 12);
  const top = floatingPreviewTop(anchor.top, height);
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
    <div aria-label="UI text preview" style={{ position: 'fixed', left, top, width, height, zIndex: 2000, overflow: 'hidden', background: backgroundColor, color: '#fff', pointerEvents: 'none', imageRendering: 'pixelated', boxShadow: '0 4px 18px rgba(0,0,0,.35)' }}>
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
  const top = floatingPreviewTop(anchor.top, height);
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
  useEventPreviewArea(fieldRef, eventId, showPreview, () => setAnchor(null));
  useEffect(() => {
    if (!anchor) return undefined;
    const updatePosition = () => {
      const rect = fieldRef.current?.getBoundingClientRect();
      if (rect) setAnchor(current => current ? rect : null);
      else setAnchor(null);
    };
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [Boolean(anchor)]);

  return <div ref={fieldRef}>
    {children}
    {anchor && <HBlankEffectPreview eventId={eventId} layerId={layerId} preset={preset} intensity={intensity} anchor={anchor} />}
  </div>;
}

/** Inspector for runtime events that previously appeared as unconfigurable nodes. */
export default function RuntimeEventPanel({ event, customTitle, onValueChange }: Props) {
  const { t } = useI18n();
  const self = useActorSelf();
  const { elementSelected, variables: globalVariables, settings, settingUtils, spriteResources, prefabs } = useAppContexts();
  const parameters = useScriptParameterVariables();
  const variables = { variables: [...parameters, ...globalVariables.variables].filter(isActiveProjectEntry) };
  const singleLayerScene = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;
  const { notification } = App.useApp();
  const [musicFiles, setMusicFiles] = useState<Array<{ value: string; label: string; group?: 'original' | 'project' }>>([]);
  const [sfxModalOpen, setSfxModalOpen] = useState(false);
  const [sfxDraft, setSfxDraft] = useState<any>();
  const [soundAssetPath, setSoundAssetPath] = useState('');
  const [soundFiles, setSoundFiles] = useState<string[]>([]);
  const [sfxProjectFiles, setSfxProjectFiles] = useState<string[]>([]);
  const [emoteFiles, setEmoteFiles] = useState<string[]>([]);
  const [emoteImagePath, setEmoteImagePath] = useState('');
  const [avatarFiles, setAvatarFiles] = useState<string[]>([]);
  const [avatarImagePath, setAvatarImagePath] = useState('');
  const [avatarPreviewSources, setAvatarPreviewSources] = useState<Record<string, string>>({});
  const [avatarDimensions, setAvatarDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const [spriteImagePaths, setSpriteImagePaths] = useState<Record<string, string>>({});
  const [actorFrameThumbnails, setActorFrameThumbnails] = useState<Record<string, string>>({});
  const [dialoguePreview, setDialoguePreview] = useState<DialoguePreviewState | null>(null);
  const [uiTextPreviewAnchor, setUiTextPreviewAnchor] = useState<DOMRect | null>(null);
  const [uiAnimationPreviewAnchor, setUiAnimationPreviewAnchor] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (event.args?.__collapse) return;
    setDialoguePreview(null);
    setUiTextPreviewAnchor(null);
    setUiAnimationPreviewAnchor(null);
  }, [event.args?.__collapse]);
  const [dialogueFrameSource, setDialogueFrameSource] = useState(frameImage);
  const [dialogueCursorSource, setDialogueCursorSource] = useState('');
  const [assetReloadVersion, setAssetReloadVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setDialogueCursorSource('');
    const loadCursor = async () => {
      const response = await window.electronAPI.fetchImages('ui').catch(() => null);
      const filename = settings?.uiCursorImage || 'cursor.png';
      const projectSource = response?.status === 'success' && response.localPath && response.fileImages?.includes(filename)
        ? `${response.localPath.replace(/[\\/]+$/, '')}/${filename}` : '';
      const source = projectSource || (settings?.uiCursorImage ? '' : cursorImage);
      if (!source) return;
      const canvas = await loadPaletteTransparentImage(source);
      if (!cancelled) setDialogueCursorSource(canvas?.toDataURL('image/png') ?? source);
    };
    void loadCursor().catch(() => undefined);
    return () => { cancelled = true; };
  }, [settings?.uiCursorImage, settingUtils.projectPathFile, assetReloadVersion]);
  const [fontSources, setFontSources] = useState<Record<string, string>>({});
  const [fontPaletteColors, setFontPaletteColors] = useState<Record<string, string>>({});
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
  const soundPreviewContextRef = useRef<AudioContext | null>(null);
  const soundPreviewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [soundPreviewPlaying, setSoundPreviewPlaying] = useState(false);
  const [soundPreviewLoading, setSoundPreviewLoading] = useState(false);
  const stopSoundPreview = () => {
    soundPreviewSourceRef.current?.stop();
    soundPreviewSourceRef.current = null;
    setSoundPreviewPlaying(false);
  };
  useEffect(() => { stopSoundPreview(); }, [event.id, event.args?.soundId, event.args?.soundSource, event.args?.sfxParameters]);
  useEffect(() => () => {
    const context = soundPreviewContextRef.current;
    soundPreviewContextRef.current = null;
    if (context && context.state !== 'closed') void context.close();
  }, []);
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
    void Promise.all([window.electronAPI.fetchImages('musics'), window.electronAPI.listTrackerProjects(), window.electronAPI.fetchImages('sounds'), window.electronAPI.listProjectSfx()])
      .then(([music, projects, sound, sfxProjects]) => {
        const choices = new Map<string, { value: string; label: string; group?: 'original' | 'project' }>();
        for (const file of music?.status === 'success' ? music.fileImages ?? [] : []) choices.set(file.replace(/\.[^/.]+$/, ''), { value: file.replace(/\.[^/.]+$/, ''), label: file, group: 'original' });
        for (const project of projects?.status === 'success' ? projects.projects ?? [] : []) {
          const filename = project.filename.split(/[\\/]/).pop() ?? project.filename;
          choices.set(project.id, { value: project.id, label: `${filename} (${project.format})`, group: 'project' });
        }
        setMusicFiles([...choices.values()]);
        setSoundAssetPath(sound?.localPath ?? '');
        setSoundFiles(sound?.status === 'success' ? sound.fileImages ?? [] : []);
        setSfxProjectFiles(sfxProjects?.status === 'success' ? sfxProjects.files ?? [] : []);
      }).catch(() => { setMusicFiles([]); setSoundFiles([]); setSfxProjectFiles([]); });
  }, [assetReloadVersion]);
  useEffect(() => {
    let cancelled = false;
    const renderFirstFrames = async () => {
      const thumbnails: Record<string, string> = {};
      await Promise.all((spriteResources ?? []).map(async (sprite: any) => {
        const filename = String(sprite.filename ?? `${sprite.name ?? sprite.id}.png`).toLowerCase();
        const source = spriteImagePaths[filename] ?? spriteImagePaths[`${sprite.id}.png`.toLowerCase()];
        if (!source || !sprite.id) return;
        const state = sprite.playerAnimationStates?.[0];
        const animation = state?.animations?.[0];
        const canvasFrame = animation?.canvasFrames?.[0];
        const frameIndex = animation?.frames?.[0];
        const frameWidth = Math.max(1, Number(sprite.playerFrameWidth) || 16);
        const frameHeight = Math.max(1, Number(sprite.playerFrameHeight) || 16);
        const frame = Number.isInteger(frameIndex)
          ? { width: frameWidth, height: frameHeight, pieces: [{ sourceX: (frameIndex % Math.max(1, Math.floor((Number(sprite.imageWidth) || frameWidth) / frameWidth))) * frameWidth, sourceY: Math.floor(frameIndex / Math.max(1, Math.floor((Number(sprite.imageWidth) || frameWidth) / frameWidth))) * frameHeight, width: frameWidth, height: frameHeight, x: 0, y: 0 }] }
          : canvasFrame;
        if (!frame || frame.width <= 0 || frame.height <= 0) return;
        const sourceImage = await new Promise<HTMLImageElement | null>(resolve => {
          const image = new window.Image();
          image.onload = () => resolve(image);
          image.onerror = () => resolve(null);
          image.src = source;
        });
        if (!sourceImage) return;
        const canvas = document.createElement('canvas');
        canvas.width = frame.width;
        canvas.height = frame.height;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.imageSmoothingEnabled = false;
        for (const piece of frame.pieces ?? []) {
          context.save();
          if (piece.flipX || piece.flipY) {
            context.translate(piece.x + (piece.flipX ? piece.width : 0), piece.y + (piece.flipY ? piece.height : 0));
            context.scale(piece.flipX ? -1 : 1, piece.flipY ? -1 : 1);
          }
          context.drawImage(sourceImage, piece.sourceX, piece.sourceY, piece.width, piece.height,
            piece.flipX || piece.flipY ? 0 : piece.x, piece.flipX || piece.flipY ? 0 : piece.y, piece.width, piece.height);
          context.restore();
        }
        thumbnails[sprite.id] = canvas.toDataURL('image/png');
      }));
      if (!cancelled) setActorFrameThumbnails(thumbnails);
    };
    void renderFirstFrames().catch(() => { if (!cancelled) setActorFrameThumbnails({}); });
    return () => { cancelled = true; };
  }, [spriteResources, spriteImagePaths]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([window.electronAPI.fetchImages('emotes'), window.electronAPI.fetchImages('sprites'), window.electronAPI.fetchImages('avatars')]).then(async ([emotes, sprites, avatars]: [any, any, any]) => {
      setEmoteFiles(emotes?.status === 'success' ? emotes.fileImages ?? [] : []);
      setEmoteImagePath(emotes?.status === 'success' ? emotes.localPath ?? '' : '');
      const files: string[] = avatars?.status === 'success' ? avatars.fileImages ?? [] : [];
      const avatarPath = avatars?.status === 'success' ? avatars.localPath ?? '' : '';
      setAvatarFiles(files);
      setAvatarImagePath(avatarPath);
      setAvatarDimensions({});
      const dimensions: Record<string, { width: number; height: number }> = {};
      const processedAvatars = await Promise.all(files.map(async filename => {
        const source = avatarPath ? `${avatarPath.replace(/[\\/]+$/, '')}/${filename}` : '';
        if (!source) return [filename, ''] as const;
        const processed = await loadPaletteTransparentImage(source);
        if (processed) dimensions[filename] = { width: processed.width, height: processed.height };
        return [filename, processed?.toDataURL('image/png') ?? ''] as const;
      }));
      if (!cancelled) {
        setAvatarPreviewSources(Object.fromEntries(processedAvatars));
        setAvatarDimensions(dimensions);
      }
      const paths: Record<string, string> = {};
      if (sprites?.status === 'success' && sprites.localPath) {
        for (const file of sprites.fileImages ?? []) paths[file.toLowerCase()] = `${sprites.localPath.replace(/[\\/]+$/, '')}/${file}`;
      }
      setSpriteImagePaths(paths);
    }).catch(() => { if (!cancelled) { setEmoteFiles([]); setEmoteImagePath(''); setAvatarFiles([]); setAvatarImagePath(''); setAvatarPreviewSources({}); setSpriteImagePaths({}); } });
    return () => { cancelled = true; };
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
  const avatarSourceFor = (filename: string | undefined) => filename && avatarImagePath
    ? avatarPreviewSources[filename] ?? '' : '';
  const supportsDialoguePortrait = event.command === EEvents.DISPLAY_DIALOGUE || event.command === EEvents.DIALOGUE_SHOW;
  const hblankLayerId = singleLayerScene ? 2 : Math.max(0, Math.min(3, Number(args.layerId ?? 0)));
  const update = (patch: Record<string, unknown>) => {
    const next = mergeEventArgs(args, patch);
    if (event.command === EEvents.UI_SET_TEXT) {
      const font = (PREVIEW_FONTS[next.font as PreviewFontId] ? next.font : 'fixed8x16') as PreviewFontId;
      const bounds = measureFontText(font, resolveVariablePreview(String(next.text ?? '')));
      if (typeof next.x !== 'object') next.x = Math.max(0, Math.min(Math.floor(Math.max(0, 240 - bounds.width) / coordinateScale(next, 'x')), Math.trunc(Number(next.x) || 0)));
      if (typeof next.y !== 'object') next.y = Math.max(0, Math.min(Math.floor(Math.max(0, 160 - bounds.height) / coordinateScale(next, 'y')), Math.trunc(Number(next.y) || 0)));
    }
    onValueChange(event.id, next);
    setDialoguePreview(current => current ? {
      ...current,
      text: ['EVENT_DIALOGUE_CHOICE', 'EVENT_MENU_OPEN'].includes(event.command) ? current.text : resolveVariablePreview(String(next.text ?? '')),
      showFrame: next.showFrame !== false,
      horizontalAlign: (next.horizontalAlign ?? current.horizontalAlign) as 'left' | 'center' | 'right',
      verticalAlign: (next.verticalAlign ?? current.verticalAlign) as 'top' | 'center' | 'bottom',
      font: next.dialogueFont === 'fixed8x8' ? 'fixed8x8' : next.dialogueFont === 'fixed8x16' ? 'fixed8x16' : current.font,
      avatarSource: next.portraitEnabled === true ? avatarSourceFor(String(next.avatarImage ?? '')) : '',
      avatarSize: Number(next.avatarSize) === 32 ? 32 : 16,
      avatarPlacement: (['inside', 'frame-top', 'above', 'free'].includes(String(next.avatarPlacement)) ? next.avatarPlacement : current.avatarPlacement) as DialoguePreviewState['avatarPlacement'],
      avatarAnchor: String(next.avatarAnchor ?? current.avatarAnchor),
      avatarX: coordinatePixels(next, 'avatarX', current.avatarX), avatarY: coordinatePixels(next, 'avatarY', current.avatarY),
    } : null);
    if (actorPositionHovered.current) dispatchActorPositionPreview(next);
  };
  const actorPositionHovered = useRef(false);
  const dispatchActorPositionPreview = (next: any) => {
    const coordinate = (axis: 'x' | 'y') => {
      const raw = next[axis] ?? 0;
      const literal = typeof raw === 'number' ? raw : raw?.kind === 'number' || raw?.kind === 'literal' || raw?.type === 'number' ? raw.value : null;
      return Number.isFinite(literal) ? Math.trunc(literal) * coordinateScale(next, axis) : null;
    };
    const x = coordinate('x'), y = coordinate('y');
    window.dispatchEvent(new CustomEvent('gba-studio:actor-position-preview', { detail: x === null || y === null || !next.actorId ? null : { eventId: event.id, sceneId: elementSelected?.id, actorId: self.resolveId(next.actorId), x, y } }));
  };
  useEffect(() => () => { window.dispatchEvent(new CustomEvent('gba-studio:actor-position-preview', { detail: null })); actorPositionHovered.current = false; }, [event.id]);
  const resolveVariablePreview = (value: string) => resolveTextTemplate(value, variables.variables);
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
      setDialoguePreview({ text, anchor, showFrame: args.showFrame !== false, horizontalAlign, verticalAlign: args.verticalAlign ?? 'bottom', font: args.dialogueFont === 'fixed8x8' ? 'fixed8x8' : 'fixed8x16', avatarSource: args.portraitEnabled === true ? avatarSourceFor(args.avatarImage) : '', avatarSize: Number(args.avatarSize) === 32 ? 32 : 16, avatarPlacement: args.avatarPlacement ?? 'inside', avatarAnchor: args.avatarAnchor ?? 'top-left', avatarX: coordinatePixels(args, 'avatarX', 112), avatarY: coordinatePixels(args, 'avatarY', 16) });
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
  const updateChoicePreview = () => {
    const anchor = choiceFieldRef.current?.getBoundingClientRect();
    if (anchor) {
      window.dispatchEvent(new CustomEvent('gba-studio:event-preview-open', { detail: { eventId: event.id } }));
      setDialoguePreview({ text: '', anchor, showFrame: args.showFrame !== false, horizontalAlign: args.horizontalAlign ?? 'left', verticalAlign: args.verticalAlign ?? 'bottom', font: args.dialogueFont === 'fixed8x8' ? 'fixed8x8' : 'fixed8x16', avatarSource: avatarSourceFor(args.avatarImage), avatarSize: Number(args.avatarSize) === 32 ? 32 : 16, avatarPlacement: args.avatarPlacement ?? 'inside', avatarAnchor: args.avatarAnchor ?? 'top-left', avatarX: coordinatePixels(args, 'avatarX', 112), avatarY: coordinatePixels(args, 'avatarY', 16) });
    }
  };
  useEventPreviewArea(dialogueBodyRef, event.id, () => updateDialoguePreview(resolveVariablePreview(String(args.text ?? ''))), () => setDialoguePreview(null), args.__collapse, event.command);
  useEventPreviewArea(choiceFieldRef, event.id, updateChoicePreview, () => setDialoguePreview(null), args.__collapse, event.command);
  useEventPreviewArea(uiTextFieldRef, event.id, updateUiTextPreview, () => setUiTextPreviewAnchor(null), args.__collapse, event.command);
  useEventPreviewArea(uiAnimationFieldRef, event.id, updateUiAnimationPreview, () => setUiAnimationPreviewAnchor(null), args.__collapse, event.command);
  useEffect(() => {
    if (!dialoguePreview) return undefined;
    const anchorElement = dialogueBodyRef.current ?? choiceFieldRef.current ?? dialogueFieldRef.current;
    const updatePreviewPosition = () => {
      const anchor = anchorElement?.getBoundingClientRect();
      if (!anchorElement?.isConnected || !anchor || anchor.width <= 0 || anchor.height <= 0) {
        setDialoguePreview(null);
        return;
      }
      setDialoguePreview(current => current ? { ...current, anchor } : current);
    };
    // Collapsing an ancestor can hide the field without a window resize or blur.
    const observer = new ResizeObserver(updatePreviewPosition);
    if (anchorElement) observer.observe(anchorElement);
    window.addEventListener('scroll', updatePreviewPosition, true);
    window.addEventListener('resize', updatePreviewPosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updatePreviewPosition, true);
      window.removeEventListener('resize', updatePreviewPosition);
    };
  }, [Boolean(dialoguePreview)]);
  useEffect(() => {
    if (!uiTextPreviewAnchor) return undefined;
    const updatePosition = () => {
      const anchor = uiTextFieldRef.current?.getBoundingClientRect();
      if (anchor) setUiTextPreviewAnchor(current => current ? anchor : null);
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
      if (anchor) setUiAnimationPreviewAnchor(current => current ? anchor : null);
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
  const isMenuEvent = event.command === EEvents.MENU_OPEN;
  const menuLayout = getMenuLayout(args, isMenuEvent);
  const maxMenuTitleCharacters = menuLayout.position === 'left' || menuLayout.position === 'right' ? Math.floor(menuLayout.promptWidth / 8) * 2 : MENU_MAX_PROMPT_CHARACTERS;
  const menuWarning = (field: 'prompt' | 'options' | 'optionA' | 'optionB') => getMenuLayoutIssues(args, isMenuEvent).filter(issue =>
    field === 'prompt' ? issue.code === 'promptRows' : issue.code !== 'promptRows' && (field === 'options' || issue.index === (field === 'optionA' ? 1 : 2) || issue.code === 'emptyOptions')
  ).map(issue => t(`events.menu.${issue.code}`, { index: issue.index ?? '', max: issue.max ?? '' })).join(' ');
  const uiTextFont = (PREVIEW_FONTS[args.font as PreviewFontId] ? args.font : 'fixed8x16') as PreviewFontId;
  const uiTextBounds = measureFontText(uiTextFont, resolveVariablePreview(String(args.text ?? '')));
  const uiTextMaxX = Math.max(0, 240 - uiTextBounds.width);
  const uiTextMaxY = Math.max(0, 160 - uiTextBounds.height);
  const dialogueTextField = [EEvents.DISPLAY_DIALOGUE, EEvents.DIALOGUE_SHOW].includes(event.command as EEvents) ? (
    <Form.Item label="Text">
      <div ref={dialogueFieldRef}>
        <VariableTextArea
          rows={5} value={args.text ?? ''} variables={variables.variables}
          onFocus={() => updateDialoguePreview(resolveVariablePreview(String(args.text ?? '')))}
          onChange={value => { const text = sanitizeWithNotice(value); update({ text }); }}
        />
      </div>
    </Form.Item>
  ) : null;
  const physicalButtonOptions = ['A', 'B', 'L', 'R', 'START', 'SELECT', 'UP', 'DOWN', 'LEFT', 'RIGHT'].map(button => ({ value: button, label: button }));
  const actionOptions = Object.keys(withDefaultInputMap(settings?.inputMap)).map(action => ({ value: action, label: `Action: ${action}` }));
  const buttonOptions = [...physicalButtonOptions, ...actionOptions];
  useEffect(() => {
    if (event.command === EEvents.WAIT_FOR_BUTTON) {
      const buttons = Array.isArray(args.buttons) && args.buttons.length > 0 ? args.buttons : [args.button ?? 'A'];
      customTitle?.(`Attach Script to ${buttons.join(', ')} Button`);
    }
    if (event.command === EEvents.REMOVE_BUTTON_SCRIPT) {
      const buttons = Array.isArray(args.buttons) && args.buttons.length > 0 ? args.buttons : [args.button ?? 'A'];
      customTitle?.(`Remove ${buttons.join(', ')} Button Script`);
    }
    if (event.command === EEvents.PAUSE_UNTIL_BUTTON_PRESSED) {
      const buttons = Array.isArray(args.buttons) && args.buttons.length > 0 ? args.buttons : [args.button ?? 'A'];
      customTitle?.(`Pause Script Until ${buttons.join(', ')} Pressed`);
    }
    if (event.command === EEvents.SHOW_EMOTE) {
      const activeObject = settingUtils.activeSceneObject;
      const owner = activeObject?.type === 'actor' && activeObject.sceneId === elementSelected?.id
        ? elementSelected?.actors?.find(actor => actor.id === activeObject.id)
        : undefined;
      const actorName = args.actorId === '__PLAYER__' ? 'Player'
        : args.actorId === '__SELF__' ? (owner?.name || owner?.actorId || 'Self')
          : elementSelected?.actors?.find(actor => actor.id === args.actorId)?.name || args.actorId || 'Actor';
      const emoteName = emoteFiles.find(file => sanitizeEmoteId(file) === args.emoteId)?.replace(/\.[^/.]+$/, '') || args.emoteId || 'Emote';
      customTitle?.(`${actorName} Emote ${emoteName}`);
    }
  }, [event.command, event.id, args.button, args.buttons, args.actorId, args.emoteId, customTitle, emoteFiles, elementSelected, settingUtils.activeSceneObject]);
  const actorEntries = [
    ['__PLAYER__', { value: '__PLAYER__', label: 'Player' }] as const,
    ...(elementSelected?.actors ?? [])
      .filter(actor => Boolean(actor.id))
      .map(actor => [actor.id, { value: actor.id, label: actor.name ?? actor.actorId ?? actor.id }] as const),
  ];
  const actors = Array.from(new Map(actorEntries).values());
  const spriteImageForActor = (actorId: string) => {
    const spriteId = actorId === '__PLAYER__'
      ? settings?.playerSpriteId
      : elementSelected?.actors?.find(actor => actor.id === actorId)?.spriteId;
    if (!spriteId) return undefined;
    const spriteResource = (spriteResources ?? []).find((sprite: any) => sprite.id === spriteId);
    if (actorFrameThumbnails[spriteId]) return actorFrameThumbnails[spriteId];
    if (spriteResource) return undefined;
    const filename = `${spriteId}.png`.toLowerCase();
    return spriteImagePaths[filename]
      ?? Object.entries(spriteImagePaths).find(([file]) => file.replace(/\.[^/.]+$/, '') === String(spriteId).toLowerCase())?.[1];
  };
  const pickerOption = (image: string | undefined, label: React.ReactNode, cropSprite = false) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, minHeight: 32 }}>
      <span aria-hidden="true" style={{ width: 28, height: 28, overflow: 'hidden', flex: '0 0 28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(127,127,127,.12)', borderRadius: 3 }}>
        {image && <img src={image} alt="" style={cropSprite
          ? { display: 'block', flex: '0 0 auto', imageRendering: 'pixelated' }
          : { display: 'block', maxWidth: 28, maxHeight: 28, objectFit: 'contain', imageRendering: 'pixelated' }} />}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </span>
  );
  const activeSceneObject = settingUtils.activeSceneObject;
  const activeActor = activeSceneObject?.type === 'actor' && activeSceneObject.sceneId === elementSelected?.id
    ? elementSelected?.actors?.find(actor => actor.id === activeSceneObject.id)
    : undefined;
  const emoteActorOptions = [
    ...self.options.map(option => ({ ...option, image: activeActor ? spriteImageForActor(activeActor.id) : undefined })),
    ...actors.map(actor => ({ ...actor, image: spriteImageForActor(actor.value) })),
  ];
  const renderActorOption = (value: string, label: React.ReactNode) => {
    const option = emoteActorOptions.find(item => item.value === value);
    return pickerOption(option?.image, label ?? option?.label ?? value, true);
  };
  const actorSelect = <Select showSearch allowClear style={{ width: '100%' }} value={args.actorId || undefined}
    options={[...self.options, ...actors]} optionFilterProp="label" placeholder="Select actor" onChange={actorId => update({ actorId })} />;
  const emoteActorSelect = <Select showSearch allowClear optionFilterProp="label" optionRender={option => renderActorOption(String(option.value), option.label)} labelRender={({ value, label }) => renderActorOption(String(value), label)} style={{ width: '100%' }} value={args.actorId || '__SELF__'}
    options={emoteActorOptions} placeholder="Select actor" onChange={actorId => update({ actorId })} />;
  const emoteOptions = emoteFiles.map(file => ({
    value: sanitizeEmoteId(file), label: file.replace(/\.[^/.]+$/, ''),
    image: emoteImagePath ? `${emoteImagePath.replace(/[\\/]+$/, '')}/${file}` : undefined,
  }));
  const renderEmoteOption = (value: string, label: React.ReactNode) => {
    const option = emoteOptions.find(item => item.value === value);
    return pickerOption(option?.image, label ?? option?.label ?? value);
  };
  const emoteSelect = <Select showSearch allowClear optionFilterProp="label" optionRender={option => renderEmoteOption(String(option.value), option.label)} labelRender={({ value, label }) => renderEmoteOption(String(value), label)} style={{ width: '100%' }} value={args.emoteId || undefined}
    options={emoteOptions}
    placeholder={emoteFiles.length ? 'Select emote' : 'No images in assets/emotes'} onChange={emoteId => update({ emoteId })} />;
  const avatarOptions = avatarFiles.map(file => ({
    value: file,
    label: file.replace(/\.[^/.]+$/, ''),
    image: avatarImagePath ? `${avatarImagePath.replace(/[\\/]+$/, '')}/${file}` : undefined,
    disabled: avatarDimensions[file]?.width !== (Number(args.avatarSize) === 32 ? 32 : 16)
      || avatarDimensions[file]?.height !== (Number(args.avatarSize) === 32 ? 32 : 16),
  }));
  const renderAvatarOption = (value: string, label: React.ReactNode) => {
    const option = avatarOptions.find(item => item.value === value);
    return <span style={{ display: 'inline-flex', filter: option?.disabled ? 'grayscale(1)' : undefined, opacity: option?.disabled ? .45 : 1 }}>{pickerOption(option?.image, label ?? option?.label ?? value)}</span>;
  };
  const dialogueAvatarControls = supportsDialoguePortrait ? <>
    <Form.Item label={t('events.dialogue.portrait')}>
      <Switch checked={args.portraitEnabled === true} onChange={portraitEnabled => update({ portraitEnabled })} />
    </Form.Item>
    {args.portraitEnabled === true && <>
    <Form.Item label={t('events.dialogue.avatarSize')}><Segmented block value={Number(args.avatarSize) === 32 ? 32 : 16} options={[{ value: 16, label: '16×16' }, { value: 32, label: '32×32' }]} onChange={avatarSize => {
      const selected = avatarDimensions[args.avatarImage];
      update({ avatarSize, ...(args.avatarImage && (!selected || selected.width !== Number(avatarSize) || selected.height !== Number(avatarSize)) ? { avatarImage: '' } : {}) });
    }} /></Form.Item>
    <Form.Item label={t('events.dialogue.avatarImage')}>
      <Select showSearch allowClear optionFilterProp="label" value={args.avatarImage || undefined}
        options={avatarOptions} optionRender={option => renderAvatarOption(String(option.value), option.label)}
        labelRender={({ value, label }) => renderAvatarOption(String(value), label)}
        placeholder={avatarFiles.length ? t('events.dialogue.selectAvatar') : t('events.dialogue.noAvatars')}
        onChange={avatarImage => update({ avatarImage: avatarImage ?? '' })} />
    </Form.Item>
    {args.avatarImage && <>
      <Form.Item label={t('events.dialogue.avatarPlacement')}><Select value={args.avatarPlacement ?? 'inside'} options={[
        { value: 'inside', label: t('events.dialogue.inside') }, { value: 'frame-top', label: t('events.dialogue.frameTop') },
        { value: 'above', label: t('events.dialogue.aboveFrame') }, { value: 'free', label: t('events.dialogue.free') },
      ]} onChange={avatarPlacement => update({ avatarPlacement, avatarAnchor: avatarPlacement === 'inside' ? 'top-left' : 'center' })} /></Form.Item>
      {args.avatarPlacement !== 'free' && <Form.Item label={t(args.avatarPlacement === 'inside' ? 'events.dialogue.corner' : 'events.dialogue.alignment')}>
        {args.avatarPlacement === 'inside'
          ? <Segmented block aria-label={t('events.dialogue.corner')} value={args.avatarAnchor ?? 'top-left'} options={[
            { value: 'top-left', label: t('events.dialogue.topLeft') },
            { value: 'top-right', label: t('events.dialogue.topRight') },
            { value: 'bottom-left', label: t('events.dialogue.bottomLeft') },
            { value: 'bottom-right', label: t('events.dialogue.bottomRight') },
          ]} onChange={avatarAnchor => update({ avatarAnchor })} />
          : <Segmented block aria-label={t('events.dialogue.alignment')} value={args.avatarAnchor ?? 'center'} options={[
            { value: 'left', label: t('events.dialogue.left') }, { value: 'center', label: t('events.dialogue.center') }, { value: 'right', label: t('events.dialogue.right') },
          ]} onChange={avatarAnchor => update({ avatarAnchor })} />}
      </Form.Item>}
      {args.avatarPlacement === 'free' && <CoordinateInputs args={args} onChange={update} fields={['avatarX', 'avatarY']} defaults={[112, 16]} min={[0, 0]} max={[240 - (Number(args.avatarSize) === 32 ? 32 : 16), 160 - (Number(args.avatarSize) === 32 ? 32 : 16)]} />}
    </>}
    </>}
  </> : null;
  const musicSelect = <Select showSearch allowClear style={{ width: '100%' }} value={args.musicId || undefined}
    optionFilterProp="label" options={(['original', 'project'] as const).map(group => ({ label: t(group === 'original' ? 'music.library.original' : 'music.library.project'), options: musicFiles.filter(file => file.group === group) }))} placeholder={t('events.sound.selectMusic')} onChange={musicId => update({ musicId })} />;
  const soundSelect = <Select showSearch allowClear optionFilterProp="label" style={{ width: '100%' }}
    value={args.soundId ? `${args.soundSource ?? 'asset'}:${args.soundId}` : undefined}
    options={[
      { label: t('music.library.original'), options: soundFiles.map(file => ({ value: `asset:${file.replace(/\.[^/.]+$/, '')}`, label: file.split(/[\\/]/).pop() ?? file })) },
      { label: t('sfx.projectGroup'), options: sfxProjectFiles.map(file => ({ value: `project:${file.replace(/\.gbasfx$/i, '')}`, label: file })) },
      ...(args.soundSource === 'generated' ? [{ label: t('events.sound.sourceGenerated'), options: [{ value: `generated:${args.soundId}`, label: t('events.sound.sourceGenerated') }] }] : []),
    ]} placeholder={t('events.sound.selectAsset')} onChange={value => {
      if (!value) { update({ soundId: undefined, soundSource: 'asset' }); return; }
      const separator = value.indexOf(':');
      update({ soundSource: value.slice(0, separator), soundId: value.slice(separator + 1) });
    }} />;
  const openSfxGenerator = () => {
    stopSoundPreview();
    let parameters = defaultSfxParameters;
    if (args.sfxParameters) {
      try { parameters = JSON.parse(args.sfxParameters); } catch { /* Use defaults for malformed authoring data. */ }
    }
    setSfxDraft({ parameters });
    setSfxModalOpen(true);
  };
  const previewGeneratedSound = async () => {
    stopSoundPreview();
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const context = soundPreviewContextRef.current ?? new AudioContextConstructor();
    soundPreviewContextRef.current = context;
    if (context.state === 'suspended') await context.resume();
    let buffer: AudioBuffer;
    if (args.soundSource === 'generated') {
      const samples = generateEventSoundSamples(args);
      buffer = context.createBuffer(1, samples.length, args.sfxParameters !== undefined ? 22050 : GENERATED_SOUND_SAMPLE_RATE);
      buffer.copyToChannel(new Float32Array(samples), 0);
    } else if (args.soundSource === 'project') {
      const result = await window.electronAPI.loadProjectSfx(`${args.soundId}.gbasfx`);
      if (result?.status !== 'success') throw new Error(t('sfx.openFailed'));
      const generated = generateSfx({ ...defaultSfxParameters, ...result.document.parameters });
      buffer = context.createBuffer(1, generated.pcm.length, generated.parameters.sampleRate);
      buffer.copyToChannel(new Float32Array(generated.pcm), 0);
    } else {
      const filename = soundFiles.find(file => file.replace(/\.[^/.]+$/, '') === args.soundId);
      if (!filename) return;
      const bytes = await window.electronAPI.readImageBytes(`${soundAssetPath.replace(/[\\/]+$/, '')}/${filename}`);
      buffer = await context.decodeAudioData(new Uint8Array(bytes).buffer);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.25, Math.min(4, Number(args.speed ?? 100) / 100));
    const gain = context.createGain();
    gain.gain.value = Math.max(0, Math.min(1, Number(args.volume ?? 100) / 100));
    const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, Number(args.panning ?? 0) / 100));
      source.connect(gain).connect(panner).connect(context.destination);
    } else source.connect(gain).connect(context.destination);
    source.onended = () => {
      if (soundPreviewSourceRef.current === source) {
        soundPreviewSourceRef.current = null;
        setSoundPreviewPlaying(false);
      }
    };
    soundPreviewSourceRef.current = source;
    setSoundPreviewPlaying(true);
    source.start();
  };
  const variableSelect = <Select showSearch allowClear style={{ width: '100%' }} value={args.resultVariable || undefined}
    options={variableOptions(variables.variables, t)} placeholder="Select result variable" onChange={resultVariable => update({ resultVariable })} />;
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
  const dialogueFontSelect = <Select aria-label="Font" size="large" showSearch optionFilterProp="label"
    optionRender={option => renderDialogueFontChoice(option.value as PreviewFontId, String(option.label ?? ''))}
    labelRender={({ value, label }) => renderDialogueFontChoice(value as PreviewFontId, typeof label === 'string' ? label : (value === 'fixed8x8' ? 'Font S' : 'Font M'))}
    value={args.dialogueFont === 'fixed8x8' ? 'fixed8x8' : 'fixed8x16'} options={dialogueFontOptions}
    onChange={dialogueFont => { update({ dialogueFont }); setDialoguePreview(current => current ? { ...current, font: dialogueFont as PreviewFontId } : current); }} />;
  const previewBackground = (settings?.fadeDirection ?? 0) === 0 ? '#fff' : '#000';
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
      uiSources.push({ value: item.id, label: label.trim(), text: item.command === EEvents.UI_SET_TEXT ? String(sourceArgs.text ?? '') : `${String(sourceArgs.label ?? '')}${sourceArgs.label ? ': ' : ''}${String(sourceArgs.value ?? 0)}`, x: coordinatePixels(sourceArgs, 'x'), y: coordinatePixels(sourceArgs, 'y'), font: sourceArgs.font ?? 'fixed8x16' });
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

  const actorMoveEnabled = args.animated ?? event.command === EEvents.ACTOR_MOVE_TO;
  const [actorMoveTab, setActorMoveTab] = useState('movement');
  useEffect(() => {
    if (!actorMoveEnabled) setActorMoveTab('movement');
  }, [actorMoveEnabled]);
  const actorPositionHover = {
    onMouseEnter: () => { actorPositionHovered.current = true; dispatchActorPositionPreview(args); },
    onMouseLeave: () => { actorPositionHovered.current = false; window.dispatchEvent(new CustomEvent('gba-studio:actor-position-preview', { detail: null })); },
  };
  const actorPositionControl = <Form.Item>
    <Flex gap={8} style={{ width: '100%' }}>
      {(['x', 'y'] as const).map(axis => <Flex key={axis} vertical gap={4} style={{ flex: 1, minWidth: 0 }}>
        <Flex align="center" gap={4}><Typography.Text style={{ fontSize: 12 }}>{axis.toUpperCase()}</Typography.Text>
          {<Button type="text" size="small" aria-label={t('events.actor.coordinateUnit', { axis: axis.toUpperCase() })} title={t('events.actor.tileUnitHint')} style={{ height: 20, paddingInline: 4, fontSize: 11 }} onClick={() => { const unit = args[axis + 'Unit'] === 'tiles' ? 'pixels' : 'tiles'; update({ [axis + 'Unit']: unit }); }}>{args[axis + 'Unit'] === 'tiles' ? t('events.actor.tiles') : 'px'}</Button>}
        </Flex>
        <NumericEventInput min={0} value={args[axis] ?? 0} onChange={value => update({ [axis]: value })} />
      </Flex>)}
    </Flex>
  </Form.Item>;

  switch (event.command) {
    case EEvents.CAMERA_STOP_FOLLOW:
      return <Typography.Paragraph type="secondary">{t('events.description.EVENT_CAMERA_STOP_FOLLOW')}</Typography.Paragraph>;
    case EEvents.CAMERA_FOLLOW:
      return <CameraFollowPreview event={event}><Form layout="vertical">
        <Form.Item label={t('events.cameraFollow.actor')}><WarningField warning={!String(args.actorId ?? '').trim()} message={t('events.pendingInputs')}>{React.cloneElement(actorSelect, { 'aria-label': t('events.cameraFollow.actor'), status: !String(args.actorId ?? '').trim() ? 'warning' : undefined })}</WarningField></Form.Item>
        <Form.Item label={t('events.cameraFollow.persist')} extra={t('events.cameraFollow.persistHelp')}><Switch aria-label={t('events.cameraFollow.persist')} checked={args.persistAcrossScenes === true} onChange={persistAcrossScenes => update({ persistAcrossScenes })} /></Form.Item>
        <Form.Item label={t('events.cameraFollow.clamp')}><Switch checked={args.clampToScene === true} onChange={clampToScene => update({ clampToScene })} /></Form.Item>
        <Flex gap={16} wrap style={{ marginBottom: 8 }}>
          <Checkbox checked={args.lockX === true} onChange={event => update({ lockX: event.target.checked })}>{t('events.cameraFollow.lockX')}</Checkbox>
          <Checkbox checked={args.lockY === true} onChange={event => update({ lockY: event.target.checked })}>{t('events.cameraFollow.lockY')}</Checkbox>
        </Flex>
        <Typography.Paragraph type="secondary">{t('events.cameraFollow.lockHelp')}</Typography.Paragraph>
        <Typography.Paragraph type="secondary">{t('events.cameraFollow.help')}</Typography.Paragraph>
        <Flex gap={8}>
          <NumericEventInput label={t('events.cameraFollow.width')} min={0} max={240} value={args.deadZoneWidth ?? 0} onChange={deadZoneWidth => update({ deadZoneWidth })} style={{ flex: 1, minWidth: 0 }} />
          <NumericEventInput label={t('events.cameraFollow.height')} min={0} max={160} value={args.deadZoneHeight ?? 0} onChange={deadZoneHeight => update({ deadZoneHeight })} style={{ flex: 1, minWidth: 0 }} />
        </Flex>
      </Form></CameraFollowPreview>;
    case EEvents.CAMERA_SHAKE:
      return <CameraShakeEvent args={args} onChange={update} />;
    case EEvents.SPAWN_ACTOR:
    case EEvents.ACTOR_SPAWN:
      return <div {...(args.source === 'prefab' ? {} : actorPositionHover)}><Form layout="vertical">
        <Form.Item label={t('events.spawn.source')}><Select aria-label={t('events.spawn.source')} value={args.source ?? 'actor'} options={[
          { value: 'actor', label: t('events.spawn.actor') }, { value: 'prefab', label: t('events.spawn.prefab') },
        ]} onChange={source => update({ source, actorId: '', prefabId: '' })} /></Form.Item>
        {args.source === 'prefab' ? <>
          <Form.Item label={t('events.spawn.prefab')} validateStatus={args.prefabId && !(prefabs?.prefabs ?? []).some(prefab => prefab.id === args.prefabId && prefab.type === 'actor' && !(prefab as any)._deleted) ? 'error' : undefined} help={args.prefabId && !(prefabs?.prefabs ?? []).some(prefab => prefab.id === args.prefabId && prefab.type === 'actor' && !(prefab as any)._deleted) ? t('events.spawn.missingPrefab') : undefined}><Select showSearch allowClear optionFilterProp="label" aria-label={t('events.spawn.prefab')} value={args.prefabId || undefined}
            options={(prefabs?.prefabs ?? []).filter(prefab => prefab.type === 'actor' && !(prefab as any)._deleted).map(prefab => ({ value: prefab.id, label: prefab.name }))}
            onChange={prefabId => update({ prefabId: prefabId ?? '' })} /></Form.Item>
          <Typography.Paragraph type="secondary">{t('events.spawn.prefabHint')}</Typography.Paragraph>
        </> : <Form.Item label={t('events.state.actor')}>{actorSelect}</Form.Item>}
        {actorPositionControl}</Form></div>;
    case EEvents.MOVE_ACTOR:
    case EEvents.ACTOR_MOVE_TO:
      return <div {...actorPositionHover}><Tabs size="small" activeKey={actorMoveEnabled ? actorMoveTab : 'movement'} onChange={setActorMoveTab} items={[
        { key: 'movement', label: t('events.actor.movement'), children: <Form layout="vertical"><Form.Item label={t('events.state.actor')}>{actorSelect}</Form.Item>{actorPositionControl}<ActorMotionSpeedControl enabled={args.animated ?? event.command === EEvents.ACTOR_MOVE_TO} speed={args.speed ?? settings?.startMoveSpeed ?? 1} animationSpeed={args.animationSpeed ?? settings?.startAnimSpeed ?? 6} onChange={update} /></Form> },
        { key: 'options', label: t('events.actor.options'), disabled: !actorMoveEnabled, children: <Form layout="vertical">
          <Form.Item label={t('events.actor.collideWith')}><Space wrap>
            <Checkbox checked={args.collideWalls !== false} onChange={e => update({ collideWalls: e.target.checked })}>{t('events.actor.walls')}</Checkbox>
            <Checkbox checked={args.collideActors === true} onChange={e => update({ collideActors: e.target.checked })}>{t('events.actor.actors')}</Checkbox>
          </Space></Form.Item>
          <Form.Item label={t('events.actor.lockDirection')}><Select aria-label={t('events.actor.lockDirection')} value={args.lockDirection ?? 'none'} options={['none', 'horizontal', 'vertical'].map(value => ({ value, label: t(`events.actor.lock.${value}`) }))} onChange={lockDirection => update({ lockDirection })} /></Form.Item>
        </Form> },
        { key: 'movement-type', label: t('events.actor.movementType'), disabled: !actorMoveEnabled, children: <Form layout="vertical"><Form.Item label={t('events.actor.movementType')}><Select aria-label={t('events.actor.movementType')} value={args.movementType ?? 'horizontal-first'} options={['horizontal-first', 'vertical-first', 'diagonal'].map(value => ({ value, label: t(`events.actor.type.${value}`) }))} onChange={movementType => update({ movementType })} /></Form.Item></Form> },
      ]} /></div>;
    case EEvents.ACTOR_SET_POSITION:
      return <div {...actorPositionHover}><Form layout="vertical"><Form.Item label={t('events.state.actor')}>{actorSelect}</Form.Item>{actorPositionControl}</Form></div>;
    case EEvents.REMOVE_ACTOR:
    case EEvents.ACTOR_DESPAWN:
      return <Form layout="vertical">
        <Form.Item label={t('events.spawn.source')}><Select aria-label={t('events.spawn.source')} value={args.source ?? 'actor'} options={[
          { value: 'actor', label: t('events.spawn.actor') }, { value: 'prefab', label: t('events.spawn.prefab') },
        ]} onChange={source => update({ source, actorId: '', prefabId: '' })} /></Form.Item>
        {args.source === 'prefab' ? <>
          <Form.Item label={t('events.spawn.prefab')} validateStatus={args.prefabId && !(prefabs?.prefabs ?? []).some(prefab => prefab.id === args.prefabId && prefab.type === 'actor' && !(prefab as any)._deleted) ? 'error' : undefined} help={args.prefabId && !(prefabs?.prefabs ?? []).some(prefab => prefab.id === args.prefabId && prefab.type === 'actor' && !(prefab as any)._deleted) ? t('events.spawn.missingPrefab') : undefined}><Select showSearch allowClear optionFilterProp="label" aria-label={t('events.spawn.prefab')} value={args.prefabId || undefined}
            options={(prefabs?.prefabs ?? []).filter(prefab => prefab.type === 'actor' && !(prefab as any)._deleted).map(prefab => ({ value: prefab.id, label: prefab.name }))}
            onChange={prefabId => update({ prefabId: prefabId ?? '' })} /></Form.Item>
          <Typography.Paragraph type="secondary">{t('events.spawn.removePrefabHint')}</Typography.Paragraph>
        </> : <Form.Item label={t('events.state.actor')}>{actorSelect}</Form.Item>}
      </Form>;
    case EEvents.SHOW_EMOTE:
      return <Form layout="vertical"><Form.Item label="Actor">{emoteActorSelect}</Form.Item><Form.Item label="Emote">{emoteSelect}</Form.Item>{number(t('events.emote.distance'), 'distance', 0, 256, 12)}</Form>;
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
      return <Form layout="vertical"><Form.Item label="Music">{musicSelect}</Form.Item>{number('Volume', 'volume', 0, 100)}<Form.Item label={t('events.music.loop')}><Switch aria-label={t('events.music.loop')} checked={args.loop !== false} onChange={loop => update({ loop })} /></Form.Item></Form>;
    case EEvents.MUSIC_PLAY_JINGLE:
      return <Form layout="vertical"><Form.Item label="Jingle">{musicSelect}</Form.Item>{number('Volume', 'volume', 0, 100)}</Form>;
    case EEvents.PLAY_SOUND:
      return <Form layout="vertical">
        <Form.Item label={t('events.sound.assetLabel')}>{soundSelect}</Form.Item>
        <Space wrap style={{ marginBottom: 16 }}>
          <Button onClick={openSfxGenerator}>{t(args.soundSource === 'generated' ? 'events.sound.edit' : 'events.sound.create')}</Button>
          <Button disabled={!args.soundId} icon={soundPreviewPlaying ? <StopOutlined /> : <PlayCircleOutlined />} loading={soundPreviewLoading} onClick={() => {
            if (soundPreviewPlaying) { stopSoundPreview(); return; }
            setSoundPreviewLoading(true);
            void previewGeneratedSound()
              .catch(() => notification.error({ message: t('sfx.previewUnavailable') }))
              .finally(() => setSoundPreviewLoading(false));
          }}>{t(soundPreviewPlaying ? 'sfx.stop' : 'sfx.preview')}</Button>
        </Space>
        <Modal open={sfxModalOpen} title={t('sfx.title')} footer={null} width={1100} destroyOnClose onCancel={() => setSfxModalOpen(false)}>
          {sfxModalOpen && <SfxGenerator sourceDocument={sfxDraft} onSaved={() => {}} onApply={parameters => {
            update({ soundSource: 'generated', soundId: 'generated', sfxParameters: JSON.stringify(parameters) });
            setSfxModalOpen(false);
          }} />}
        </Modal>
        <Form.Item label={t('events.sound.group')}><SoundGroupInput eventId={event.id} value={args.group} onCommit={group => update({ group })} /></Form.Item>
        <SoundPlaybackControls args={args} onChange={update} />
        <Form.Item label={t('events.sound.priority')} extra={t('events.sound.priorityHelp', { count: 4 })}>
          <NumericEventInput value={args.priority ?? 0} min={-32767} max={32767} onChange={priority => update({ priority })} />
        </Form.Item>
      </Form>;
    case EEvents.RUMBLE:
      return <RumbleEvent args={args} onChange={update} />;
    case EEvents.SET_MUSIC_VOLUME:
      return <Form layout="vertical">{number('Volume', 'volume', 0, 100)}</Form>;
    case EEvents.SOUND_STOP:
      return <Form layout="vertical"><Form.Item label={t('events.sound.group')}><SoundGroupSelect value={args.group} onChange={group => update({ group })} /></Form.Item></Form>;
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
      return <Form layout="vertical"><Form.Item label="Wave ID"><Input value={args.waveId ?? ''} placeholder="Default wave" onChange={event => update({ waveId: event.target.value })} /></Form.Item><Form.Item label="Music ID">{musicSelect}</Form.Item>{number('Music volume', 'musicVolume', 0, 100, 100)}<Form.Item label="Background ID"><Input value={args.backgroundId ?? ''} placeholder="Keep current background" onChange={event => update({ backgroundId: event.target.value })} /></Form.Item>{number('Background layer', 'backgroundLayer', 0, 3, 0)}</Form>;
    case EEvents.SHOOTER_SET_BACKGROUND_MODE:
      return <Form layout="vertical">{number('Layer', 'layerId', 0, 3, 0)}<Form.Item label="Visible"><Switch checked={args.visible !== false} onChange={visible => update({ visible })} /></Form.Item>{number('Scroll X', 'x', -2048, 2048, 0)}{number('Scroll Y', 'y', -2048, 2048, 0)}{number('Parallax X (%)', 'x', -200, 200, 100)}{number('Parallax Y (%)', 'y', -200, 200, 100)}</Form>;
    case EEvents.SHOOTER_SPAWN_BOSS:
      return <Form layout="vertical"><Form.Item label="Boss archetype"><Input value={args.archetypeId ?? ''} onChange={event => update({ archetypeId: event.target.value })} /></Form.Item><CoordinateInputs args={args} onChange={update} defaults={[120, 32]} min={[-512, -512]} max={[512, 512]} /><Form.Item label="Drop ID"><Input value={args.dropId ?? ''} onChange={event => update({ dropId: event.target.value })} /></Form.Item></Form>;
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
    case EEvents.ACTOR_SET_DIRECTION:
      return <Form layout="vertical"><Form.Item label={t('events.visual.actor')}><Select aria-label={t('events.visual.actor')} showSearch optionFilterProp="label" value={args.actorId ?? '__PLAYER__'} options={emoteActorOptions} onChange={actorId => update({ actorId })} /></Form.Item>
        <Form.Item label={t('values.direction')}>
          <DirectionRadioGroup role="radiogroup" aria-label={t('values.direction')} buttonStyle="solid" style={{ width: '100%' }} value={args.direction ?? 'down'} onChange={event => update({ direction: event.target.value })}>
            {([['left', CaretLeftFilled], ['up', CaretUpFilled], ['down', CaretDownFilled], ['right', CaretRightFilled]] as const).map(([direction, Icon]) =>
              <Radio.Button key={direction} value={direction} aria-label={t(`values.direction.${direction}`)} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}><Icon /></Radio.Button>
            )}
          </DirectionRadioGroup>
        </Form.Item>
      </Form>;
    case EEvents.ACTOR_SET_ROTATION:
    case EEvents.ACTOR_SET_SCALE: {
      const rotation = event.command === EEvents.ACTOR_SET_ROTATION;
      return <Form layout="vertical"><Form.Item label={t('events.visual.actor')}>{actorSelect}</Form.Item>
        <NumericEventInput label={t(rotation ? 'events.transform.rotation' : 'events.transform.scale')} min={rotation ? -180 : 10} max={rotation ? 180 : 400} value={rotation ? args.angle ?? 0 : args.scale ?? 100} onChange={value => update(rotation ? { angle: value } : { scale: value })} />
        <NumericEventInput label={t('events.transform.duration')} min={1} max={600} value={args.durationFrames ?? 1} onChange={durationFrames => update({ durationFrames })} />
        <Typography.Paragraph type="secondary">{t('events.transform.hint')}</Typography.Paragraph>
      </Form>;
    }
    case EEvents.SPRITE_EFFECT:
      return <Form layout="vertical"><Form.Item label="Actor ID">{actorSelect}</Form.Item>{number('Rotation (degrees)', 'rotation', -180, 180, 0)}{number('Scale (%)', 'scale', 10, 400, 100)}<Form.Item label="Visible"><Switch checked={args.visible !== false} onChange={visible => update({ visible })} /></Form.Item><Form.Item label="Fade color"><Select value={args.fadeColor ?? 'none'} options={[{ value: 'none', label: 'None' }, { value: 'black', label: 'Black' }, { value: 'white', label: 'White' }]} onChange={fadeColor => update({ fadeColor })} /></Form.Item>{number('Fade intensity (%)', 'fadeIntensity', 0, 100, 0)}{number('Duration (frames)', 'durationFrames', 1, 600, 1)}</Form>;
    case EEvents.ACTOR_SET_TINT:
    case EEvents.ACTOR_SET_SATURATION:
    case EEvents.ACTOR_SET_BRIGHTNESS:
    case EEvents.ACTOR_SET_OPACITY: {
      const tint = event.command === EEvents.ACTOR_SET_TINT;
      const saturation = event.command === EEvents.ACTOR_SET_SATURATION;
      const brightness = event.command === EEvents.ACTOR_SET_BRIGHTNESS;
      const field = tint ? 'strength' : saturation ? 'saturation' : brightness ? 'brightness' : 'opacity';
      return <Form layout="vertical"><Form.Item label={t('events.visual.actor')}>{actorSelect}</Form.Item>
        {tint && <Form.Item label={t('events.visual.color')}>
          <ColorPicker disabledAlpha rootClassName="gba-palette-color-picker" value={args.color ?? '#ffffff'} onChange={color => update({ color: color.toHexString() })}>
            <button type="button" aria-label={t('events.visual.color')} style={{ display: 'block', width: 48, height: 48, padding: 0, overflow: 'hidden', cursor: 'pointer', borderRadius: 4, border: '1px solid rgba(127,127,127,.45)' }}>
              <span style={{ display: 'block', width: '100%', height: '100%', background: args.color ?? '#ffffff' }} />
            </button>
          </ColorPicker>
        </Form.Item>}
        <NumericEventInput label={t('events.visual.' + field)} min={brightness ? -100 : 0} max={100} value={args.value ?? (saturation || !tint && !brightness ? 100 : 0)} onChange={value => update({ value })} />
        {tint && <NumericEventInput label={t('events.transform.duration')} min={1} max={600} value={args.durationFrames ?? 1} onChange={durationFrames => update({ durationFrames })} />}
        <Typography.Paragraph type="secondary">{t(event.command === EEvents.ACTOR_SET_OPACITY ? 'events.visual.opacityHint' : 'events.visual.paletteHint')}</Typography.Paragraph>
      </Form>;
    }
    case EEvents.UI_SET_TEXT:
      return <>
        <div ref={uiTextFieldRef}>
          <Form layout="vertical">
            <Form.Item label="Text">
              <VariableTextArea rows={3} value={args.text ?? ''} variables={variables.variables}
                onFocus={updateUiTextPreview}
                onChange={value => update({ text: sanitizeWithNotice(value) })} />
            </Form.Item>
            <Form.Item label="Position">
                <CoordinateInputs args={args} onChange={update} min={[0, 0]} max={[uiTextMaxX, uiTextMaxY]} />
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
        {uiTextPreviewAnchor && <UiTextPreview text={resolveVariablePreview(String(args.text ?? ''))} anchor={uiTextPreviewAnchor} x={coordinatePixels(args, 'x')} y={coordinatePixels(args, 'y')} font={(PREVIEW_FONTS[args.font as PreviewFontId] ? args.font : 'fixed8x16') as PreviewFontId} fontSources={fontSources} backgroundColor={previewBackground} />}
      </>;
    case EEvents.UI_SET_VALUE:
      return <Form layout="vertical"><Form.Item label="Label"><Input value={args.label ?? ''} placeholder="Score" onChange={event => update({ label: event.target.value })} /></Form.Item>{number('Value', 'value', -99999999, 99999999, 0)}<CoordinateInputs args={args} onChange={update} min={[-240, -160]} max={[240, 160]} /><Form.Item label="Font"><Select value={args.font ?? 'fixed8x16'} options={[{ value: 'fixed8x8', label: 'Fixed 8x8' }, { value: 'fixed8x16', label: 'Fixed 8x16' }, { value: 'variable8x8', label: 'Variable 8x8' }, { value: 'variable8x16', label: 'Variable 8x16' }, { value: 'variable16x16', label: 'Variable 16x16' }]} onChange={font => update({ font })} /></Form.Item></Form>;
    case EEvents.UI_ANIMATE:
      return <>
        <div ref={uiAnimationFieldRef}>
          <Form layout="vertical">
            <Form.Item label="UI"><Select showSearch optionFilterProp="label" value={args.uiId || undefined} options={uniqueUiSources} placeholder="Select UI" onChange={uiId => { update({ uiId }); updateUiAnimationPreview(); }} /></Form.Item>
            <Form.Item label="Animation"><Select value={args.animation ?? 'move'} options={[{ value: 'move', label: 'Move' }, { value: 'blink', label: 'Blink' }]} onChange={animation => update({ animation })} /></Form.Item>
            <div style={{ borderTop: '1px solid var(--color-border-secondary, #ddd)', margin: '8px 0' }} />
            {args.animation === 'blink' ? <>{uiSpeedControl}<Form.Item label="Duration (optional; empty = infinite)"><NumericEventInput min={1} max={600} value={args.durationFrames ?? 1} onChange={durationFrames => update({ durationFrames: durationFrames ?? undefined })} style={{ width: '100%' }} /></Form.Item></> : <><Form.Item label="Target position"><CoordinateInputs args={args} onChange={update} min={[0, 0]} max={[240, 160]} /></Form.Item>{uiSpeedControl}</>}
          </Form>
        </div>
        {uiAnimationPreviewAnchor && selectedUiSource && <UiTextPreview
          text={selectedUiSource.text} anchor={uiAnimationPreviewAnchor} x={selectedUiSource.x} y={selectedUiSource.y}
          font={(PREVIEW_FONTS[selectedUiSource.font as PreviewFontId] ? selectedUiSource.font : 'fixed8x16') as PreviewFontId} fontSources={fontSources} backgroundColor={previewBackground}
          effect={{ id: event.id, animation: args.animation === 'blink' ? 'blink' : 'move', targetX: args.x == null ? selectedUiSource.x : coordinatePixels(args, 'x'), targetY: args.y == null ? selectedUiSource.y : coordinatePixels(args, 'y'), speed: uiSpeed, durationFrames: args.durationFrames }}
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
      return <div ref={dialogueBodyRef}><Form layout="vertical">{dialogueTextField}<Form.Item label="Font">{dialogueFontSelect}</Form.Item><Form.Item label="Show frame"><Switch checked={args.showFrame !== false} onChange={showFrame => { update({ showFrame }); setDialoguePreview(current => current ? { ...current, showFrame } : current); }} /></Form.Item><Form.Item label="Horizontal alignment"><Segmented block value={args.horizontalAlign ?? 'center'} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centered' }, { value: 'right', label: 'Right' }]} onChange={horizontalAlign => { update({ horizontalAlign }); setDialoguePreview(current => current ? { ...current, horizontalAlign } : current); }} /></Form.Item>{(!isMenuEvent || menuLayout.position === 'dialogue') && <Form.Item label="Vertical position"><Segmented block value={args.verticalAlign ?? 'bottom'} options={[{ value: 'top', label: 'Top' }, { value: 'center', label: 'Center' }, { value: 'bottom', label: 'Bottom' }]} onChange={verticalAlign => update({ verticalAlign })} /></Form.Item>}<Form.Item label="Animation speed" style={{ marginBottom: 4 }}><Switch checked={args.animate !== false} onChange={animate => update({ animate })} /></Form.Item><Form.Item style={{ marginBottom: 0 }}><Segmented block value={args.animationSpeed ?? 'medium'} options={[{ value: 'slow', label: 'Slow' }, { value: 'medium', label: 'Medium' }, { value: 'fast', label: 'Fast' }]} onChange={animationSpeed => update({ animationSpeed })} /></Form.Item></Form>{dialogueAvatarControls}{dialoguePreview && <DialoguePreview {...dialoguePreview} backgroundColor={previewBackground} frameSource={dialogueFrameSource} fontSources={fontSources} />}</div>;
    case EEvents.VARIABLES_SAVE:
    case EEvents.VARIABLES_LOAD:
      return <Form layout="vertical">
        <Form.Item label={t('events.save.slot')}><Select aria-label={t('events.save.slot')} value={args.slot ?? 7} options={Array.from({ length: 8 }, (_, slot) => ({ value: slot, label: t('events.save.slotNumber', { slot: slot + 1 }) }))} onChange={slot => update({ slot })} /></Form.Item>
        <Form.Item label={t('events.save.allVariables')}><Switch aria-label={t('events.save.allVariables')} checked={args.allVariables === true} onChange={allVariables => update({ allVariables })} /></Form.Item>
        {args.allVariables !== true && <Form.Item label={t('events.save.variables')}><Select aria-label={t('events.save.variables')} mode="multiple" showSearch optionFilterProp="label" value={args.variableIds ?? []} options={globalVariables.variables.filter(isActiveProjectEntry).map(variable => ({ value: variable.id, label: variable.name || variable.symbol }))} onChange={variableIds => update({ variableIds })} /></Form.Item>}
        <Typography.Paragraph type="secondary">{t('events.save.variablesHelp')}</Typography.Paragraph>
      </Form>;
    case EEvents.SAVE_WRITE:
    case EEvents.SAVE_LOAD:
    case EEvents.SAVE_REMOVE:
      return <Form layout="vertical"><Form.Item label={t('events.save.slot')}><Select aria-label={t('events.save.slot')} value={Math.max(0, Math.min(7, Number(args.slot ?? 0)))} options={Array.from({ length: 8 }, (_, slot) => ({ value: slot, label: t('events.save.slotNumber', { slot: slot + 1 }) }))} onChange={slot => update({ slot })} /></Form.Item></Form>;
    case EEvents.SAVE_ON_LOAD:
      return <Typography.Text type="secondary">{t('events.save.onLoadHelp')}</Typography.Text>;
    case EEvents.DIALOGUE_CHOICE:
    case EEvents.MENU_OPEN:
      return <><div ref={choiceFieldRef}><Form layout="vertical">
      {isMenuEvent && <><Form.Item label={t('events.menu.position')}><Select aria-label={t('events.menu.position')} value={menuLayout.position} options={['dialogue', 'full-screen', 'left', 'right'].map(value => ({ value, label: t(`events.menu.position.${value}`) }))} onChange={position => { const columns = position === 'left' || position === 'right' ? Math.min(2, Number(args.columns) || 1) : Math.max(1, Number(args.columns) || 1); const max = position === 'left' || position === 'right' ? Math.floor((columns * 60 - 16) / 8) * 2 : MENU_MAX_PROMPT_CHARACTERS; update({ position, columns, prompt: Array.from(String(args.prompt ?? '')).slice(0, max).join(''), ...(position === 'full-screen' ? { showFrame: false } : {}) }); }} /></Form.Item><Form.Item label={t('events.menu.columns')}><Segmented aria-label={t('events.menu.columns')} block value={menuLayout.columns} options={menuLayout.position === 'left' || menuLayout.position === 'right' ? [1, 2] : [1, 2, 3, 4]} onChange={columns => update({ columns })} /></Form.Item>{menuLayout.columns > 1 && <Form.Item label={t('events.menu.order')}><Select aria-label={t('events.menu.order')} value={args.optionOrder ?? 'rows'} options={['rows', 'columns'].map(value => ({ value, label: t(`events.menu.order.${value}`) }))} onChange={optionOrder => update({ optionOrder })} /></Form.Item>}</>}
        <Form.Item label={t('events.menu.showTitle')}><Switch aria-label={t('events.menu.showTitle')} checked={args.showTitle !== false} onChange={showTitle => update({ showTitle })} /></Form.Item>
        <Typography.Paragraph type="secondary">{t('events.menu.capacity', { rows: menuLayout.rows, capacity: menuLayout.capacity, pages: menuLayout.pages, max: MENU_MAX_OPTIONS, characters: menuLayout.optionCharacters })}</Typography.Paragraph>
        <Form.Item label={t('events.menu.prompt', { max: maxMenuTitleCharacters })}><WarningField warning={!!menuWarning('prompt')} message={menuWarning('prompt')}><Input.TextArea aria-label={t('events.menu.prompt', { max: maxMenuTitleCharacters })} disabled={args.showTitle === false} rows={2} maxLength={maxMenuTitleCharacters} showCount={{ formatter: ({ value }) => `${Array.from(value).length}/${maxMenuTitleCharacters}` }} value={args.prompt ?? ''} onChange={e => { const prompt = Array.from(truncateUtf8(sanitizeWithNotice(e.target.value))).slice(0, maxMenuTitleCharacters).join(''); update({ prompt });  }} /></WarningField></Form.Item>{event.command === EEvents.MENU_OPEN ? <Form.Item label={t('events.menu.options')}><WarningField warning={!!menuWarning('options')} message={menuWarning('options')}><Select aria-label={t('events.menu.options')} mode="tags" maxCount={MENU_MAX_OPTIONS} value={Array.isArray(args.options) && args.options.length > 0 ? args.options : choiceOptions} tokenSeparators={[',']} onChange={(options: string[]) => update({ options: options.map(option => truncateUtf8(sanitizeWithNotice(option))), optionA: options[0] ?? '', optionB: options[1] ?? '' })} placeholder="Menu options" /></WarningField></Form.Item> : <><Form.Item label={t('events.menu.optionA')}><WarningField warning={!!menuWarning('optionA')} message={menuWarning('optionA')}><Input aria-label={t('events.menu.optionA')} showCount maxLength={DIALOGUE_MAX_BYTES} value={args.optionA ?? ''} onChange={e => update({ optionA: truncateUtf8(sanitizeWithNotice(e.target.value)) })} /></WarningField></Form.Item><Form.Item label={t('events.menu.optionB')}><WarningField warning={!!menuWarning('optionB')} message={menuWarning('optionB')}><Input aria-label={t('events.menu.optionB')} showCount maxLength={DIALOGUE_MAX_BYTES} value={args.optionB ?? ''} onChange={e => update({ optionB: truncateUtf8(sanitizeWithNotice(e.target.value)) })} /></WarningField></Form.Item></>}<Form.Item label={t('events.menu.initialSelection')}><Select showSearch optionFilterProp="label" aria-label={t('events.menu.initialSelection')} value={Math.min(Number(args.initialSelection ?? 0), Math.max(0, menuLayout.options.length - 1))} options={menuLayout.options.map((label, value) => ({ label: `${value}: ${label}`, value }))} onChange={initialSelection => update({ initialSelection })} /></Form.Item><Form.Item label="Result variable">{variableSelect}</Form.Item><Form.Item label="Font">{dialogueFontSelect}</Form.Item>{menuLayout.position !== 'full-screen' && <Form.Item label="Show frame"><Switch checked={args.showFrame !== false} onChange={showFrame => update({ showFrame })} /></Form.Item>}<Form.Item label="Horizontal alignment"><Segmented block value={args.horizontalAlign ?? 'left'} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centered' }, { value: 'right', label: 'Right' }]} onChange={horizontalAlign => update({ horizontalAlign })} /></Form.Item>{(!isMenuEvent || menuLayout.position === 'dialogue') && <Form.Item label="Vertical position"><Segmented block value={args.verticalAlign ?? 'bottom'} options={[{ value: 'top', label: 'Top' }, { value: 'center', label: 'Center' }, { value: 'bottom', label: 'Bottom' }]} onChange={verticalAlign => update({ verticalAlign })} /></Form.Item>}<Form.Item label={t('events.menu.animateChoices')}><Switch checked={args.animate !== false} onChange={animate => update({ animate })} /></Form.Item><Form.Item label="Animation speed"><Segmented block value={args.animationSpeed ?? 'medium'} options={[{ value: 'slow', label: 'Slow' }, { value: 'medium', label: 'Medium' }, { value: 'fast', label: 'Fast' }]} onChange={animationSpeed => update({ animationSpeed })} /></Form.Item><Form.Item label="Allow cancel with B (off = choice required)"><Switch checked={args.allowCancel !== false} onChange={allowCancel => update({ allowCancel })} /></Form.Item></Form></div>{dialoguePreview && <ChoiceMenuPreview backgroundColor={previewBackground} args={args} anchor={dialoguePreview.anchor} frameSource={dialogueFrameSource} fontSources={fontSources} cursorSource={dialogueCursorSource} selectedIndex={Math.min(Number(args.initialSelection ?? 0), Math.max(0, menuLayout.options.length - 1))} supportsColumns={isMenuEvent} />}</>;
    case EEvents.FOR:
      return <Form layout="vertical">
        <Form.Item label="Variable"><Select showSearch allowClear style={{ width: '100%' }} value={args.variableId || undefined} options={variableOptions(variables.variables.filter(variable => variable.type === 'number'), t)} placeholder="Select numeric variable" onChange={variableId => update({ variableId })} /></Form.Item>
        {number('Start', 'start')}
        {number('End', 'end')}
        {number('Step (negative decrements)', 'step', -999999)}
      </Form>;
    case EEvents.RUN_BUTTON_ACTION:
      return <Form layout="vertical"><Form.Item label={t('events.buttonAction.button')}><Select aria-label={t('events.buttonAction.button')} value={args.button ?? 'B'} options={physicalButtonOptions} onChange={button => update({ button })} /></Form.Item>
        <Form.Item label={t('events.buttonAction.mode')}><Select aria-label={t('events.buttonAction.mode')} value={args.mode ?? 'default'} options={['default', 'custom'].map(mode => ({ value: mode, label: t('events.buttonAction.' + mode) }))} onChange={mode => update({ mode })} /></Form.Item>
        <Typography.Paragraph type="secondary">{t('events.buttonAction.hint')}</Typography.Paragraph></Form>;
    case EEvents.WAIT_FOR_BUTTON:
      return <Form layout="vertical"><Form.Item label="Buttons"><Select mode="multiple" value={args.buttons ?? (args.button ? [args.button] : ['A'])} options={buttonOptions} onChange={buttons => update({ buttons, button: buttons[0] ?? 'A' })} /></Form.Item><Form.Item><Space><Tooltip title="Set if the script should replace the default game action for the specified button."><Switch checked={args.overrideButton === true} onChange={overrideButton => update({ overrideButton })} /></Tooltip><Typography.Text>Override default button action</Typography.Text></Space></Form.Item></Form>;
    case EEvents.REMOVE_BUTTON_SCRIPT:
      return <Form layout="vertical"><Form.Item label="Buttons"><Select mode="multiple" value={args.buttons ?? (args.button ? [args.button] : ['A'])} options={buttonOptions} onChange={buttons => update({ buttons, button: buttons[0] ?? 'A' })} /></Form.Item></Form>;
    case EEvents.PAUSE_UNTIL_BUTTON_PRESSED:
      return <Form layout="vertical"><Form.Item label="Buttons"><Select mode="multiple" value={args.buttons ?? (args.button ? [args.button] : ['A'])} options={buttonOptions} onChange={buttons => update({ buttons, button: buttons[0] ?? 'A' })} /></Form.Item></Form>;
    case EEvents.WAIT_INPUT:
      return <Form layout="vertical"><Form.Item label="Input action"><Select showSearch value={args.action ?? 'confirm'} options={actionOptions} placeholder="Select logical action" onChange={action => update({ action })} /></Form.Item>{number('Timeout (frames, 0 = infinite)', 'timeoutFrames', 0)}</Form>;
    case EEvents.TRIGGER_SET_ENABLED:
      return <Form layout="vertical"><Form.Item label={t('events.triggerState.target')}><Select aria-label={t('events.triggerState.target')} showSearch optionFilterProp="label" value={args.triggerId || undefined} options={(elementSelected?.triggers ?? []).map(trigger => ({ value: trigger.id, label: trigger.name || trigger.id }))} onChange={triggerId => update({ triggerId })} /></Form.Item>
        <Form.Item label={t('events.triggerState.enabled')}><Switch aria-label={t('events.triggerState.enabled')} checked={args.enabled !== false} onChange={enabled => update({ enabled })} /></Form.Item>
        <Typography.Paragraph type="secondary">{t('events.triggerState.hint')}</Typography.Paragraph>
      </Form>;
    case EEvents.IF_ACTOR_FACING:
      return <FacingTargetPreview event={event}><Form layout="vertical"><Form.Item label={t('events.facing.source')}><Select aria-label={t('events.facing.source')} showSearch optionFilterProp="label" value={args.actorId ?? '__SELF__'} options={emoteActorOptions} onChange={actorId => update({ actorId })} /></Form.Item><Form.Item label={t('events.facing.target')}><Select aria-label={t('events.facing.target')} showSearch optionFilterProp="label" value={args.targetActorId ?? '__PLAYER__'} options={emoteActorOptions} onChange={targetActorId => update({ targetActorId })} /></Form.Item><Flex gap={8}>
        {(['X', 'Y'] as const).map(axis => <Form.Item key={axis} label={t('events.facing.look' + axis)} style={{ flex: 1 }}>
          <Switch aria-label={t('events.facing.look' + axis)} checked={args['look' + axis] !== false} onChange={enabled => update({ ['look' + axis]: enabled })} />
        </Form.Item>)}
      </Flex>
      <Form.Item label={t('events.facing.distance')}><CoordinateInputs args={args} onChange={update} fields={['distanceX', 'distanceY']} min={[0, 0]} max={[32767, 32767]} enabled={[args.lookX !== false, args.lookY !== false]} /></Form.Item>
      <Typography.Paragraph type="secondary">{t('events.facing.hint')}</Typography.Paragraph></Form></FacingTargetPreview>;
    case EEvents.IF_BUTTON_HELD:
      return <Form layout="vertical"><Form.Item label="Buttons"><Select mode="multiple" value={args.buttons ?? (args.button ? [args.button] : ['A'])} options={buttonOptions} onChange={buttons => update({ buttons, button: buttons[0] ?? 'A' })} /></Form.Item></Form>;
    case EEvents.INPUT_ENABLE:
    case EEvents.INPUT_DISABLE:
      return <Form layout="vertical"><Form.Item label="Input group"><Select value={args.group ?? 'gameplay'} options={[{ value: 'gameplay', label: 'Gameplay' }, { value: 'menu', label: 'Menu' }, { value: 'interaction', label: 'Interaction' }, { value: 'all', label: 'All input' }]} onChange={group => update({ group })} /></Form.Item></Form>;
    case EEvents.BACKGROUND_SCROLL:
      return <BackgroundTransformPreview event={event} layerId={singleLayerScene ? 2 : Number(args.layerId ?? 0)}><Form layout="vertical">
        <Form.Item label="Current background">
          <Segmented block value={singleLayerScene ? 2 : Number(args.layerId ?? 0)} options={(singleLayerScene ? [2] : [0, 1, 2, 3]).map(layerId => ({ value: layerId, label: `Layer ${layerId}` }))} onChange={value => update({ layerId: Number(value) })} />
        </Form.Item>
        <div style={{ marginBottom: 12 }}><CurrentBackgroundThumbnail eventId={event.id} layerId={singleLayerScene ? 2 : Number(args.layerId ?? 0)} /></div>
        <CoordinateInputs args={args} onChange={update} min={[-32768, -32768]} max={[32767, 32767]} />
      </Form></BackgroundTransformPreview>;
    case EEvents.BACKGROUND_SET_SCALE:
    case EEvents.BACKGROUND_SET_ROTATION:
    case EEvents.BACKGROUND_SET_SHEAR: {
      const scale = event.command === EEvents.BACKGROUND_SET_SCALE;
      const rotation = event.command === EEvents.BACKGROUND_SET_ROTATION;
      return <BackgroundTransformPreview event={event} layerId={singleLayerScene ? 2 : Number(args.layerId ?? 0)}><Form layout="vertical">
        <Form.Item label={t('events.bgTransform.layer')}><Segmented block value={singleLayerScene ? 2 : Number(args.layerId ?? 0)} options={(singleLayerScene ? [2] : [0, 1, 2, 3]).map(layerId => ({ value: layerId, label: `${t('events.bgTransform.layer')} ${layerId}` }))} onChange={value => update({ layerId: Number(value) })} /></Form.Item>
        <div style={{ marginBottom: 12 }}><CurrentBackgroundThumbnail eventId={event.id} layerId={singleLayerScene ? 2 : Number(args.layerId ?? 0)} /></div>
        {rotation ? <NumericEventInput label={t('events.bgTransform.angle')} min={-360} max={360} value={args.angle ?? 0} onChange={angle => update({ angle })} /> : <Flex gap={8}>
          <NumericEventInput label={t(scale ? 'events.bgTransform.scaleX' : 'events.bgTransform.shearX')} min={scale ? 10 : -200} max={scale ? 800 : 200} value={args.x ?? (scale ? 100 : 0)} onChange={x => update({ x })} style={{ flex: 1, minWidth: 0 }} />
          <NumericEventInput label={t(scale ? 'events.bgTransform.scaleY' : 'events.bgTransform.shearY')} min={scale ? 10 : -200} max={scale ? 800 : 200} value={args.y ?? (scale ? 100 : 0)} onChange={y => update({ y })} style={{ flex: 1, minWidth: 0 }} />
        </Flex>}
      </Form></BackgroundTransformPreview>;
    }
    case EEvents.BACKGROUND_SET_PARALLAX:
      return <Form layout="vertical"><Form.Item label={t('events.bgTransform.layer')}><Segmented block value={singleLayerScene ? 2 : Number(args.layerId ?? 0)} options={(singleLayerScene ? [2] : [0, 1, 2, 3]).map(layerId => ({ value: layerId, label: 'Layer ' + layerId}))} onChange={value => update({ layerId: Number(value) })} /></Form.Item>{number('Factor X (%)', 'x', -200, 200, 100)}{number('Factor Y (%)', 'y', -200, 200, 100)}</Form>;
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

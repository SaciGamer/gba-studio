import { isActiveProjectEntry } from '../../../../../shared/projectCollectionEntries';
import CoordinateInputs from './CoordinateInputs';
import { coordinateScale } from '../../../../../shared/events/coordinateUnits';
import React, { useEffect, useState } from 'react';
import { Flex, Form, Select } from 'antd';
import { InputNumber } from '../StepInputNumber';
import NumericEventInput from '../NumericEventInput';
import useAppContexts from '@/providers/contexts/AppContexts';
import { useScriptParameterVariables } from './ScriptParameterContext';
import { variableOptions as groupedVariableOptions } from './variableOptions';
import { useI18n } from '@/i18n/I18n';
import { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { measureFontText, PREVIEW_FONTS, PreviewFontId } from '@/utils/fontMetrics';
import { FontOptionPreview } from './RuntimeEventPanel';
import { getPaletteIndexZeroColor } from '@/utils/paletteTransparency';

interface Props {
  event: IScriptsElement;
  onValueChange: (eventId: string, args: any) => void;
}

export default function VariableTextEvent({ event, onValueChange }: Props) {
  const { t } = useI18n();
  const { variables: globalVariables, settings } = useAppContexts();
  const parameters = useScriptParameterVariables();
  const variables = { variables: [...parameters, ...globalVariables.variables].filter(isActiveProjectEntry) };
  const [fontSources, setFontSources] = useState<Record<string, string>>({});
  const [paletteColors, setPaletteColors] = useState<Record<string, string>>({});
  const [assetReloadVersion, setAssetReloadVersion] = useState(0);
  useEffect(() => {
    const reload = () => setAssetReloadVersion(version => version + 1);
    window.addEventListener('gba-studio:assets-reloaded', reload);
    return () => window.removeEventListener('gba-studio:assets-reloaded', reload);
  }, []);
  const args: any = event.args ?? {};
  const selectedFont = (['variable8x8', 'variable8x16', 'variable16x16'].includes(args.font) ? args.font : 'variable8x16') as PreviewFontId;
  const selectedVariable = variables.variables.find(variable => variable.id === args.variableId);
  const valuePreview = String(selectedVariable?.initialValue ?? '');
  const bounds = measureFontText(selectedFont, valuePreview);
  const maxX = Math.max(0, 240 - bounds.width);
  const maxY = Math.max(0, 160 - bounds.height);
  const clampPosition = (x: unknown, y: unknown) => ({
    x: Math.max(0, Math.min(maxX, Math.trunc(Number(x) || 0))),
    y: Math.max(0, Math.min(maxY, Math.trunc(Number(y) || 0))),
  });
  const update = (patch: Record<string, unknown>) => {
    const next = { ...args, ...patch };
    const font = (['variable8x8', 'variable8x16', 'variable16x16'].includes(String(next.font)) ? next.font : 'variable8x16') as PreviewFontId;
    const variable = variables.variables.find(item => item.id === next.variableId);
    const textBounds = measureFontText(font, String(variable?.initialValue ?? ''));
    const nextMaxX = Math.max(0, 240 - textBounds.width);
    const nextMaxY = Math.max(0, 160 - textBounds.height);
    if (typeof next.x !== 'object') next.x = Math.max(0, Math.min(Math.floor(nextMaxX / coordinateScale(next, 'x')), Math.trunc(Number(next.x) || 0)));
    if (typeof next.y !== 'object') next.y = Math.max(0, Math.min(Math.floor(nextMaxY / coordinateScale(next, 'y')), Math.trunc(Number(next.y) || 0)));
    onValueChange(event.id, next);
  };
  const variableOptions = groupedVariableOptions(variables.variables, t);
  useEffect(() => {
    void Promise.all([window.electronAPI.getCommonFontImages(), window.electronAPI.fetchImages('fonts')]).then(async ([images, fontsResponse]: [Record<string, string>, any]) => {
      const sources = { ...(images ?? {}) };
      const customByFont: Array<[PreviewFontId, string | null | undefined]> = [
        ['variable8x8', settings?.font8x8VariablesImage],
        ['variable8x16', settings?.font8x16VariablesImage],
        ['variable16x16', settings?.font16x16VariablesImage],
      ];
      if (fontsResponse?.status === 'success') {
        customByFont.forEach(([font, filename]) => {
          if (filename) sources[PREVIEW_FONTS[font].image] = `${fontsResponse.localPath}/${filename}`;
        });
      }
      setFontSources(sources);
      const colors = await Promise.all(Object.entries(sources).map(async ([name, source]) => [name, await getPaletteIndexZeroColor(source)] as const));
      setPaletteColors(Object.fromEntries(colors.filter(([, color]) => Boolean(color)) as Array<[string, string]>));
    }).catch(() => undefined);
  }, [settings?.font8x8VariablesImage, settings?.font8x16VariablesImage, settings?.font16x16VariablesImage, assetReloadVersion]);
  const fontOptions = (['variable8x8', 'variable8x16', 'variable16x16'] as PreviewFontId[]).map(font => ({
    value: font,
    label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32 }}><FontOptionPreview font={font} fontSources={fontSources} paletteColors={paletteColors} />{font === 'variable8x8' ? 'Font S Variables' : font === 'variable8x16' ? 'Font M Variables' : 'Font L Variables'}</span>,
  }));

  return <Form layout="vertical">
    <Form.Item label="Variable"><Select showSearch value={args.variableId || undefined} options={variableOptions} placeholder="Select variable" onChange={variableId => update({ variableId })} /></Form.Item>
    <Form.Item label="Font"><Select size="large" value={args.font ?? 'variable8x16'} options={fontOptions} onChange={font => update({ font })} /></Form.Item>
    <Form.Item label="Position"><CoordinateInputs args={args} onChange={update} min={[0, 0]} max={[maxX, maxY]} /></Form.Item>
  </Form>;
}

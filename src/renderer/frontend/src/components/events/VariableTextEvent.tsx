import React, { useEffect, useState } from 'react';
import { Form, Select, Space } from 'antd';
import useAppContexts from '@/providers/contexts/AppContexts';
import { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { PREVIEW_FONTS, PreviewFontId } from '@/utils/fontMetrics';
import StepInputNumber from '../StepInputNumber';
import { FontOptionPreview } from './RuntimeEventPanel';
import { getPaletteIndexZeroColor } from '@/utils/paletteTransparency';

interface Props {
  event: IScriptsElement;
  onValueChange: (eventId: string, args: any) => void;
}

export default function VariableTextEvent({ event, onValueChange }: Props) {
  const { variables, settings } = useAppContexts();
  const [fontSources, setFontSources] = useState<Record<string, string>>({});
  const [paletteColors, setPaletteColors] = useState<Record<string, string>>({});
  const args: any = event.args ?? {};
  const update = (patch: Record<string, unknown>) => onValueChange(event.id, { ...args, ...patch });
  const variableOptions = variables.variables.map(variable => ({ value: variable.id, label: variable.name || variable.symbol }));
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
  }, [settings?.font8x8VariablesImage, settings?.font8x16VariablesImage, settings?.font16x16VariablesImage]);
  const fontOptions = (['variable8x8', 'variable8x16', 'variable16x16'] as PreviewFontId[]).map(font => ({
    value: font,
    label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32 }}><FontOptionPreview font={font} fontSources={fontSources} paletteColors={paletteColors} />{font === 'variable8x8' ? 'Font S Variables' : font === 'variable8x16' ? 'Font M Variables' : 'Font L Variables'}</span>,
  }));

  return <Form layout="vertical">
    <Form.Item label="Variable"><Select showSearch value={args.variableId || undefined} options={variableOptions} placeholder="Select variable" onChange={variableId => update({ variableId })} /></Form.Item>
    <Form.Item label="Font"><Select size="large" value={args.font ?? 'variable8x16'} options={fontOptions} onChange={font => update({ font })} /></Form.Item>
    <Form.Item label="Position"><Space.Compact block><StepInputNumber addonBefore="X" min={0} value={Number(args.x ?? 0)} onChange={x => update({ x: x ?? 0 })} style={{ width: '50%' }} /><StepInputNumber addonBefore="Y" min={0} value={Number(args.y ?? 0)} onChange={y => update({ y: y ?? 0 })} style={{ width: '50%' }} /></Space.Compact></Form.Item>
  </Form>;
}

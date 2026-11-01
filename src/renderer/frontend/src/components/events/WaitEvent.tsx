import { IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { Button, Dropdown, Space, Tooltip, Typography } from "antd";
import NumericEventInput from '../NumericEventInput';
import { formatNumericValue } from '../../../../../shared/numericValues';
import { useEffect, useState } from "react";
import { useI18n } from '@/i18n/I18n';
import { AntdToken } from "../common/AntDToken";
import { IWait } from './interfaces/IWaiting';

interface WaitEventsProps {
  event: IScriptsElement | undefined;
  customTitle: (newTitle: string) => void;
  onValueChange: (eventId: string, eventArgs: IWait) => void;
}

export function WaitEvent({ event, customTitle, onValueChange }: WaitEventsProps) {
  const { token } = AntdToken();
  const { t } = useI18n();

  const [units, setUnits] = useState<string>("time");
  const [timeValue, setTimeValue] = useState<any>(1);
  const [framesValue, setFramesValue] = useState<any>(30);

  const args = event?.args as IWait;

  useEffect(() => {
    const initValue = WaitEvent.defaultValue();
    setUnits(args?.units === 'ticks' ? 'frames' : args?.units ?? initValue.units);
    setTimeValue(args?.time ?? initValue.time);
    setFramesValue(args?.frames ?? initValue.frames);

    if ((args?.units ?? initValue.units) === "time") {
      customTitle(` ${t('events.wait.titleTime', { value: formatNumericValue(args?.time ?? initValue.time) })}`);
    } else {
      customTitle(` ${t('events.wait.titleFrames', { value: formatNumericValue(args?.frames ?? initValue.frames) })}`);
    }
  }, [args, t]);


  const setTimeOrFramesValue = (value: any, unit?: string) => {
    if (!event?.id) return;

    if (unit ? unit === "time" : units === "time") {
      onValueChange(event?.id!, { ...event?.args, time: value?? timeValue, frames: framesValue, units: "time" });
    } else {
      onValueChange(event?.id!, { ...event?.args, time: timeValue, frames: value?? framesValue, units: 'frames' });
    }
  };

  const items = [
    {
      key: "time",
      label: t('events.bgAnimation.seconds'),
      onClick: () => { setTimeOrFramesValue(null, "time"); }
    },
    {
      key: "frames",
      label: t('events.wait.frames'),
      onClick: () => { setTimeOrFramesValue(null, "frames"); }
    },
  ];

  return (
    <Space direction="vertical" style={{ display: "flex" }}>
      <Typography.Text>
          {t('events.wait.duration')}
      </Typography.Text>
      <Space.Compact block>
        <Tooltip mouseEnterDelay={0.6} title={t('events.wait.unitsHelp')}><span style={{ display: 'inline-flex' }}><Dropdown menu={{ items }} trigger={['click']}>
          <Button aria-label={t('events.wait.unit')} style={{ backgroundColor: token.colorBgBase }}>{t(units === 'time' ? 'events.bgAnimation.seconds' : 'events.wait.frames')}</Button>
        </Dropdown></span></Tooltip>
        <Tooltip mouseEnterDelay={0.6} title={t(units === 'time' ? 'events.wait.secondsHelp' : 'events.wait.ticksHelp')}><div style={{ flex: 1, minWidth: 0 }}><NumericEventInput min={0} value={units === 'time' ? timeValue : framesValue} style={{ width: '100%' }} onChange={value => setTimeOrFramesValue(value)} /></div></Tooltip>
      </Space.Compact>
    </Space>
  );
}

WaitEvent.defaultValue = (): IWait => ({
  time: 1,
  frames: 30,
  units: "time", // seconds
});

WaitEvent.idle = (): String => "Wait until next frame";

export default WaitEvent;

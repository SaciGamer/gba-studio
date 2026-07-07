import { IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { Button, Dropdown, InputNumber, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { AntdToken } from "../common/AntDToken";
import { IWait } from './interfaces/IWaiting';

interface WaitEventsProps {
  event: IScriptsElement | undefined;
  customTitle: (newTitle: string) => void;
  onValueChange: (eventId: string, eventArgs: IWait) => void;
}

export function WaitEvent({ event, customTitle, onValueChange }: WaitEventsProps) {
  const { token } = AntdToken();

  const [units, setUnits] = useState<string>("time");
  const [timeValue, setTimeValue] = useState<number>(0.5);
  const [framesValue, setFramesValue] = useState<number>(30);

  const args = event?.args as IWait;

  useEffect(() => {
    const initValue = WaitEvent.defaultValue();
    setUnits(args?.units ?? initValue.units);
    setTimeValue(args?.time ?? initValue.time);
    setFramesValue(args?.frames ?? initValue.frames);

    if ((args?.units ?? initValue.units) === "time") {
      customTitle(` For ${args?.time ?? initValue.time} Seconds`);
    } else {
      customTitle(` For ${args?.frames ?? initValue.frames} Frames`);
    }
  }, [args]);


  const setTimeOrFramesValue = (value: number | null, unit?: string) => {
    if (!event?.id) return;

    if (unit ? unit === "time" : units === "time") {
      onValueChange(event?.id!, { ...event?.args, time: value?? timeValue, frames: framesValue, units: "time" });
    } else {
      onValueChange(event?.id!, { ...event?.args, time: timeValue, frames: value?? framesValue, units: "frames" });
    }
  };

  const items = [
    {
      key: "time",
      label: "Seconds",
      onClick: () => { setTimeOrFramesValue(null, "time"); }
    },
    {
      key: "frames",
      label: "Frames",
      onClick: () => { setTimeOrFramesValue(null, "frames"); }
    },
  ];

  return (
    <Space direction="vertical" style={{ display: "flex" }}>
      <Typography.Text>
          Duration
      </Typography.Text>
      <Space.Compact block>
        <Dropdown menu={{ items }} trigger={['click']}>
          <Button style={{ backgroundColor: token.colorBgBase }}>{units === "time" ? "seconds" : "frames"}</Button>
        </Dropdown>
        <InputNumber 
          min={0}
          step={units === "time" ? 0.1 : 1}
          precision={units === "time" ? 1 : 0}
          value={units === "time" ? timeValue : framesValue} 
          style={{ width: "100%" }}
          onChange={(e) => setTimeOrFramesValue(Number(e))}
        />
      </Space.Compact>
    </Space>
  );
}

WaitEvent.defaultValue = (): IWait => ({
  time: 0.5,
  frames: 30,
  units: "time", // seconds
});

WaitEvent.idle = (): String => "Wait until next frame";

export default WaitEvent;
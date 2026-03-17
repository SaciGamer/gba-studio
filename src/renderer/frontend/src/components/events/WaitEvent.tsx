import { IArgs, IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { Button, Dropdown, Form, Input, InputNumber, MenuProps, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { IWait } from './interfaces/IWaiting';
import { AntdToken } from "../common/AntDToken";

interface WaitEventsProps {
  event: IScriptsElement | undefined;
  customTitle: (newTitle: string) => void;
  onValueChange: (eventId: string, eventArgs: IArgs) => void;
}

export function WaitEvent({ event, customTitle, onValueChange }: WaitEventsProps) {
  const { token } = AntdToken();
  const [units, setUnits] = useState(event?.args?.units ?? "time");
  const timeValue = event?.args?.time ?? WaitEvent.defaultValue().time;
  const framesValue = event?.args?.frames ?? WaitEvent.defaultValue().frames;

  useEffect(() => {
    if (units === "time") {
      customTitle(` For ${timeValue} Seconds`);
    } else {
      customTitle(` For ${framesValue} Frames`);
    }
  }, [units, timeValue, framesValue, customTitle]);

  const setTimeOrFramesValue = (value: number | void) => {
    if (units === "time") {
      onValueChange(event?.id!, { ...event?.args, time: value?? timeValue,  frames: framesValue, units: "time" });
    } else {
      onValueChange(event?.id!, { ...event?.args, time: timeValue, frames: value?? framesValue, units: "frames" });
    }
  };

  const items = [
    {
      key: "time",
      label: "Seconds",
      onClick: () => { setUnits("time"); setTimeOrFramesValue(); }
    },
    {
      key: "frames",
      label: "Frames",
      onClick: () => setUnits("frames"),
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

WaitEvent.idle = (): String => ("Wait until next frame");

export default WaitEvent;
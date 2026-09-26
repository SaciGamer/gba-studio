import { InputNumber as AntInputNumber } from 'antd';
import { Space } from 'antd';
import React, { useEffect, useState } from 'react';

type StepInputNumberProps = React.ComponentProps<typeof AntInputNumber>;

/** InputNumber with a consistent fine/coarse increment across the editor. */
const StepInputNumber: React.FC<StepInputNumberProps> = ({ step, addonBefore, ...props }) => {
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const requestedStep = typeof step === 'number' ? step : Number(step);
  // Integer fields move one pixel/unit at a time. Preserve fractional fields
  // such as speed controls, with Ctrl providing the coarse x8 increment.
  const normalStep = Number.isFinite(requestedStep) && requestedStep > 0 && requestedStep < 1
    ? requestedStep
    : 1;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Control' && setCtrlPressed(true);
    const onKeyUp = (event: KeyboardEvent) => event.key === 'Control' && setCtrlPressed(false);
    const onBlur = () => setCtrlPressed(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const input = <AntInputNumber {...props} step={ctrlPressed ? normalStep * 8 : normalStep} />;
  return addonBefore ? <Space.Compact><span style={{ paddingInline: 8, display: 'inline-flex', alignItems: 'center' }}>{addonBefore}</span>{input}</Space.Compact> : input;
};

export default StepInputNumber;
export { StepInputNumber as InputNumber };

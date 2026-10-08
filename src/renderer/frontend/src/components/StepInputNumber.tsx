import { InputNumber as AntInputNumber } from 'antd';
import { Space } from 'antd';
import React, { useEffect, useState } from 'react';

type StepInputNumberProps = React.ComponentProps<typeof AntInputNumber>;

/** InputNumber with a consistent fine/coarse increment across the editor. */
const StepInputNumber: React.FC<StepInputNumberProps> = ({ step, addonBefore, className, style, ...props }) => {
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const requestedStep = typeof step === 'number' ? step : Number(step);
  // Preserve an explicit step for fields with domain-specific increments.
  // Otherwise use single-unit arrows. Ctrl is a consistent 8-unit step.
  const normalStep = Number.isFinite(requestedStep) && requestedStep > 0
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

  const input = <AntInputNumber
    {...props}
    className={className}
    style={addonBefore ? { flex: 1, minWidth: 0 } : style}
    step={ctrlPressed ? 8 : normalStep}
  />;
  return addonBefore ? <Space.Compact style={style}><Space.Addon>{addonBefore}</Space.Addon>{input}</Space.Compact> : input;
};

export default StepInputNumber;
export { StepInputNumber as InputNumber };

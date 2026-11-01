import { Radio, type RadioGroupProps } from 'antd';
import './DirectionRadioGroup.css';

export default function DirectionRadioGroup({ children, className, style, ...props }: RadioGroupProps) {
  return <div className="direction-control" style={{ containerType: 'inline-size', width: '100%', minWidth: 0, flex: 1 }}>
    <Radio.Group {...props} className={`direction-radio-group ${className ?? ''}`} style={{ display: 'flex', flexWrap: 'nowrap', width: 'fit-content', maxWidth: '100%', ...style }}>{children}</Radio.Group>
  </div>;
}

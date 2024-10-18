import React, { CSSProperties, useState } from 'react';
import { AppstoreAddOutlined, ClearOutlined, EditOutlined, FormatPainterOutlined, InsertRowAboveOutlined } from '@ant-design/icons';
import { FloatButton, ConfigProviderProps } from 'antd';

type SizeType = ConfigProviderProps['componentSize'];

const FloatButttonsGW: React.FC = () => {
  const [size, setSize] = useState<SizeType>('large'); // default is 'middle'

  const style: CSSProperties = {
    position: 'absolute',
    insetBlockStart: '15px', // Alinha ao topo do contêiner
    insetInlineStart: '15px', // Alinha à esquerda do contêiner
    width: '40px',
    height: '200px'
  };


  return (
    <>
    <FloatButton.Group
      shape="square"
      style={style}
    >
      <FloatButton className='dark-mode' tooltip={<div>Select (v)</div>} icon={<EditOutlined />}/>      
      <FloatButton className='dark-mode' tooltip={<div>Add (a)</div>} icon={<AppstoreAddOutlined />} />
      <FloatButton className='dark-mode' tooltip={<div>Eraser (e)</div>} icon={<ClearOutlined />} />
      <FloatButton className='dark-mode' tooltip={<div>Collisions (c)</div>} icon={<InsertRowAboveOutlined />} />
      <FloatButton className='dark-mode' tooltip={<div>Colorize (Z)</div>} icon={<FormatPainterOutlined />} />
    </FloatButton.Group>
  </>
)
};

export default FloatButttonsGW;
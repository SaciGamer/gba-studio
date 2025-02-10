import React from 'react';

import FlexibleGrid from './FlexibleGrid.tsx';
import { useZoomContext } from './ZoomContext.tsx';
import { useBlockContext } from './BlockContext.tsx';
import FloatButttonsGW from './FloatButtonsGW.tsx';

import { Flex, Splitter, Typography, Layout } from 'antd';

const { Header, Sider, Content } = Layout;

interface CentralEditorProps {
  selectedBlockId: number | null;
}

const CentralEditor: React.FC<CentralEditorProps> = ({ selectedBlockId }) => {
  const { zoomLevel } = useZoomContext();
  const { blocks, setBlocks } = useBlockContext();

  return (
    <Content>
      {/* <Sider>
        <FloatButttonsGW />
      </Sider> */}
      <Content style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left', width: '100%', height: '100%', background: 'green' }}>
        <FlexibleGrid blocks={blocks} setBlocks={setBlocks} selectedBlockId={selectedBlockId}/>
      </Content>
    </Content>
  );
};

export default CentralEditor;
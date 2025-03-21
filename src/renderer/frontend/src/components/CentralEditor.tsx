import React, { useEffect, useMemo } from 'react';

import FlexibleGrid from './FlexibleGrid';
import { useZoomContext } from './ZoomContext';
import { useBlockContext } from './BlockContext';

import { Layout } from 'antd';

const { Content } = Layout;

interface CentralEditorProps {
  selectedBlockId: number | null;
}

const CentralEditor: React.FC<CentralEditorProps> = ({ selectedBlockId }) => {
  const { zoomLevel } = useZoomContext();
  const { blocks, updateBlock } = useBlockContext();

  // Convert blocks object to array for FlexibleGrid
  const blocksArray = useMemo(() => {
    return Object.values(blocks);
  }, [blocks]);

  // Monitor blocks changes
  useEffect(() => {
    if (blocksArray.length > 0) {
      console.log('Blocks updated:', blocksArray);
    }
  }, [blocksArray]);

  // Handle block updates from FlexibleGrid
  const handleBlocksUpdate = (updatedBlocks: typeof blocksArray) => {
    updatedBlocks.forEach(block => {
      updateBlock(block.id, block);
    });
  };

  return (
    <Content>
      <Content style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left', width: '100%', height: '100%', background: 'green' }}>
        <FlexibleGrid blocks={blocksArray} setBlocks={handleBlocksUpdate} selectedBlockId={selectedBlockId}/>
      </Content>
    </Content>
  );
};

export default CentralEditor;
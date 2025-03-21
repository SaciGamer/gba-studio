import React, { useState } from 'react';
import { Layout, Input, Space, Divider } from 'antd';
import { BackgroundSelector } from './BackgroundSelector';
import { useBlockContext } from './BlockContext';
import { theme } from 'antd';
import Title from 'antd/es/typography/Title';
import RightPanelGWSettings from './RightPanelGWSettings';

const { useToken } = theme;
const { Content } = Layout;

interface IRightPanelProps {
  selectedBlockId: number | null;
  controllerView: any;
}

const RightPanel: React.FC<IRightPanelProps> = ({ selectedBlockId, controllerView }) => {
  const { token } = useToken();
  const { blocks, updateBlock } = useBlockContext();
  const selectedBlock = selectedBlockId ? blocks[selectedBlockId] : null;

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState(selectedBlock ? selectedBlock.title : '');

  const handleBackgroundChange = (backgroundData: { preview: string, file: File }) => {
    if (selectedBlockId && selectedBlock) {
      updateBlock(selectedBlockId, {
        ...selectedBlock,
        background: backgroundData.preview,
        backgroundFile: backgroundData.file
      });
    }
  };

  if (!selectedBlock) {
    return (
      <Content style={{ padding: token.padding }}>
        <RightPanelGWSettings controllerView={controllerView}/>
      </Content>
    );
  }

  const handleTitleClick = () => {
    setIsEditingTitle(true);
    setNewTitle(selectedBlock?.title || '');
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewTitle(e.target.value);
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (selectedBlock) {
      const updatedBlock = { ...selectedBlock, title: newTitle };
      updateBlock(selectedBlockId!, updatedBlock);
    }
  };

  const sceneTypes = ['Top Down', 'Platformer', 'Adventure', 'Shoot Em\'Up', 'Point Click', 'Logo'];

  return (
    <Content style={{ padding: 10 }}>
      <Space direction="vertical" style={{ width: '100%', zIndex: 50 }}>
        {isEditingTitle ? (
          <Input
            autoFocus
            value={newTitle}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            onPressEnter={handleTitleBlur}
          />
        ) : (
          <Title level={5} onClick={handleTitleClick} style={{ margin: 0, cursor: 'pointer' }}>
            {selectedBlock.title}
          </Title>
        )}
        <Divider style={{ margin: `${token.margin}px 0` }} />
        <BackgroundSelector
          initialBackground={selectedBlock.background}
          onBackgroundChange={handleBackgroundChange}
        />
      </Space>
    </Content>
  );
};

export default RightPanel;

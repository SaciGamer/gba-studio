import React, { useState } from 'react';
import { Select, Input, Divider, Typography } from 'antd';
import { useBlockContext } from './BlockContext.tsx'; 
import { Content } from 'antd/es/layout/layout';
import Paragraph from 'antd/es/typography/Paragraph';
import { AntdToken } from './common/AntDToken.ts';

interface RightPanelProps {
  selectedBlockId: number | null;
}

const RightPanel: React.FC<RightPanelProps> = ({ selectedBlockId }) => {
  const { blocks, setBlocks } = useBlockContext();
  const selectedBlock = blocks.find(block => block.id === selectedBlockId);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState(selectedBlock ? selectedBlock.title : '');
  const { token } = AntdToken();

  const handleTitleClick = () => {
    setIsEditingTitle(true);
    setNewTitle(selectedBlock?.title || '');
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("..: teste mudança: %s", e.target.value);
    setNewTitle(e.target.value);
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (selectedBlock) {
      const updatedBlocks = blocks.map(block => 
        block.id === selectedBlockId ? { ...block, title: newTitle } : block
      );
      setBlocks(updatedBlocks);
    }
  };

  const sceneTypes = ['Top Down', 'Platformer', 'Adventure', 'Shoot Em\'Up', 'Point Click', 'Logo'];

  return (
    <Content className="p-4">
      {selectedBlock ? (
        <div>
        {/* <Paragraph
          editable={{
            tooltip: 'click to edit text',
            // onChange: (string => handleTitleChange),
            triggerType: ['text'],
            icon: null
            // enterIcon: null,
          }}
        >
            {newTitle}
        </Paragraph> */}
          {isEditingTitle ? (
            <Input
              autoFocus
              value={newTitle}
              onChange={handleTitleChange}
              onBlur={handleTitleBlur}
              onPressEnter={handleTitleBlur}
            />
          ) : (
            <Typography.Title level={5} style={{ margin: 0 }} onClick={handleTitleClick} >
              {selectedBlock.title}
            </Typography.Title>
          )}
          <Divider className="my-4"/>
          <div className="mb-4">
            <label className="block text-sm font-medium">Tipo</label>
            <Select defaultValue={sceneTypes[0]} style={{ width: '100%' }}>
              {sceneTypes.map(type => (
                <Select.Option key={type} value={type}>{type}</Select.Option>
              ))}
            </Select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium">Background</label>
            <Input style={{ height: '140px' }} type="file" accept="image/*" />
          </div>
          <Divider className="my-4"/>
        </div>
      ) : (
        <div>
          <h2 className="font-bold mb-2">Selecione um elemento para ver suas propriedades</h2>
        </div>
      )}
    </Content>
  );
};

export default RightPanel;

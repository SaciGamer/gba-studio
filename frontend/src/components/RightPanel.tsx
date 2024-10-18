import React, { useState } from 'react';
import { Select, Input, Divider } from 'antd';
import { useBlockContext } from './BlockContext.tsx'; 

interface RightPanelProps {
  selectedBlockId: number | null;
}

const RightPanel: React.FC<RightPanelProps> = ({ selectedBlockId }) => {
  const { blocks, setBlocks } = useBlockContext();
  const selectedBlock = blocks.find(block => block.id === selectedBlockId);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState(selectedBlock ? selectedBlock.title : '');

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
      const updatedBlocks = blocks.map(block => 
        block.id === selectedBlockId ? { ...block, title: newTitle } : block
      );
      setBlocks(updatedBlocks);
    }
  };

  const sceneTypes = ['Top Down', 'Platformer', 'Adventure', 'Shoot Em\'Up', 'Point Click', 'Logo'];

  return (
    <div className="dark-mode p-4">
      {selectedBlock ? (
        <div>
          {isEditingTitle ? (
            <Input
              autoFocus
              value={newTitle}
              onChange={handleTitleChange}
              onBlur={handleTitleBlur}
              onPressEnter={handleTitleBlur}
            />
          ) : (
            <h2 className="font-bold mb-2 highlight editable-element" onClick={handleTitleClick}>
              {selectedBlock.title}
            </h2>
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
    </div>
  );
};

export default RightPanel;

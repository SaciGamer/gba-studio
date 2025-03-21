import React from 'react';

import type { DropResult } from '@hello-pangea/dnd';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Space } from 'antd';
import { Content } from 'antd/es/layout/layout';

interface Block {
  id: number;
  title: string;
  content: [];
  sceneId: number;
}

interface FlexibleGridProps {
  blocks: Block[];
  setBlocks: (blocks: Block[]) => void;
  selectedBlockId: number | null;
}

const FlexibleGrid: React.FC<FlexibleGridProps> = ({ blocks = [], setBlocks, selectedBlockId }) => {
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const newBlocks = Array.from(blocks);
    const [reorderedItem] = newBlocks.splice(result.source.index, 1);
    newBlocks.splice(result.destination.index, 0, reorderedItem);

    setBlocks(newBlocks);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="blocks">
        {(provided) => (
          <Space {...provided.droppableProps} ref={provided.innerRef} className="ml-12 grid grid-cols-3 gap-4 p-4">
            {blocks.map((block, index) => (
              <Draggable key={block.id} draggableId={block.id.toString()} index={index}>
                {(provided) => (
                  <Content ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={`p-4 rounded shadow ${selectedBlockId === block.id ? 'bg-blue-300' : 'bg-gray-800'}`}>
                    {block.title}
                  </Content>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </Space>
        )}
      </Droppable>
    </DragDropContext>
  );
};

export default FlexibleGrid;

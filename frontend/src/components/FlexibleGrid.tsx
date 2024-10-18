import { Color } from 'antd/es/color-picker';
import React from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import type { DropResult } from 'react-beautiful-dnd';

interface Block {
  id: number;
  title: string;
  content: [];
  sceneId: number;
}

interface FlexibleGridProps {
  blocks: Block[];
  setBlocks: React.Dispatch<React.SetStateAction<Block[]>>;
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
          <div {...provided.droppableProps} ref={provided.innerRef} className="ml-12 grid grid-cols-3 gap-4 p-4">
            {blocks.map((block, index) => (
              <Draggable key={block.id} draggableId={block.id.toString()} index={index}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={`p-4 rounded shadow ${selectedBlockId === block.id ? 'bg-blue-300' : 'dark-mode'}`}>
                    {block.title}
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

export default FlexibleGrid;

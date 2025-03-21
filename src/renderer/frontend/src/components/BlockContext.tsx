import React, { createContext, useState, useContext, ReactNode } from 'react';

interface Block {
  id: number;
  title: string,
  content: any;
  sceneId: number;
  background?: string;
  backgroundFile?: File;
}

interface BlockContextType {
  blocks: Record<string, Block>;
  addBlock: (block: Block) => void;
  updateBlock: (id: number, block: Partial<Block>) => void;
  removeBlock: (id: string) => void;
}

const BlockContext = createContext<BlockContextType | undefined>(undefined);

interface BlockProviderProps {
  children: ReactNode;
}

export const BlockProvider: React.FC<BlockProviderProps> = ({ children }) => {
  const [blocks, setBlocks] = useState<Record<string, Block>>({});

  // const addBlockToGrid = (sceneId: number, blockTitle: string) => {
  //   const newBlock: Block = { id: blocks.length + 1, title: blockTitle, content: [], sceneId };
  //   setBlocks([...blocks, newBlock]);
  // };

  const addBlock = (block: Block) => {
    const numericKeys = Object.keys(blocks).map(key => parseInt(key));
    let lastId = 0;
    if (numericKeys.length === 0) {
      lastId = 1;
      console.log("..: NO ID: ", lastId);
    } else {
      lastId = Math.max(...numericKeys) + 1;
      console.log("..: MAX ID: ", lastId);
    }

    block.id = lastId;
    block.title = block.title + " " + lastId;
    
    setBlocks(prev => ({
      ...prev,
      [block.id]: block
    }));
  };

  const updateBlock = (id: number, updates: Partial<Block>) => {
    setBlocks(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...updates
      }
    }));
  };

  const removeBlock = (id: string) => {
    setBlocks(prev => {
      const newBlocks = { ...prev };
      delete newBlocks[id];
      return newBlocks;
    });
  };

  return (
    <BlockContext.Provider value={{ 
      blocks, 
      addBlock, 
      updateBlock, 
      removeBlock 
    }}>
      {children}
    </BlockContext.Provider>
  );
};

export const useBlockContext = () => {
  const context = useContext(BlockContext);
  if (!context) {
    throw new Error('useBlockContext must be used within a BlockProvider');
  }
  return context;
};

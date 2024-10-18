import React, { createContext, useState, useContext, ReactNode } from 'react';

interface Block {
  id: number;
  title: string,
  content: any;
  sceneId: number;
}

interface BlockContextType {
  blocks: Block[];
  addBlockToGrid: (sceneId: number, blockTitle: string) => void;
  setBlocks: React.Dispatch<React.SetStateAction<Block[]>>;
}

const BlockContext = createContext<BlockContextType | undefined>(undefined);

interface BlockProviderProps {
  children: ReactNode;
}

export const BlockProvider: React.FC<BlockProviderProps> = ({ children }) => {
  const [blocks, setBlocks] = useState<Block[]>([
    { id: 1, title: 'Item A', content: [], sceneId: 1 },
    { id: 2, title: 'Item B', content: [], sceneId: 2 },
    { id: 3, title: 'Item C', content: [], sceneId: 3 },
  ]);

  const addBlockToGrid = (sceneId: number, blockTitle: string) => {
    const newBlock: Block = { id: blocks.length + 1, title: blockTitle, content: [], sceneId };
    setBlocks([...blocks, newBlock]);
  };

  return (
    <BlockContext.Provider value={{ blocks, addBlockToGrid, setBlocks }}>
      {children}
    </BlockContext.Provider>
  );
};

export const useBlockContext = () => {
  const context = useContext(BlockContext);
  if (context === undefined) {
    throw new Error('useBlockContext must be used within a BlockProvider');
  }
  return context;
};

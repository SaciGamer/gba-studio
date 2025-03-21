import React, { useState } from 'react';

interface Scene {
  id: number;
  name: string;
}

interface SceneManagerProps {
  addBlockToGrid: (sceneId: number, blockContent: string) => void;
}

const SceneManager: React.FC<SceneManagerProps> = ({ addBlockToGrid }) => {
  const [scenes, setScenes] = useState<Scene[]>([]);

  const addScene = () => {
    const newScene = { id: scenes.length + 1, name: `Scene ${scenes.length + 1}` };
    setScenes([...scenes, newScene]);
    addBlockToGrid(newScene.id, `New Block Scene ${newScene.id}`); // Adiciona um bloco novo ao grid central
  };

  return (
    <div>
      
    </div>
  );
};

export default SceneManager;
// Esta com erro

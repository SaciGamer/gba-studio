import React, { useState } from 'react';
import { Layout, Input, Space, Divider, Select } from 'antd';
import { BackgroundSelector } from './BackgroundSelector';
import { theme } from 'antd';
import Title from 'antd/es/typography/Title';
import RightPanelGWSettings from './RightPanelGWSettings';
import { useElementContext, useSceneContext } from '@/providers/contexts/AppContexts';

const { useToken } = theme;
const { Content } = Layout;

interface IRightPanelProps {
  controllerView: any;
}

const RightPanel: React.FC<IRightPanelProps> = ({ controllerView }) => {
  const { token } = useToken();
  const { scenes, setScenes, ignoredFields } = useSceneContext();
  const { elementSelected, setElementSelected } = useElementContext();

  const [isEditingTitle, setIsEditingTitle ] = useState(false);

  const handleBackgroundChange = (backgroundData: { preview: string, file: File }) => {
    if (elementSelected) {
      elementSelected.background = backgroundData.preview;
      console.log(`..: RightPanel background file ${backgroundData.file}`);
    }
  };

  if (!elementSelected) {
    return (
      <Content style={{ padding: token.padding }}>
        <RightPanelGWSettings controllerView={controllerView}/>
      </Content>
    );
  }

  const handleTitleClick = () => {
    setIsEditingTitle(true);
    // setNewTitle(elementSelected?.name || '');

  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (elementSelected) {
      const sceneToUpdate = scenes.find(scene => scene.id === elementSelected.id);
      console.log('..: RightPanel sceneToUpdate:', sceneToUpdate);

      const updatedElement = { ...sceneToUpdate, name: e.target.value? e.target.value : `SCENE_${sceneToUpdate?._index}` };
      setElementSelected(updatedElement);
      console.log('..: RightPanel updated element:', elementSelected);

      setScenes(prevScenes => prevScenes.map(scene => 
        scene.id === updatedElement.id 
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      ));
      console.log('..: RightPanel updated array:', scenes)
      // window.electronAPI.updateSettings('scene', updatedElement);
    }
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
  };

  const sceneTypes = ['Top Down', 'Platformer', 'Adventure', 'Shoot Em\'Up', 'Point Click', 'Logo'];

  return (
    <Content style={{ padding: 10 }}>
      <Space direction="vertical" style={{ width: '100%', zIndex: 50 }}>
        {isEditingTitle ? (
          <Input
            autoFocus
            value={elementSelected.name}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            onPressEnter={handleTitleBlur}
          />
        ) : (
          <Title level={5} onClick={handleTitleClick} style={{ margin: 0, cursor: 'pointer' }}>
            {elementSelected.name}
          </Title>
        )}
        <Divider style={{ margin: `${token.margin}px 0` }} />
        {/* <Form.Item name="startSceneId" label="Starting Scene" style={{ flex: 1, textAlign: 'center' }}> */}
        {/* TODO lista de imagens para escolher */}
        {/* </Form.Item> */}
        <BackgroundSelector
          selectedElementId={elementSelected.id}
          selectedBackgroundId={elementSelected.backgroundId}
          onBackgroundChange={handleBackgroundChange}
        />
      </Space>
    </Content>
  );
};

export default RightPanel;

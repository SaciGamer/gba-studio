import useAppContexts from "@/providers/contexts/AppContexts";
import { IArgs, ISceneSettings, IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { Collapse, Layout } from "antd";
import { useState } from "react";
import { EEvents, EVENT_INFO } from "./interfaces/IEvents";
import MenuEventItem from "./MenuEventItem";
import PanelEvents from "./PanelEvents";

const { Panel } = Collapse;

interface CollapseEventProps {
  scripts: IScriptsElement[] | undefined;
}

const getEventEnum = (command: string): string => {
  const eventEnum = Object.values(EEvents).find(eventId => eventId === command);
  
  return EVENT_INFO[eventEnum as keyof typeof EVENT_INFO].name;
}

export default function CollapseEventManager(parameters: CollapseEventProps) {
  // const {setScenes} = useSceneContext();
  // const {elementSelected, setElementSelected} = useElementContext();

  const { setScenes, elementSelected, setElementSelected } = useAppContexts();
  const [headerPanel, setHeaderPanel] = useState<Record<string, string>>({});

  const onRemoveScriptEvent = (id: string) => {
    // Atualiza estado removendo o id
    const updatedElement = { 
      ...elementSelected,  
      script: elementSelected.script?.filter((s: any) => s.id !== id) || [],
      playerHit1Script: elementSelected.playerHit1Script?.filter((s: any) => s.id !== id) || [],
      playerHit2Script: elementSelected.playerHit2Script?.filter((s: any) => s.id !== id) || [],
      playerHit3Script: elementSelected.playerHit3Script?.filter((s: any) => s.id !== id) || [],
    };

    setElementSelected(updatedElement);

    setScenes(prevScenes =>
      prevScenes.map(scene =>
        scene.id === elementSelected.id
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      )
    );
  };

  const toggleDisableScript = (id: string) => {
    setElementSelected((prev: ISceneSettings) => ({
      ...prev,
      script: prev.script?.map((s: IScriptsElement) =>
        s.id === id
          ? { ...s, args: { ...s.args, __comment: !(s.args?.__comment), __collapse: false } }
          : s
      ),
    }));

    setScenes((prevScenes: any) =>
      prevScenes.map((scene: ISceneSettings) => {
        if (scene.id !== elementSelected.id) return scene;

        const updatedScripts = scene.script?.map(s =>
          s.id === id
            ? {
                ...s,
                args: { ...s.args, __comment: !(s.args?.__comment), __collapse: false },
              }
            : s
        );

        return { ...scene, script: updatedScripts, _saved: false };
      })
    );
    
  };

  const onCollapseChange = (keys: string[] | string) => {
    setElementSelected((prev: ISceneSettings) => ({
      ...prev,
      script: prev.script?.map(s => ({
        ...s,
        args: { 
          ...s.args, 
          __collapse: Array.isArray(keys) ? keys.includes(s.id) : keys === s.id 
        }
      })),
    }));

    setScenes(prevScenes =>
      prevScenes.map(scene => {
        if (scene.id !== elementSelected.id) return scene;

        const updatedScripts = scene.script?.map(s => ({
          ...s,
          args: { 
            ...s.args, 
            __collapse: Array.isArray(keys) ? keys.includes(s.id) : keys === s.id 
          }
        }));

        return { ...scene, script: updatedScripts, _saved: false };
      })
    );
  };

  const handleValueChange = (eventId: string, newArgs: IArgs) => {
    const updateElement = {
      ...elementSelected,
      script: elementSelected.script?.map((s: IScriptsElement) =>
        s.id === eventId
          ? { ...s, args: newArgs }
          : s
      ),
    };

    setElementSelected(updateElement);

    setScenes(prevScenes =>
      prevScenes.map(scene =>
        scene.id === elementSelected.id
          ? { ...scene, ...updateElement, _saved: false }
          : scene
        )
    );
  }

	return (
    <Layout>
      <Collapse 
        activeKey={parameters.scripts?.filter(s => s.args?.__collapse).map(s => s.id)} 
        onChange={onCollapseChange} 
        style={{ borderRadius: 0 }}
        size="small"
      >
        {parameters.scripts?.map((script) => {
          const isDisabled = script.args?.__comment === true;
          const baseHeader = getEventEnum(script.command);

          const handleValueTitle = (newTitle: string) => {
            setHeaderPanel(prev => ({
              ...prev,
              [script.id]: baseHeader + newTitle
            }));
          };

          return (
            <Panel 
              key={script.id} 
              header={ isDisabled ? `// ${headerPanel[script.id] || baseHeader}` : headerPanel[script.id] || baseHeader} 
              extra={ <MenuEventItem event={script} onRemove={onRemoveScriptEvent} onToggleDisable={toggleDisableScript}/> } 
              collapsible={ isDisabled ? "disabled" : "header" }
              style={{
                borderRadius: 0,
                backgroundColor: isDisabled ? "#74b54c" : "transparent",
              }}
            >
              <PanelEvents event={script} customTitle={handleValueTitle} onValueChange={handleValueChange}/>
            </Panel>
          )
        })}
      </Collapse>
    </Layout>
  );
}
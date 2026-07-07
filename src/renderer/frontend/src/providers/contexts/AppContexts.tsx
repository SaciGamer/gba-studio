import { useContext } from "react";
import { BackgroundContext, ElementContext, ProjectContext, SceneContext, SettingsContext, SettingsUtilsContext, UserSettingsContext } from "../Providers";

const useSettingsUtilsContext = () =>  {
    const context = useContext(SettingsUtilsContext);
    if (!context) {
        throw new Error('useSettingsUtilsContext must be used within an SettingsUtilsProvider');
    }
    return context;
}

const useProjectContext = () =>  {
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error('useProjectContext must be used within an ProjectProvider');
    }
    return context;
}

const useSettingsContext = () =>  {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettingsContext must be used within an SettingsProvider');
    }
    return context;
}

const useUserSettingsContext = () =>  {
    const context = useContext(UserSettingsContext);
    if (!context) {
        throw new Error('useUserSettingsContext must be used within an UserSettingsProvider');
    }
    return context;
}

const useSceneContext = () => {
    const context = useContext(SceneContext);
    if (!context) {
        throw new Error('useSceneContext must be used within a SceneProvider');
    }
    return context;
};

const useElementContext = () => {
    const context = useContext(ElementContext);
    if (!context) {
        throw new Error('useElementContext must be used within an ElementProvider');
    }
    return context;
};

const useBackgroundContext = () =>  {
    const context = useContext(BackgroundContext);
    if (!context) {
        throw new Error('useImageContext must be used within an BackgroundProvider');
    }
    return context;
}

export const useAppContexts = () => {
  const sceneCtx = useSceneContext();
  const projectCtx = useProjectContext();
  const settingsCtx = useSettingsContext();
  const userSettingsCtx = useUserSettingsContext();
  const backgroundCtx = useBackgroundContext();
  const settingUtilsCtx = useSettingsUtilsContext();
  const elementCtx = useElementContext();

  return {
    scenes: sceneCtx.scenes,
    setScenes: sceneCtx.setScenes,
    scenesRef: sceneCtx.scenesRef,
    ignoredFieldsScenes: sceneCtx.ignoredFields,

    project: projectCtx.project,
    setProject: projectCtx.setProject,
    projectRef: projectCtx.projectRef,
    ignoredFieldsProject: projectCtx.ignoredFields,

    settings: settingsCtx.settings,
    setSettings: settingsCtx.setSettings,
    settingsRef: settingsCtx.settingsRef,
    ignoredFieldsSettings: settingsCtx.ignoredFields,

    userSettings: userSettingsCtx.userSettings,
    setUserSettings: userSettingsCtx.setUserSettings,
    userSettingsRef: userSettingsCtx.userSettingsRef,
    ignoredFieldsUserSettings: userSettingsCtx.ignoredFields,

    backgrounds: backgroundCtx.backgrounds,
    setBackgrounds: backgroundCtx.setBackgrounds,
    backgroundsRef: backgroundCtx.backgroundsRef,
    ignoredFieldsBackgrounds: backgroundCtx.ignoredFields,

    settingUtils: settingUtilsCtx.settingUtils,
    setSettingUtils: settingUtilsCtx.setSettingUtils,
    settingUtilsRef: settingUtilsCtx.settingUtilsRef,
    
    elementSelected: elementCtx.elementSelected,
    setElementSelected: elementCtx.setElementSelected,
    elementSelectedRef: elementCtx.elementSelectedRef,
    ignoredFieldsElement: elementCtx.ignoredFields,

  };
};

export default useAppContexts;
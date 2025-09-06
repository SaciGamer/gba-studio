import { useContext } from "react";
import { BackgroundContext, ElementContext, ProjectContext, SceneContext, SettingsContext, SettingsUtilsContext } from "../Providers";

export const useSettingsUtilsContext = () =>  {
    const context = useContext(SettingsUtilsContext);
    if (!context) {
        throw new Error('useSettingsUtilsContext must be used within an SettingsUtilsProvider');
    }
    return context;
}

export const useProjectContext = () =>  {
    const context = useContext(ProjectContext);
    if (!context) {
        throw new Error('useProjectContext must be used within an ProjectProvider');
    }
    return context;
}

export const useSettingsContext = () =>  {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettingsContext must be used within an SettingsProvider');
    }
    return context;
}

export const useSceneContext = () => {
    const context = useContext(SceneContext);
    if (!context) {
        throw new Error('useSceneContext must be used within a SceneProvider');
    }
    return context;
};

export const useElementContext = () => {
    const context = useContext(ElementContext);
    if (!context) {
        throw new Error('useElementContext must be used within an ElementProvider');
    }
    return context;
};

export const useBackgroundContext = () =>  {
    const context = useContext(BackgroundContext);
    if (!context) {
        throw new Error('useImageContext must be used within an BackgroundProvider');
    }
    return context;
}
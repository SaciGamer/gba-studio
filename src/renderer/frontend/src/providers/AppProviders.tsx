import { ComponentType, ReactNode } from 'react';
import { ElementProvider, BackgroundProvider, ProjectProvider, SceneProvider, SettingsProvider, SettingsUtilsProvider } from "./Providers";

const composeProviders = (...providers: ComponentType<{ children: ReactNode }>[]) => {
    return ({ children }: { children: ReactNode }) => 
        providers.reduceRight((acc, Provider) => <Provider>{acc}</Provider>, children);
}

const AppProvider = composeProviders(
    SettingsUtilsProvider, 
    ProjectProvider, 
    SettingsProvider, 
    BackgroundProvider,
    ElementProvider,
    SceneProvider,
);

export default AppProvider; 
import { ComponentType, ReactNode } from 'react';
import { BuildStateProvider } from './BuildStateProvider';
import { BackgroundProvider, ElementProvider, ProjectProvider, SceneProvider, SettingsProvider, SettingsUtilsProvider, UserSettingsProvider } from "./Providers";

const composeProviders = (...providers: ComponentType<{ children: ReactNode }>[]) => {
    return ({ children }: { children: ReactNode }) => 
        providers.reduceRight((acc, Provider) => <Provider>{acc}</Provider>, children);
}

const AppProvider = composeProviders(
    BuildStateProvider, // BuildStateProvider is placed early so UI can read building/running state
    SettingsUtilsProvider,
    UserSettingsProvider,
    ProjectProvider,
    SettingsProvider, 
    BackgroundProvider,
    ElementProvider,
    SceneProvider,
);

export default AppProvider; 
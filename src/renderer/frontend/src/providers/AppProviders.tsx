import { ComponentType, ReactNode } from 'react';
import { ElementProvider, BackgroundProvider, ProjectProvider, SceneProvider, SettingsProvider, SettingsUtilsProvider } from "./Providers";
import { BuildStateProvider } from './BuildStateProvider';

const composeProviders = (...providers: ComponentType<{ children: ReactNode }>[]) => {
    return ({ children }: { children: ReactNode }) => 
        providers.reduceRight((acc, Provider) => <Provider>{acc}</Provider>, children);
}

const AppProvider = composeProviders(
    SettingsUtilsProvider,
    BuildStateProvider,
    // BuildStateProvider is placed early so UI can read building/running state
    ProjectProvider,
    SettingsProvider, 
    BackgroundProvider,
    ElementProvider,
    SceneProvider,
);

export default AppProvider; 
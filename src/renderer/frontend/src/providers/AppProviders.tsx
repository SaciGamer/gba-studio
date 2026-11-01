import { ComponentType, ReactNode } from 'react';
import { BuildStateProvider } from './BuildStateProvider';
import { HistoryProvider } from './HistoryProvider';
import { BackgroundProvider, ElementProvider, PalettesProvider, PrefabsProvider, ProjectProvider, SceneProvider, ScriptsProvider, SettingsProvider, SettingsUtilsProvider, SpriteProvider, UserSettingsProvider, VariablesProvider } from "./Providers";

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
    SpriteProvider,
    ScriptsProvider,
    PalettesProvider,
    PrefabsProvider,
    VariablesProvider,
    ElementProvider,
    SceneProvider,
    HistoryProvider,
);

export default AppProvider; 

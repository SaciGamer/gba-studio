import { ReactNode, useState, createContext, Dispatch, SetStateAction, useRef } from "react";
import { ISceneSettings } from "./contexts/interfaces/ISceneElement";
import { IBackgroundSettings } from "./contexts/interfaces/IBackgroundElement";
import { IProjectSettings } from "./contexts/interfaces/IProjectElement";
import { IMainSettings } from "./contexts/interfaces/ISettingElement";
import { ISettingUtils } from "./contexts/interfaces/ISettingUtils";
import { IUserSettings } from "./contexts/interfaces/IUserSettings";
import { IVariablesSettings } from "./contexts/interfaces/IVariablesElement";
import { ISpriteSettings } from './contexts/interfaces/ISpriteElement';
import { IScriptsSettings } from './contexts/interfaces/IScriptElement';
import { IPalettesSettings } from './contexts/interfaces/IPalettesElement';

// Criar os providers com nomes personalizados
export const { Context: SettingsUtilsContext, Provider: SettingsUtilsProvider } = createProvider<ISettingUtils>(
    {} as ISettingUtils,
    { valueName: "settingUtils", setValueName: "setSettingUtils", ignoredFields: ["_saved"] }
);

export const { Context: ProjectContext, Provider: ProjectProvider } = createProvider<IProjectSettings | null>(
    null, 
    { valueName: "project", setValueName: "setProject",  ignoredFields: ["_saved"] }
);

export const { Context: SettingsContext, Provider: SettingsProvider } = createProvider<IMainSettings>(
    {} as IMainSettings,
    { valueName: "settings", setValueName: "setSettings", ignoredFields: ["_saved"] }
);

export const { Context: UserSettingsContext, Provider: UserSettingsProvider } = createProvider<IUserSettings>(
    {} as IUserSettings,
    { valueName: "userSettings", setValueName: "setUserSettings", ignoredFields: ["_saved"] }
);

export const { Context: SceneContext, Provider: SceneProvider } = createProvider<ISceneSettings[]>(
    [], 
    { valueName: "scenes", setValueName: "setScenes", ignoredFields: ["_saved"] }
);

export const { Context: ElementContext, Provider: ElementProvider } = createProvider<any | null>(
    null, 
    { valueName: "elementSelected", setValueName: "setElementSelected", ignoredFields: ["_saved"] }
);

export const { Context: BackgroundContext, Provider: BackgroundProvider } = createProvider<IBackgroundSettings[]>(
    [], 
    { valueName: "backgrounds", setValueName: "setBackgrounds", ignoredFields: ["_saved"/*, "_deleted"*/] }
);

export const { Context: SpriteContext, Provider: SpriteProvider } = createProvider<ISpriteSettings[]>(
    [],
    { valueName: "spriteResources", setValueName: "setSpriteResources", ignoredFields: ["_saved"] }
);

export const { Context: VariablesContext, Provider: VariablesProvider } = createProvider<IVariablesSettings>(
    {
        _resourceType: 'variables',
        _version: '1.0',
        _saved: true,
        _deleted: false,
        variables: [],
    },
    { valueName: "variables", setValueName: "setVariables", ignoredFields: ["_saved"] }
);

export const { Context: ScriptsContext, Provider: ScriptsProvider } = createProvider<IScriptsSettings>(
    { _resourceType: 'scripts', _version: '1.0', _saved: true, _deleted: false, scripts: [] },
    { valueName: 'scripts', setValueName: 'setScripts', ignoredFields: ['_saved'] }
);
export const { Context: PalettesContext, Provider: PalettesProvider } = createProvider<IPalettesSettings>(
    { _resourceType: 'palettes', _version: '1.0', _saved: true, _deleted: false, palettes: [] },
    { valueName: 'palettes', setValueName: 'setPalettes', ignoredFields: ['_saved'] }
);

// Função genérica para criar providers com nomes personalizados para value e setValue
function createProvider<T>(
    defaultValue: T,
    customNames: { 
        valueName: string; 
        setValueName: string; 
        ignoredFields?: Array<T extends Array<infer U> ? keyof U : keyof T>; 
    }
) {
    // Define o tipo do contexto
    type ContextType = {
        [key in typeof customNames.valueName]: T;
    } & {
        [key in typeof customNames.setValueName]: Dispatch<SetStateAction<T>>;
    } & {
        [key in `${typeof customNames.valueName}Ref`]: React.MutableRefObject<T>;
    } & {
        ignoredFields?: Array<T extends Array<infer U> ? keyof U : keyof T>; 
    };

    const Context = createContext<ContextType | undefined>(undefined);

    const Provider = ({ children }: { children: ReactNode }) => {
        const stateValueRef = useRef<T>(defaultValue); // Armazena o valor diretamente
        const [stateValue, setStateValue] = useState<T>(defaultValue); // Sincroniza com o Tick da UI

        // Função para atualizar tanto o estado quanto a ref
        const updateValue = (newValue: T | ((prev: T) => T)) => {
            // Updates can arrive several times between React renders (for
            // example during a drag), so always build from the latest value.
            const nextValue = newValue instanceof Function ? newValue(stateValueRef.current) : newValue;
            stateValueRef.current = nextValue; // Atualiza o valor na ref
            setStateValue(nextValue); // Atualiza o estado (se precisar refletir na UI)
        };

        // Gera os valores do contexto com os nomes personalizados
        const contextValue = {
            [customNames.valueName]: stateValue,
            [customNames.setValueName]: updateValue,
            [`${customNames.valueName}Ref`]: stateValueRef,
            ignoredFields: customNames.ignoredFields || [],
        } as ContextType;

        return <Context.Provider value={contextValue}>{children}</Context.Provider>;
    };

    return { Context, Provider };
}

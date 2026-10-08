import { App as AntDApp, Flex, FloatButton, Layout, Spin, Splitter, Typography, notification } from 'antd';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import BottomPanel, { COMPILER_STATUS_HEADER_HEIGHT } from '../../BottomPanel';
import LeftPanel from '../../LeftPanel';
import RightPanel from '../../RightPanel';
import RightPanelScroll from '../../RightPanelScroll';
import TopBar from '../../TopBar';

// import './Engine.css';
// import '.././styles.css';

import GameWorld from '../../gameWorld/GameWorld';
import SpriteEditor from '../../SpriteEditor';

import useAppContexts from '@/providers/contexts/AppContexts';
import { useBuildState } from '@/providers/BuildStateProvider';
import { IBackgroundSettings } from '@/providers/contexts/interfaces/IBackgroundElement';
import { IProjectSettings } from '@/providers/contexts/interfaces/IProjectElement';
import { ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { IMainSettings } from '@/providers/contexts/interfaces/ISettingElement';
import { ISpriteSettings } from '@/providers/contexts/interfaces/ISpriteElement';
import { ISettingUtils } from '@/providers/contexts/interfaces/ISettingUtils';
import { migrateBlob47Parts } from '@/utils/blobAutoTile';
import { LayoutOutlined } from '@ant-design/icons';
import ErrorBoundary from 'antd/es/alert/ErrorBoundary';
import { useLocation } from 'react-router-dom';
import { AntdToken } from '../../common/AntDToken';
import { IUserSettings } from '@/providers/contexts/interfaces/IUserSettings';
import Settings from './Settings';
import { Header } from 'antd/es/layout/layout';
import AssetLibraryEditor from '../../resourceEditors/AssetLibraryEditor';
import DialogueReviewEditor from '../../resourceEditors/DialogueReviewEditor';
import { clearImageCache } from '@/utils/imageCache';
import { clearPaletteTransparentImageCache } from '@/utils/paletteTransparency';
import { clearProjectAssetFileCache, loadProjectAssetFiles } from '@/utils/projectAssetCache';
import { clearSceneCanvasCache } from '@/utils/sceneRenderCache';
import { loadPaletteLibrary } from '../../resourceEditors/paletteLibrary';
import { preloadSceneVisualAssets } from '@/utils/preloadSceneVisualAssets';
import { shareInFlightRequest } from '@/utils/inFlightRequest';

// The menu event can be delivered to more than one mounted Engine listener.
// Keep this lock at module scope so all listeners share the same export state.
let exportDialogInProgress = false;
import { useI18n } from '@/i18n/I18n';

const { Content } = Layout;

const baseLayoutStyle = { 
  flex: 1,
  display: 'flex', 
  height: 'calc(100vh - 42px)',
  overflow: 'hidden' 
};

const Engine: React.FC = () => {
  const { token } = AntdToken();
  const { t } = useI18n();
  const { setBuilding } = useBuildState();
  const location = useLocation();
  const [contentView, setContentView] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [centerWorkspaceSizes, setCenterWorkspaceSizes] = useState<Array<number | string>>(['75%', '25%']);
  const loadedProjectPathRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);


  // const { scenes, setScenes, scenesRef, ignoredFields: ignoredFieldsScenes} = useSceneContext();
  // const { project, setProject, projectRef, ignoredFields: ignoredFieldsProject } = useProjectContext();
  // const { settings, setSettings, settingsRef, ignoredFields: ignoredFieldsSettings } = useSettingsContext();
  // const { backgrounds, setBackgrounds, backgroundsRef, ignoredFields: ignoredFieldsBackgrounds } = useBackgroundContext();
  // const { settingUtils, setSettingUtils, settingUtilsRef } = useSettingsUtilsContext();
  // const { elementSelected } = useElementContext();
  const {
    scenes, setScenes, scenesRef, ignoredFieldsScenes,
    project, setProject, projectRef, ignoredFieldsProject,
    settings, setSettings, settingsRef, ignoredFieldsSettings,
    backgrounds, setBackgrounds, backgroundsRef, ignoredFieldsBackgrounds,
    spriteResources, setSpriteResources, spriteResourcesRef, ignoredFieldsSpriteResources,
    settingUtils, setSettingUtils, settingUtilsRef,
    elementSelected, setElementSelected,
    userSettings, setUserSettings, userSettingsRef, ignoredFieldsUserSettings
    , variables, setVariables, variablesRef, ignoredFieldsVariables, scripts, setScripts, scriptsRef, ignoredFieldsScripts, palettes, setPalettes, palettesRef, ignoredFieldsPalettes
  } = useAppContexts();

  const openDialogueScene = useCallback((sceneId: string) => {
    const scene = scenes.find(item => item.id === sceneId && !item._deleted);
    if (!scene) return;
    setContentView(1);
    setElementSelected({ ...scene, _recenter: true });
    setSettingUtils(previous => ({ ...previous, selectedSceneIds: [scene.id], tileEditSceneId: null, tileEditLayerId: null, activeSceneObject: null, activeTriggerId: null }));
  }, [scenes, setElementSelected, setSettingUtils]);

  // Update settings utils initialization
  const initializeSettingUtils = useCallback((projectFilePath: string) => {
    const defaultSettingUtils: ISettingUtils = {
      _resourceType: 'setting-utils',
      _saved: true,
      _deleted: false,
      projectPathFile: projectFilePath,
      projectDirectory: projectFilePath ? projectFilePath.substring(0, projectFilePath.lastIndexOf('\\')) : '',
      baseTitle: 'GBA Studio',
activeButton: 'select',
activeSubButton: '',
collisionBrushSize: '8px',
collisionSide: 'solid',
      localImagePath: '',
      localImagePathHD: '',
      images: null,
      imagesHD: null,
      buttonZoomPressed: false
    };

    setSettingUtils(defaultSettingUtils);
  }, []);

  const Desc: React.FC<Readonly<{ text?: string | number }>> = (props) => (
    <Flex justify="center" align="center" style={{ height: '100%' }}>
      <Typography.Title type="secondary" level={5} style={{ whiteSpace: 'nowrap' }}>
        {props.text}
      </Typography.Title>
    </Flex>
  );

  const [panelSizes, setPanelSizes] = useState<number[]>([]); // Tamanho inicial do painel
  const [showFloatButton, setShowFloatButton] = useState<boolean>(false);
  // const [isResizing, setIsResizing] = useState<boolean>(false);

  // const handleResizeStart = () => {
  //   setIsResizing(true);
  // };

  const handleResizePanel = (sizes: number[]) => {
    setPanelSizes(sizes);
  };

  const handleCenterWorkspaceResize = (sizes: number[]) => setCenterWorkspaceSizes(sizes);
  const handleCenterWorkspaceResizeEnd = (sizes: number[]) => {
    setCenterWorkspaceSizes(sizes);
    window.electronAPI.saveLastPositionSplitters({ centerWorkspace: sizes.map(Math.round) });
  };

  const handleResizeEnd = (sizes: number[]) => {
    // setIsResizing(false);
    const newSizes = [...sizes];

    // console.log('Tamanhos 1 janela:', sizes[0])
    // console.log('Tamanhos 2 janela:', sizes[1])
    // console.log('Tamanhos 3 janela:', sizes[2])
    // console.log('-------------------------------------------')
    // setPanelSize(size);
    if (newSizes[0] > 140 && newSizes[0] < 250) {
      setShowFloatButton(false);
      newSizes[0] = 250;
      setPanelSizes(newSizes);
    } else if (newSizes[0] <= 140) {
      setShowFloatButton(true);
      newSizes[0] = 0;
      setPanelSizes(newSizes);
    } else {
      setShowFloatButton(false);
    }
    // Arredondar os numeros
    let newSizesRound = newSizes.map(Math.round);

    setPanelSizes(newSizesRound);

    // Salva preferencia dos paineis Splitter
    window.electronAPI.saveLastPositionSplitters(newSizesRound);
  };

  const resetPanelSize = () => {
    const newSizes = [...panelSizes];
    newSizes[0] = 250;
    handleResizeEnd(newSizes);
  };

  // Loading Sizes Splitters
  useEffect(() => {
    if (!window.electronAPI) {
      console.error('window.electronAPI is undefined');
      return;
    }

    const loadSizesSplitters = async () => {
      const newSizesSplitter = await window.electronAPI.loadLastPositionSplitters();
      console.log('>> Splitters: ', newSizesSplitter);
      if (Array.isArray(newSizesSplitter)) {
        handleResizeEnd(newSizesSplitter);
      } else if (newSizesSplitter) {
        if (Array.isArray(newSizesSplitter.main)) handleResizeEnd(newSizesSplitter.main);
        if (Array.isArray(newSizesSplitter.centerWorkspace) && newSizesSplitter.centerWorkspace.length === 2) {
          const [worldSize, compilerSize] = newSizesSplitter.centerWorkspace;
          const restoredCompilerSize = Math.max(COMPILER_STATUS_HEADER_HEIGHT, compilerSize);
          setCenterWorkspaceSizes([Math.max(40, worldSize + compilerSize - restoredCompilerSize), restoredCompilerSize]);
        }
      }
      else
        setPanelSizes([250, window.innerWidth - 500, 250]);
    };

    loadSizesSplitters();
  }, []);

  // Loading Favorite Events
  // useLayoutEffect(() => {
  //   if (!window.electronAPI) {
  //     console.error('window.electronAPI is undefined');
  //     return;
  //   }

  //   const favoriteEvents = async () => {
  //     const response = await window.electronAPI.loadFavoriteEvents();
  //     console.log('>> FavoriteEvents: ', response);
      
  //     setSettingUtils(() => ({ ...settingUtilsRef.current, favoriteEvents: response }));
  //   };

  //   favoriteEvents();
  // }, []);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    console.log("..: Engine - query:", query);

    const projectFilePath = query.get('path');
    const loadGeneration = ++loadGenerationRef.current;

    const loadFile = async (projectFilePath: string | null) => {
      if (!projectFilePath) return;

      try {
        const projectChanged = loadedProjectPathRef.current !== projectFilePath;
        if (projectChanged) {
          clearImageCache();
          clearPaletteTransparentImageCache();
          clearProjectAssetFileCache();
          clearSceneCanvasCache();
          loadedProjectPathRef.current = projectFilePath;
        }
        // Initialize settings utils first
        console.log("..: Engine - File Path:", projectFilePath);
        initializeSettingUtils(projectFilePath);
        console.log('..: useEffect settingUtils default ', settingUtils);

        const [file, normalCatalog, hdCatalog, tilesetCatalog, autoTileCatalog, spriteCatalog] = await Promise.all([
          shareInFlightRequest(`engine:${projectFilePath}:settings`, () => window.electronAPI.loadSettings(projectFilePath)),
          shareInFlightRequest(`engine:${projectFilePath}:backgrounds`, () => window.electronAPI.fetchImages('backgrounds')).catch(() => null),
          shareInFlightRequest(`engine:${projectFilePath}:backgrounds-hd`, () => window.electronAPI.fetchImages('backgrounds-hd')).catch(() => null),
          loadProjectAssetFiles('tilesets', projectFilePath).catch(() => []),
          loadProjectAssetFiles('auto-tiles', projectFilePath).catch(() => []),
          loadProjectAssetFiles('sprites', projectFilePath).catch(() => []),
        ]);
        if (loadGeneration !== loadGenerationRef.current) return;
        console.log("..: Engine - Response BE:", file);
        if (!file || !Array.isArray(file)) {
          console.error('Invalid file data:', file);
          if (loadGeneration === loadGenerationRef.current) setLoading(false);
          return;
        }

        const categorized = file.reduce((acc, obj) => {
          const objectJson = JSON.parse(obj);
          const type = objectJson._resourceType;

          if (!acc[type]) acc[type] = [];

          acc[type].push({ ...objectJson, _saved: true });
          
          return acc;
        }, {} as Record<string, any[]>);

        const loadedScenesFromFile: ISceneSettings[] = categorized.scene || [];
        const backgroundsFromFile: IBackgroundSettings[] = categorized.background || [];
        const spritesFromFile: ISpriteSettings[] = categorized.sprite || [];
        const projectFromFile: IProjectSettings | null = categorized.project?.[0] || null;          // Assume apenas um projeto
        const settingsFromFile: IMainSettings | null = categorized.settings?.[0] || null;           // Assume apenas uma configuração
        const userSettingsFromFile: IUserSettings | null = categorized.user_settings?.[0] || null;  // Assume apenas uma configuração
        const variablesFromFile = categorized.variables?.[0] || null;
        const scriptsFromFile = categorized.scripts?.[0] || null;
        const migrateLegacyAutoTiles = Boolean(settingsFromFile && !Array.isArray(settingsFromFile.autoTileSlots)
          && loadedScenesFromFile.some(scene => scene.autoTileSlots?.length));
        const migratedAutoTileSlots: NonNullable<IMainSettings['autoTileSlots']> = [];
        const scenesWithProjectAutoTiles = migrateLegacyAutoTiles ? loadedScenesFromFile.map(scene => {
          const slotMapping = (scene.autoTileSlots ?? []).map(slot => {
            const normalized = { autoTileId: slot.autoTileId ?? undefined, name: slot.name, tileSize: slot.tileSize ?? 16 as const, parts: Array.from({ length: 47 }, (_, index) => slot.parts[index] ?? null) };
            const signature = JSON.stringify(normalized);
            let globalIndex = migratedAutoTileSlots.findIndex(existing => JSON.stringify(existing) === signature);
            if (globalIndex < 0) {
              globalIndex = migratedAutoTileSlots.length;
              migratedAutoTileSlots.push(normalized);
            }
            return globalIndex;
          });
          const backgrounds = scene.backgrounds?.map(layer => layer.autoTileMap
            ? { ...layer, autoTileMap: layer.autoTileMap.map(row => row.map(slotIndex => slotMapping[slotIndex] ?? slotIndex)) }
            : layer);
          return { ...scene, autoTileSlots: undefined, ...(backgrounds ? { backgrounds } : {}), _saved: false };
        }) : loadedScenesFromFile;
        const scenesFromFile = scenesWithProjectAutoTiles.map(scene => {
          let migrated = false;
          const backgrounds = scene.backgrounds?.map(layer => {
            if (!layer.autoTileMap || layer.autoTileMapVersion === 1) return layer;
            migrated = true;
            const rows = Math.max(layer.autoTileMap.length * 2, Math.ceil(scene.height / 8));
            const columns = Math.max((layer.autoTileMap[0]?.length ?? 0) * 2, Math.ceil(scene.width / 8));
            const autoTileMap = Array.from({ length: rows }, () => Array.from({ length: columns }, () => -1));
            layer.autoTileMap.forEach((row, y) => row.forEach((slotIndex, x) => {
              if (slotIndex >= 0 && autoTileMap[y * 2]?.[x * 2] !== undefined) autoTileMap[y * 2][x * 2] = slotIndex;
            }));
            return { ...layer, autoTileMap, autoTileMapVersion: 1 as const };
          });
          return migrated ? { ...scene, backgrounds, _saved: false } : scene;
        });
        const projectSettingsFromFile = migrateLegacyAutoTiles && settingsFromFile
          ? { ...settingsFromFile, autoTileSlots: migratedAutoTileSlots, _saved: false }
          : settingsFromFile;
        const projectSettingsWithBlobOrder = projectSettingsFromFile && projectSettingsFromFile.autoTilePartOrderVersion !== 1
          ? {
            ...projectSettingsFromFile,
            autoTileSlots: (projectSettingsFromFile.autoTileSlots ?? []).map(slot => ({ ...slot, tileSize: slot.tileSize ?? 16, parts: migrateBlob47Parts(slot.parts) })),
            autoTilePartOrderVersion: 1 as const,
            _saved: false,
          }
          : projectSettingsFromFile;
        const palettesFromFile = categorized.palette || [];
        const visualPreload = preloadSceneVisualAssets({
          scenes: scenesFromFile,
          backgrounds: backgroundsFromFile,
          normalCatalog,
          hdCatalog,
          tilesets: tilesetCatalog,
          autoTiles: autoTileCatalog,
          sprites: spriteCatalog,
          palettes: palettesFromFile.length ? palettesFromFile : loadPaletteLibrary(),
        });

        // Atualize os estados de uma vez só:
        if (scenesFromFile.length > 0 || projectChanged) {
          setScenes(prev => {
            if (projectChanged) return scenesFromFile;
            const prevIds = prev.map(s => s.id);
            const novos = scenesFromFile.filter(s => !prevIds.includes(s.id));
            return [...prev, ...novos];
          });
        }

        if (backgroundsFromFile.length > 0 || projectChanged) {
          setBackgrounds(prev => {
            if (projectChanged) return backgroundsFromFile;
            const prevIds = prev.map(b => b.id);
            const novos = backgroundsFromFile.filter(b => !prevIds.includes(b.id));
            return [...prev, ...novos];
          });
        }

        if (spritesFromFile.length > 0 || projectChanged) {
          setSpriteResources(prev => {
            if (projectChanged) return spritesFromFile;
            const previousIds = prev.map(sprite => sprite.id);
            const newSprites = spritesFromFile.filter(sprite => !previousIds.includes(sprite.id));
            return [...prev, ...newSprites];
          });
        }

        if (projectFromFile) {
          setProject(projectFromFile);
        }

        if (projectSettingsWithBlobOrder) {
          setSettings(projectSettingsWithBlobOrder);
        }

        if (userSettingsFromFile) {
          setUserSettings(userSettingsFromFile);
        }

        if (variablesFromFile) {
          setVariables(variablesFromFile);
        }
        if (scriptsFromFile) setScripts(scriptsFromFile);
        if (palettesFromFile.length) setPalettes(previous => ({ ...previous, palettes: palettesFromFile }));

        setSettingUtils(previous => ({
          ...previous,
          images: normalCatalog?.status === 'success' ? normalCatalog.fileImages : [],
          imagesHD: hdCatalog?.status === 'success' ? hdCatalog.fileImages : [],
          localImagePath: normalCatalog?.localPath ?? previous.localImagePath,
          localImagePathHD: hdCatalog?.localPath ?? previous.localImagePathHD,
        }));

        await visualPreload;
        if (loadGeneration !== loadGenerationRef.current) return;

        setLoading(false);

      } catch (error) {
        console.error('Error parsing file data:', error);
        if (loadGeneration === loadGenerationRef.current) setLoading(false);
      }
    }

    loadFile(projectFilePath);
  }, [location.search]);

  // Expose serialized project helper for fallback run-live (main may call window.__getSerializedProject())
  useEffect(() => {
    (window as any).__getSerializedProject = async () => {
      try {
        // Collect project files from providers refs
        const projectDir = settingUtilsRef.current?.projectDirectory || '';
        const files: any[] = [];
        const assets: any[] = [];

        // Scenes
        const scenes = scenesRef.current || [];
        scenes.forEach((s: any) => files.push({ path: `project/scenes/${s.name.toLowerCase().replace(/ /g,'_')}.gbasres`, content: s }));

        // Backgrounds
        const bgs = backgroundsRef.current || [];
        bgs.forEach((b: any) => files.push({ path: `project/backgrounds/${b.name.toLowerCase().replace(/ /g,'_')}.gbasres`, content: b }));

        const sprites = spriteResourcesRef.current || [];
        sprites.forEach((sprite: any) => files.push({ path: `project/sprites/${sprite.name.toLowerCase().replace(/ /g,'_')}.gbasres`, content: sprite }));

        // Project
        if (projectRef.current) {
          const projPathFile = settingUtilsRef.current && (settingUtilsRef.current as any).projectPathFile ? (settingUtilsRef.current as any).projectPathFile : null;
          const projFilename = projPathFile ? projPathFile.split('\\').pop()?.split('/').pop() : 'project.gbaproj';
          files.push({ path: `project/${projFilename}`, content: projectRef.current });
        }

        // Settings
        if (settingsRef.current) files.push({ path: `project/settings.gbasres`, content: settingsRef.current });

        if (variablesRef.current) files.push({ path: `project/variables.gbasres`, content: variablesRef.current });
        if (scriptsRef.current) files.push({ path: `project/scripts.gbasres`, content: scriptsRef.current });
        (palettesRef.current?.palettes ?? []).forEach((palette: any) => files.push({ path: `project/palettes/${palette.name.toLowerCase().replace(/ /g, '_')}/palette.gbasres`, content: { ...palette, _resourceType: 'palette' } }));

        // Collect assets from settingUtils localImagePath (scan assets folder)
        try {
          const fs = (window as any).fs || null; // window fs not available; fallback to asking main is not possible here
        } catch (e) {}

        return { projectFiles: files, assets };
      } catch (err) {
        console.error('Error building serialized project', err);
        return null;
      }
    };

    return () => { try { delete (window as any).__getSerializedProject; } catch (e) {} };
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.on) return;
    const playPreview = () => window.electronAPI.send('run-live', null);
    const buildGame = () => {
      setBuilding(true);
      window.electronAPI.send('compile-project', null);
    };
    const exportButano = async () => {
      if (exportDialogInProgress) return;
      exportDialogInProgress = true;
      try {
        const result = await window.electronAPI.exportBuildAs();
        if (!result?.success && !result?.cancelled) {
          const description = result?.message || 'Não foi possível exportar o projeto Butano. Faça um Build antes de exportar.';
          notification.error({
            message: 'Exportação não realizada',
            description,
            placement: 'topRight',
          });
        }
      } finally {
        exportDialogInProgress = false;
      }
    };
    const exportExecutable = async () => {
      if (exportDialogInProgress) return;
      exportDialogInProgress = true;
      try {
        const result = await window.electronAPI.exportExecutable();
        if (!result?.success && !result?.cancelled) {
          const description = result?.message || 'Não foi possível exportar o executável. Faça um Build antes de exportar.';
          notification.error({
            message: 'Exportação não realizada',
            description,
            placement: 'topRight',
          });
        }
      } finally {
        exportDialogInProgress = false;
      }
    };
    window.electronAPI.on('game-play-preview', playPreview);
    window.electronAPI.on('game-build', buildGame);
    window.electronAPI.on('game-export-butano', exportButano);
    window.electronAPI.on('game-export-executable', exportExecutable);
    return () => {
      window.electronAPI.removeListener('game-play-preview', playPreview);
      window.electronAPI.removeListener('game-build', buildGame);
      window.electronAPI.removeListener('game-export-butano', exportButano);
      window.electronAPI.removeListener('game-export-executable', exportExecutable);
    };
  }, [setBuilding]);

  // Pega informações do projeto aberto para salvar
  useEffect(() => {
    const prepareForBackend = (fields: any, ignoredFields: string[]) => {
      if (Array.isArray(fields)) {
        console.log("..: IsArray:", fields);
        if (fields.length > 0) {
          return fields.map((field: any) =>
            Object.fromEntries(
                Object.entries(field).filter(([key]) => !ignoredFields.includes(key))
            )
          );
        }
        return null;
      }
      console.log("..: IsNOTArray:", fields);
      return  Object.fromEntries(
        Object.entries(fields).filter(([key]) => !ignoredFields.includes(key))
      );
    };

    const callback = async (requestToSave: string | { type?: string; markAsSaved?: boolean; persistToOriginal?: boolean }) => {
      const requestType = typeof requestToSave === 'string' ? requestToSave : requestToSave?.type;
      const saveOptions = typeof requestToSave === 'object' ? requestToSave : {};

      if (requestType !== 'SAVE_DATA') {
        return;
      }

      console.log('..: BE requisitou FE para saves:', requestToSave);

      // Use refs para garantir dados atualizados
      console.log('..: all data to save scenes:', scenesRef.current);
      console.log('..: all data to save project:', projectRef.current);
      console.log('..: all data to save backgrounds:', backgroundsRef.current);
      console.log('..: all data to save sprites:', spriteResourcesRef.current);
      console.log('..: all data to save setting:', settingsRef.current);
      console.log('..: all data to save user setting:', userSettingsRef.current);
      console.log('..: all data to save variables:', variablesRef.current);
      console.log('..: all data to save settingUtils:', settingUtilsRef.current);

      // Preparar os dados para salvar
      const allToSave = [
        prepareForBackend(scenesRef.current.filter(s => s._saved === false), ignoredFieldsScenes!),
        projectRef.current?._saved === false ? prepareForBackend(projectRef.current, ignoredFieldsProject!) : null,
        settingsRef.current._saved === false ? prepareForBackend(settingsRef.current, ignoredFieldsSettings!) : null,
        userSettingsRef.current._saved === false ? prepareForBackend(userSettingsRef.current, ignoredFieldsUserSettings!) : null,
        prepareForBackend(backgroundsRef.current.filter(s => s._saved === false), ignoredFieldsBackgrounds!),
        prepareForBackend(spriteResourcesRef.current.filter(sprite => sprite._saved === false), ignoredFieldsSpriteResources!),
        variablesRef.current._saved === false ? prepareForBackend(variablesRef.current, ignoredFieldsVariables!) : null,
        scriptsRef.current._saved === false ? prepareForBackend(scriptsRef.current, ignoredFieldsScripts!) : null,
        palettesRef.current._saved === false ? prepareForBackend(palettesRef.current, ignoredFieldsPalettes!) : null,
        settingUtilsRef.current,
      ].filter(item => item != null && (!(Array.isArray(item)) || item.length > 0));

      console.log('..: Infos to save:', allToSave);
      // Enviar dados para o Backend
      let saveSucceeded = false;
      try {
        saveSucceeded = await window.electronAPI.responseProjectToSave(allToSave) === true;
      } catch (error) {
        console.error('Save request failed before the main process confirmed the write:', error);
      }
      if (saveSucceeded !== true) {
        console.error('Save was rejected by the main process; keeping editor state dirty.');
        return;
      }

      if (saveOptions.markAsSaved !== false) {
        // Only clear dirty flags for the exact records that were written.
        // An edit made while IPC was in flight must remain dirty.
        const samePersistedData = (current: any, persisted: any, ignoredFields: string[]) => {
          const comparable = (value: any) => Object.fromEntries(
            Object.entries(value).filter(([key]) => !ignoredFields.includes(key))
          );
          return JSON.stringify(comparable(current)) === JSON.stringify(persisted);
        };
        const sentRecords = allToSave.flatMap((item: any) => Array.isArray(item) ? item : [item]);
        const wasRecordSaved = (current: any, ignoredFields: string[]) => {
          const persisted = sentRecords.find((item: any) => item?._resourceType === current?._resourceType && item?.id === current?.id);
          return Boolean(persisted && samePersistedData(current, persisted, ignoredFields));
        };
        const sentResource = (resourceType: string) => sentRecords.find((item: any) => item?._resourceType === resourceType);
        const markResourceSaved = (current: any, resourceType: string, ignoredFields: string[]) => {
          const persisted = sentResource(resourceType);
          return persisted && samePersistedData(current, persisted, ignoredFields) ? { ...current, _saved: true } : current;
        };

        setScenes(() => scenesRef.current.map(scene => wasRecordSaved(scene, ignoredFieldsScenes!) ? { ...scene, _saved: true } : scene));
        if (projectRef.current) setProject(() => markResourceSaved(projectRef.current, 'project', ignoredFieldsProject!));
        setSettings(() => markResourceSaved(settingsRef.current, 'settings', ignoredFieldsSettings!));
        setUserSettings(() => markResourceSaved(userSettingsRef.current, 'user_settings', ignoredFieldsUserSettings!));
        setBackgrounds(() => backgroundsRef.current.map(item => wasRecordSaved(item, ignoredFieldsBackgrounds!) ? { ...item, _saved: true } : item));
        setSpriteResources(() => spriteResourcesRef.current.map(item => wasRecordSaved(item, ignoredFieldsSpriteResources!) ? { ...item, _saved: true } : item));
        setVariables(() => markResourceSaved(variablesRef.current, 'variables', ignoredFieldsVariables!));
        setScripts(() => markResourceSaved(scriptsRef.current, 'scripts', ignoredFieldsScripts!));
        setPalettes(() => markResourceSaved(palettesRef.current, 'palettes', ignoredFieldsPalettes!));
        // setSettingUtils(settingUtils => ({ ...settingUtils, _saved: true }));

        console.log('..: Todos os itens agora estão com _saved = true.');
      }
    };

    const unsubscribeProjectSave = window.electronAPI.onRequestProjectToSave(callback);

    const handleProjectSavedAs = (event: any, data: { projectPathFile: string; projectDirectory: string; projectName: string }) => {
      console.log('..: project saved as:', data);
      setSettingUtils(prev => ({
        ...prev,
        projectPathFile: data.projectPathFile,
        projectDirectory: data.projectDirectory,
        baseTitle: data.projectName,
      }));

      // Update project state name if current project object is loaded
      if (project) {
        setProject({ ...project, name: data.projectName, _saved: true });
      }
    };

    const unsubscribeProjectSavedAs = window.electronAPI.subscribe('project-saved-as', handleProjectSavedAs);

    // Remover o listener ao desmontar o componente
    return () => {
      unsubscribeProjectSave?.();
      unsubscribeProjectSavedAs?.();
    };
  }, [project, setProject, setSettingUtils]);

  // Listener para mudança de view pelo menu (atalhos e itens de menu View)
  useEffect(() => {
    const handleChangeContentView = (event: any, viewId: number) => {
      console.log('..: Mudando view para:', viewId);
      setContentView(viewId);
    };

    if (window.electronAPI && window.electronAPI.on) {
      window.electronAPI.on('change-content-view', handleChangeContentView);
    }

    return () => {
      if (window.electronAPI && window.electronAPI.removeListener) {
        window.electronAPI.removeListener('change-content-view', handleChangeContentView);
      }
    };
  }, []);

  useEffect(() => {
    // Helper to check if any item in array has _saved === false
    const hasUnsaved = (arr: any[]) => Array.isArray(arr) && arr.some(item => item && item._saved === false);

    // Check todos para ver se tem algum com alteração para salvar
    const unsaved =
      hasUnsaved(scenes) || hasUnsaved(backgrounds) || hasUnsaved(spriteResources) || (project && project._saved === false) 
      || (settings && settings._saved === false) || (settingUtils && settingUtils._saved === false)
      || (userSettings && userSettings._saved === false)
      || (variables && variables._saved === false)
      || (scripts && scripts._saved === false)
      || (palettes && palettes._saved === false);

    // Call Electron API to update title - isSaved: true se não tem nada para salvar
    window.electronAPI.updateTitle('GBA Studio', project?.name || '', !unsaved);

    if (unsaved) {
      console.log('..: Engine.tsx tem alguma atualização!');
    }
  }, [scenes, project, settings, userSettings, backgrounds, spriteResources, settingUtils, variables, scripts, palettes]);

  // useEffect(() => {
  //   const handleResize = () => {
  //     console.log('..: A janela foi redimensionada com splitters: ', panelSizes);
  //     const newSizes = panelSizes;
  //     newSizes[1] = window.innerWidth - panelSizes[0] - panelSizes[2];
  //     handleResizeEnd(newSizes);
  //   };

  //   // Adiciona o listener para o evento de redimensionamento
  //   window.addEventListener('resize', handleResize);

  //   // Chama a função de redimensionamento uma vez para definir o estado inicial
  //   handleResize();

  //   // Limpa o listener ao desmontar o componente
  //   return () => {
  //     window.removeEventListener('resize', handleResize);
  //   };
  // }, []);

  // useEffect(() => {
  //   const handleResize = () => {
  //     console.log('..: A janela foi redimensionada com splitters: ', panelSizes);
  //     const leftPanelWidth = panelSizes[0];
  //     const rightPanelWidth = panelSizes[2];
  //     const totalWidth = window.innerWidth;
  //     const centerPanelWidth = totalWidth - leftPanelWidth - rightPanelWidth;

  //     handleResizeEnd([leftPanelWidth, centerPanelWidth, rightPanelWidth]);
  //   };

  //   window.addEventListener('resize', handleResize);
  //   handleResize();

  //   return () => {
  //     window.removeEventListener('resize', handleResize);
  //   };
  // }, []);

  if (loading) {
    return (
      <Layout style={{
        width: '100vw',
        height: '100vh',
      }}>
        <Spin fullscreen size="large" percent={50} tip="Carregando projeto..." indicator={<LayoutOutlined spin />} />
      </Layout>
    )
  }

  return (
    <ErrorBoundary>
      <AntDApp>
        <Layout >
          <Header style={{ height: 42, padding: 0, background: token.colorBgContainer }}>
            <TopBar contenView={contentView} setContentView={setContentView} />
          </Header>
          <Content>
            {contentView == 1 && (
              <Layout style={ baseLayoutStyle }>
                <Splitter
                  data-testid="engine-layout-splitter"
                  onResizeEnd={handleResizeEnd}
                  onResize={handleResizePanel}
                >
                  {/* PAINEL ESQUERDO */}
                  <Splitter.Panel
                    defaultSize="25%"
                    min={130}
                    // max="80%"
                    size={panelSizes[0]}
                    style={{
                      display: panelSizes[0] <= 140 ? 'grid' : 'flex',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      {panelSizes[0] <= 140 && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            zIndex: 10,
                            pointerEvents: 'none',
                          }}
                        />
                      )}
                      <LeftPanel />
                    </div>
                  </Splitter.Panel>

                  {/* CENTRO */}
                  <Splitter.Panel /*size={panelSizes[1]}*/>
                    <Splitter layout="vertical" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }} onResize={handleCenterWorkspaceResize} onResizeEnd={handleCenterWorkspaceResizeEnd}>
                      <Splitter.Panel size={centerWorkspaceSizes[0]} min={40} style={{ minHeight: 0, overflow: 'hidden', backgroundColor: token.colorBgContainer }}>
                        <GameWorld
                          resetPanelSize={resetPanelSize}
                          setShowFloatButton={setShowFloatButton}
                          showFloatButton={showFloatButton}
                        />
                      </Splitter.Panel>
                      <Splitter.Panel size={centerWorkspaceSizes[1]} min={COMPILER_STATUS_HEADER_HEIGHT} max="90%" style={{ minHeight: 0, overflow: 'hidden' }}>
                        {/* <Footer> */}
                        <BottomPanel />
                        {/* </Footer> */}
                      </Splitter.Panel>
                    </Splitter>
                  </Splitter.Panel>

                  {/* PAINEL DIREITO */}
                  <Splitter.Panel defaultSize="35%" min={365} size={panelSizes[2]} style={{ minWidth: 365, flexShrink: 0, overflow: 'hidden' }} >
                    <RightPanelScroll><RightPanel controllerView={setContentView} /></RightPanelScroll>
                  </Splitter.Panel>
                </Splitter>
              </Layout>
            )}
            {contentView == 3 && (
              <Layout style={ baseLayoutStyle }>
                <SpriteEditor />
              </Layout>
            )}
            {contentView == 4 && (
              <Layout style={ baseLayoutStyle }>
                <AssetLibraryEditor kind="images" />
              </Layout>
            )}
            {contentView == 5 && (
              <Layout style={ baseLayoutStyle }>
                <AssetLibraryEditor kind="music" />
              </Layout>
            )}
            {contentView == 6 && (
              <Layout style={ baseLayoutStyle }>
                <AssetLibraryEditor kind="sounds" />
              </Layout>
            )}
            {contentView == 7 && (
              <Layout style={ baseLayoutStyle }>
                <AssetLibraryEditor kind="palettes" />
              </Layout>
            )}
            {contentView == 8 && (
              <Layout style={ baseLayoutStyle }>
                <DialogueReviewEditor onOpenScene={openDialogueScene} />
              </Layout>
            )}
            {contentView == 9 && (
              <Layout style={ baseLayoutStyle }>
                <Settings />
              </Layout>
            )}
          </Content>
        </Layout>
      </AntDApp>
    </ErrorBoundary>
  );
};

export default Engine;

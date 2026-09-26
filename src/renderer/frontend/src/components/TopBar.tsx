import React, { useEffect, useMemo, useState } from 'react';
import { AutoComplete, Dropdown, Input, Button, Tooltip, Flex, Typography, message } from 'antd';
import { DownOutlined, FolderOpenOutlined, ExportOutlined, PlaySquareOutlined, CloseCircleOutlined, ToolFilled, CloseOutlined, LoadingOutlined } from '@ant-design/icons';
import { AntdToken } from '../components/common/AntDToken';
import { useBuildState } from '../providers/BuildStateProvider';
import useAppContexts from '@/providers/contexts/AppContexts';
import { useI18n } from '@/i18n/I18n';
import { EDITORS, getEditor } from './pages/engine/editorRegistry';
import { ZOOM_STEPS } from '@/utils/zoom';

interface TopBarProps {
  contenView: number;
  setContentView: (id: number) => void;
}

interface SearchResult {
  key: string;
  label: string;
  detail: string;
  view: number;
  type: 'scene' | 'actor' | 'trigger' | 'script' | 'variable' | 'palette' | 'sprite' | 'asset' | 'dialogue';
  value: any;
}

const TopBar: React.FC<TopBarProps> = ({ contenView, setContentView: controllerView }) => {
  const { token } = AntdToken();
  const { t } = useI18n();
  const { settings, userSettings, setUserSettings, setSettingUtils, setElementSelected, scenes, scripts, variables, palettes, spriteResources, backgrounds } = useAppContexts();
  const [isBuildButtonHovered, setIsBuildButtonHovered] = useState(false);
  const zoomSteps = ZOOM_STEPS;

  const resetZoom = () => {
    setUserSettings(prev => ({...prev, zoom: 100, _saved: false}));
    setSettingUtils(prev => ({...prev, buttonZoomPressed: true}));
  };

  const handleZoomChange = (change: number) => {
    setUserSettings(prev => {
      let current = prev.zoom!;

      // encontra o índice mais próximo na sequência
      let idx = zoomSteps.reduce((closestIdx, step, i) => {
        return Math.abs(step - current) < Math.abs(zoomSteps[closestIdx] - current)
          ? i
          : closestIdx;
      }, 0);

      // ajusta índice conforme o change
      if (change > 0) {
        idx = Math.min(idx + 1, zoomSteps.length - 1);
      } else if (change < 0) {
        idx = Math.max(idx - 1, 0);
      }

      const newZoom = zoomSteps[idx];

      return { ...prev, zoom: Math.trunc(newZoom), _saved: false };
    });

    setSettingUtils(prev => ({...prev, buttonZoomPressed: true}));
  };

  const [searchValue, setSearchValue] = useState<string>('');
  const [assetFiles, setAssetFiles] = useState<Array<{ folder: string; filename: string; view: number }>>([]);
  const [selectedKey, setSelectedKey] = useState<number>(1);
  const { isBuilding, isRunning, setBuilding } = useBuildState();

  useEffect(() => {
    let cancelled = false;
    const loadAssets = async () => {
      const folders = [
        { folder: 'backgrounds', view: 4 }, { folder: 'backgrounds-hd', view: 4 },
        { folder: 'sprites', view: 3 }, { folder: 'musics', view: 5 }, { folder: 'sounds', view: 6 },
      ];
      const responses = await Promise.all(folders.map(async item => ({ item, response: await window.electronAPI.fetchImages(item.folder) })));
      if (cancelled) return;
      setAssetFiles(responses.flatMap(({ item, response }: any) => response?.status === 'success' && Array.isArray(response.fileImages)
        ? response.fileImages.map((filename: string) => ({ ...item, filename })) : []));
    };
    void loadAssets();
    const reload = () => { void loadAssets(); };
    window.addEventListener('gba-studio:assets-reloaded', reload);
    return () => { cancelled = true; window.removeEventListener('gba-studio:assets-reloaded', reload); };
  }, []);

  const searchResults = useMemo<SearchResult[]>(() => {
    const results: SearchResult[] = [];
    const addDialogue = (events: any[] | undefined, scene: any, owner: string) => (events ?? []).forEach(event => {
      const text = String(event.args?.text ?? event.args?.message ?? '');
      if (text) results.push({ key: `dialogue:${scene.id}:${event.id}`, label: text.slice(0, 72), detail: `Dialogue in ${scene.name} · ${owner}`, view: 8, type: 'dialogue', value: scene });
      addDialogue(event.children?.then, scene, owner);
      addDialogue(event.children?.else, scene, owner);
    });
    scenes.filter(scene => !scene._deleted).forEach(scene => {
      results.push({ key: `scene:${scene.id}`, label: scene.name, detail: 'Scene', view: 1, type: 'scene', value: scene });
      (scene.actors ?? []).forEach(actor => results.push({ key: `actor:${scene.id}:${actor.id}`, label: actor.name || 'Actor', detail: `Actor in ${scene.name}`, view: 1, type: 'actor', value: { scene, actor } }));
      (scene.triggers ?? []).forEach(trigger => results.push({ key: `trigger:${scene.id}:${trigger.id}`, label: trigger.name || 'Trigger', detail: `Trigger in ${scene.name}`, view: 1, type: 'trigger', value: { scene, trigger } }));
      addDialogue(scene.script, scene, 'On Init');
      addDialogue(scene.playerHit1Script, scene, 'Player Hit 1');
      addDialogue(scene.playerHit2Script, scene, 'Player Hit 2');
      addDialogue(scene.playerHit3Script, scene, 'Player Hit 3');
    });
    scripts.scripts.filter(script => !(script as any)._deleted).forEach(script => results.push({ key: `script:${script.id}`, label: script.name, detail: 'Script resource', view: 1, type: 'script', value: script }));
    variables.variables.filter(variable => !(variable as any)._deleted).forEach(variable => results.push({ key: `variable:${variable.id}`, label: variable.name || variable.symbol, detail: `Variable · ${variable.type}`, view: 1, type: 'variable', value: variable }));
    palettes.palettes.forEach(palette => results.push({ key: `palette:${palette.id}`, label: palette.name, detail: 'Palette', view: 7, type: 'palette', value: palette }));
    spriteResources.filter(sprite => !sprite._deleted).forEach(sprite => {
      const useCount = scenes.reduce((count, scene) => count + (scene.actors ?? []).filter(actor => actor.spriteId === sprite.id).length, 0);
      results.push({ key: `sprite:${sprite.id}`, label: sprite.name, detail: `Sprite${useCount ? ` · used by ${useCount} actor(s)` : ''}`, view: 3, type: 'sprite', value: sprite });
    });
    backgrounds.filter(background => !background._deleted).forEach(background => results.push({ key: `background:${background.id}`, label: background.name, detail: 'Background resource', view: 4, type: 'asset', value: { folder: background.hd ? 'backgrounds-hd' : 'backgrounds', filename: background.name } }));
    assetFiles.forEach(asset => results.push({ key: `asset:${asset.folder}:${asset.filename}`, label: asset.filename.replace(/\.[^/.]+$/, ''), detail: `${asset.folder.replace('-', ' ')} file`, view: asset.view, type: 'asset', value: asset }));
    const query = searchValue.trim().toLowerCase();
    return query ? results.filter(result => `${result.label} ${result.detail}`.toLowerCase().includes(query)).slice(0, 40) : [];
  }, [assetFiles, backgrounds, palettes.palettes, scenes, scripts.scripts, searchValue, spriteResources, variables.variables]);

  const openSearchResult = (result: SearchResult) => {
    setSearchValue('');
    setSelectedKey(result.view);
    controllerView(result.view);
    if (result.type === 'scene') {
      setElementSelected({ ...result.value, _recenter: true });
      setSettingUtils(previous => ({ ...previous, selectedSceneIds: [result.value.id], activeSceneObject: null, activeTriggerId: null }));
    } else if (result.type === 'actor' || result.type === 'trigger') {
      const { scene, [result.type]: object } = result.value;
      setElementSelected({ ...scene, _recenter: true });
      setSettingUtils(previous => ({ ...previous, selectedSceneIds: [scene.id], tileEditSceneId: scene.id, tileEditLayerId: 4, activeSceneObject: { sceneId: scene.id, type: result.type, id: object.id }, activeTriggerId: result.type === 'trigger' ? object.id : null }));
    } else if (result.type === 'script' || result.type === 'variable') {
      setElementSelected({ ...result.value, _resourceType: result.type === 'script' ? 'script' : 'variables' } as any);
      setSettingUtils(previous => ({ ...previous, selectedSceneIds: [], tileEditSceneId: null, tileEditLayerId: null, activeSceneObject: null, activeTriggerId: null }));
    } else if (result.type === 'sprite') {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('gba-studio:asset-search-select', { detail: { folder: 'sprites', filename: result.value.name } })), 0);
    } else if (result.type === 'palette') {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('gba-studio:palette-search-select', { detail: { id: result.value.id } })), 0);
    } else if (result.type === 'asset') {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('gba-studio:asset-search-select', { detail: result.value })), 0);
    } else if (result.type === 'dialogue') {
      setElementSelected({ ...result.value, _recenter: true });
    }
  };

  const handleMenuClick = (item: any) => {
    setSelectedKey(item.key);
   
    controllerView(item.key);
    console.log('..: selectedKey %s, menuName', item.key, item.label);
  }

  const handleProjectFolder = () => {
    console.log('..:: Open Project Folder ::..') ;
    window.electronAPI.send('open-project-folder', null);
  }

  const handleExportBuild = async () => {
    const result = await window.electronAPI.exportBuildAs();
    if (result?.success) {
      message.success(`Build exportado para ${result.filePath}`);
    } else if (!result?.cancelled) {
      message.error(result?.message || 'Não foi possível exportar o build.');
    }
  };

  const handleSaveSettingsLocalStorage = () => {
    if (settings) {
      localStorage.setItem("appSettings", JSON.stringify(settings));
    }
  }
  
  const menuItems = EDITORS.map(editor => ({ key: String(editor.id), label: t(editor.labelKey) }));
  const activeEditor = getEditor(Number(selectedKey));

  const menu = {
    items: menuItems,
    onClick: (event: any) => { handleMenuClick(menu.items.find(item => item.key == event.key)), console.log('..: handleMenuClick dropdown'); },
  };

  useEffect(() => {
    const menuItem = menu.items.find(item => item.key === contenView.toString());
    if (menuItem) {
      handleMenuClick(menuItem);
    } else {
      console.warn('..: Menu item not found for contenView:', contenView);
    }
  }, [contenView]);

  // emulator start/stop handled by BuildStateProvider; no local listeners needed
  useEffect(() => {}, [isBuilding, isRunning]);

  return (
    <Flex style={{ 
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      paddingInline: '10px', 
      paddingBlock: '5px', 
      backgroundColor: token.colorBgBase,
      alignItems: 'center', 
      justifyContent: 'space-between',
      position: 'relative',
    }}>
      <Dropdown menu={menu} placement="bottomLeft" trigger={['click']}>
        <Button style={{ width: 'fit-content', minWidth: 150, maxWidth: 280, display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
            {t(activeEditor.labelKey)}
          </span>
          <DownOutlined style={{ flex: '0 0 auto' }} />
        </Button>
      </Dropdown>
      {activeEditor.supportsZoom && (
        <Flex style={{ gap: 5, alignItems: 'center', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <Tooltip title={t('topbar.zoomOut')}>
            <Button size="middle" style={{ height: 32, width: 32 }} onClick={() => handleZoomChange(-1)}>-</Button>
          </Tooltip>
          <Tooltip title={t('topbar.zoomReset')}>
            <Button size="middle" color="default" variant="text" style={{ paddingInline: '10px' }} onClick={resetZoom}>{userSettings.zoom}%</Button>
          </Tooltip>
          <Tooltip title={t('topbar.zoomIn')}>
            <Button size="middle" style={{ height: 32, width: 32 }} onClick={() => handleZoomChange(1)}>+</Button>
          </Tooltip>
        </Flex>
      )}
      <Flex style={{ gap: 8, alignItems: 'center' }}>
        <Input.Search 
          placeholder={t('common.search')}
          allowClear
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onSearch={(value) => setSearchValue(value)}
          disabled={!activeEditor.supportsSearch}
        />
        <Tooltip title={t('topbar.openFolder')} >
          <Button 
            icon={ <FolderOpenOutlined /> } 
            onClick={() => handleProjectFolder()}
            style={{ paddingInline: '10px' }}
          />
        </Tooltip>
        <Tooltip title={t('topbar.export')}>
          <Button 
            icon={<ExportOutlined />} 
            onClick={handleExportBuild}
            disabled={isBuilding}
            style={{ paddingInline: '10px' }}
          />
        </Tooltip>
        <Tooltip title={isBuilding && isBuildButtonHovered ? t('topbar.stop') : t('topbar.build')}>
          <Button 
            danger={isBuilding && isBuildButtonHovered}
            icon={isBuilding ? (isBuildButtonHovered ? <CloseCircleOutlined /> : <LoadingOutlined spin />) : <ToolFilled />}
            disabled={isRunning}
            onMouseEnter={() => setIsBuildButtonHovered(true)}
            onMouseLeave={() => setIsBuildButtonHovered(false)}
            onClick={(e) => { 
              e.stopPropagation();
              if (isBuilding) {
                console.log('..: TopBar Stop build');
                window.electronAPI.send('stop-build', null);
                return;
              }
              console.log('..: TopBar Build - request compile'); 
              setBuilding(true);
              window.electronAPI.send('compile-project', null); 
            }}
            style={{ marginLeft: '15px', paddingInline: '10px' }}
          />
        </Tooltip>
        <Tooltip title={isRunning ? t('topbar.stop') : t('topbar.play')}>
          <Button 
            icon={ isRunning ? <CloseCircleOutlined /> : <PlaySquareOutlined /> }
            disabled={isBuilding}
            onClick={(e) => {
              e.stopPropagation();
              if (isRunning) { 
                console.log('..: TopBar Stop emulator'); 
                window.electronAPI.send('stop-emulator', null); 
              }
              else { 
                handleSaveSettingsLocalStorage();
                console.log('..: TopBar Run-live requested'); 
                window.electronAPI.send('run-live', null); 
              }
            }}
            style={{ paddingInline: '10px' }}
          />
        </Tooltip>
      </Flex>
    </Flex >
  );
};

export default TopBar;

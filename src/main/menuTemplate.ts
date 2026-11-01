import { app, ipcMain, Menu, MenuItem, MenuItemConstructorOptions, shell } from 'electron';
import { updatePreferences, getPreferences } from './handlers/preferenceHandlers';
import { changeTheme, createAboutWindow, createLauncherWindow, packageJson, windows } from './main'
import { refreshWindowTitle, requestSaveChanges } from './services/saveSettingsService';
import { createMainTranslator } from './mainI18n';
import { checkForUpdates } from './services/updateService';

let isShowCollisionsChecked = true;
let isShowNavigatorChecked = true;

// Criar um template de menu personalizado
function menuTemplate(): MenuItemConstructorOptions[] {
    // Pegar as preferências salvas
    const preferences = getPreferences();
    const currentTheme = preferences.theme || 'systemDefault';
    const currentLanguage = preferences.language || 'systemDefault';
    const t = createMainTranslator(currentLanguage);

    return [
        {
            label: t('file'),
            submenu: [
                {
                    label: t('newProject'),
                    accelerator: 'CmdOrCtrl+N', 
                    click: () => {
                        console.log('..: New Project clicado'); 
                        // Trigger the main-process handler directly (same pattern as Open...)
                        try { ipcMain.emit('change-to-launcher', null, 'new_project', false); } catch (e) { console.warn('Failed to emit change-to-launcher', e); }
                    }
                },
                {
                    label: t('open'),
                    accelerator: 'CmdOrCtrl+O', 
                    click: () => {
                        console.log('..: Open clicado');
                        try { ipcMain.emit('open-project-window'); } catch (e) { console.warn('Failed to emit open-project-window', e); }
                    },
                },
                {
                    label: t('switchProject'),
                    accelerator: 'CmdOrCtrl+P', 
                    click: () => {
                        console.log('..: Switch Project clicado'); 
                        // Trigger the main-process handler directly
                        try { ipcMain.emit('change-to-launcher', null, 'recent_project', false); } catch (e) { console.warn('Failed to emit change-to-launcher', e); }
                    }
                },
                { 
                    label: t('save'), 
                    accelerator: 'CmdOrCtrl+S', 
                    click: () => { 
                        console.log('..: Chamada para save pelo menu'); 
                        requestSaveChanges({ source: 'save', persistToOriginal: true });
                    } },
                { 
                    label: t('saveAs'), 
                    click: () => { console.log('..: Save As clicado'); ipcMain.emit('save-project-as', null); } 
                },
                { type: 'separator' },
                { label: t('reloadAssets'), click: () => { windows.main?.webContents.send('reload-assets'); } },
                { type: 'separator' },
                { label: t('close'), click: () => {
                    if (windows.main && !windows.main.isDestroyed()) windows.main.close();
                    else app.quit();
                } }
            ]
        },
        {
            label: t('edit'),
            submenu: [
                { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => windows.main?.webContents.send('history-undo') },
                { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => windows.main?.webContents.send('history-redo') },
                { type: 'separator' },
                { label: 'Cut', accelerator: 'CmdOrCtrl+X', click: () => windows.main?.webContents.send('scene-cut') },
                { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: () => windows.main?.webContents.send('scene-copy') },
                { label: 'Paste', accelerator: 'CmdOrCtrl+V', click: () => windows.main?.webContents.send('scene-paste') },
                { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', click: () => windows.main?.webContents.send('scene-duplicate') },
                { label: 'Delete', accelerator: 'Delete', click: () => windows.main?.webContents.send('editor-delete') },
                { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => windows.main?.webContents.send('scene-select-all') },
                { type: 'separator' },
                // {
                //     label: 'Spelling and Grammar', submenu: [
                //         { label: 'Checke Spelling While Typing', click: () => { console.log('..: Spelling While Typing clicado'); } },
                //     ]
                // },
                // { type: 'separator' },
                { label: t('preferences'), click: () => { 
                    console.log('..: Preferences clicado'); 
                    if (windows.main) {
                        windows.main.webContents.send('open-preferences');
                    } else if (windows.launcher) {
                        // windows.launcher.webContents.send('open-preferences');
                        console.warn('Failed to open-preferences, no main window');
                    }
                } }
            ]
        },
        // {
        //     label: 'Game',
        //     submenu: [
        //         { label: 'Run', click: () => { console.log('..: Run clicado'); } },
        //         { label: 'Run with Debugging', click: () => { console.log('..: Run with Debugging clicado'); } },
        //         {
        //             label: 'Export As',
        //             submenu: [
        //                 { label: 'Export ROM', click: () => { console.log('..: Export as ROM clicado'); } },
        //                 { label: 'Exprot WEB', click: () => { console.log('..: Export as WEB clicado'); } },
        //                 { label: 'Export POCKET', click: () => { console.log('..: Export as POCKET clicado'); } },
        //             ]
        //         },
        //         { type: 'separator' },
        //         {
        //             label: 'Advanced',
        //             submenu: [
        //                 { label: 'Eject Engine', click: () => { console.log('..: Eject Engine clicado'); } },
        //                 { type: 'separator' },
        //                 { label: 'Exprot Project Source', click: () => { console.log('..: Export Project Source clicado'); } },
        //                 { label: 'Export Project Data', click: () => { console.log('..: Export Project Data clicado'); } },
        //             ]
        //         },
        //     ]
        // },
        {
            label: 'Game',
            submenu: [
                { label: 'Play Preview Game', accelerator: 'CmdOrCtrl+P', click: () => windows.main?.webContents.send('game-play-preview') },
                { label: 'Build Game', accelerator: 'CmdOrCtrl+B', click: () => windows.main?.webContents.send('game-build') },
                {
                    label: 'Export As',
                    submenu: [
                        { label: 'Export Butano Project', accelerator: 'CmdOrCtrl+Shift+B', click: () => windows.main?.webContents.send('game-export-butano') },
                        { label: 'Export Executable', accelerator: 'CmdOrCtrl+Shift+E', click: () => windows.main?.webContents.send('game-export-executable') },
                    ],
                },
            ],
        },
        {
            label: t('view'),
            submenu: [
                { label: t('world'), accelerator: 'CmdOrCtrl+1', click: () => windows.main?.webContents.send('change-content-view', 1) },
                { label: t('sprites'), accelerator: 'CmdOrCtrl+2', click: () => windows.main?.webContents.send('change-content-view', 3) },
                { label: t('images'), accelerator: 'CmdOrCtrl+3', click: () => windows.main?.webContents.send('change-content-view', 4) },
                { label: t('music'), accelerator: 'CmdOrCtrl+4', click: () => windows.main?.webContents.send('change-content-view', 5) },
                { label: t('sounds'), accelerator: 'CmdOrCtrl+5', click: () => windows.main?.webContents.send('change-content-view', 6) },
                { label: t('palettes'), accelerator: 'CmdOrCtrl+6', click: () => windows.main?.webContents.send('change-content-view', 7) },
                { label: t('dialogues'), accelerator: 'CmdOrCtrl+7', click: () => windows.main?.webContents.send('change-content-view', 8) },
                { label: t('settings'), accelerator: 'CmdOrCtrl+8', click: () => windows.main?.webContents.send('change-content-view', 9) },
                { type: 'separator' },
                {
                    label: t('theme'), submenu: [
                        { label: t('systemDefault'), type: 'checkbox', checked: currentTheme === 'systemDefault', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'systemDefault'); } },
                        { type: 'separator' },
                        { label: t('light'), type: 'checkbox', checked: currentTheme === 'light', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'light'); } },
                        { label: t('dark'), type: 'checkbox', checked: currentTheme === 'dark', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'dark'); } },
                        { label: 'GameCubix', type: 'checkbox',  checked: currentTheme === 'gamecube', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'gamecube'); } },
                        { label: 'S-Nintenbu', type: 'checkbox', checked: currentTheme === 'nintendo', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'nintendo'); } },
                        { label: 'Blue', type: 'checkbox', checked: currentTheme === 'blue', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'blue'); } },
                        { label: 'Silver', type: 'checkbox', checked: currentTheme === 'silver', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'silver'); } },
                        { type: 'separator' },
                        { label: t('glass'), type: 'checkbox', checked: currentTheme === 'glass', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'glass'); } },
                        { label: t('bootstrap'), type: 'checkbox', checked: currentTheme === 'bootstrap', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'bootstrap'); } },
                        { label: t('cartoon'), type: 'checkbox', checked: currentTheme === 'cartoon', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'cartoon'); } },
                    ]
                },
                {
                    label: t('language'), submenu: [
                        { label: t('systemDefault'), type: 'checkbox', checked: currentLanguage === 'systemDefault', click: (menuItem: MenuItem) => updateLanguage(menuItem, 'systemDefault') },
                        { type: 'separator' },
                        { label: 'English (United States)', type: 'checkbox', checked: currentLanguage === 'en_US', click: (menuItem: MenuItem) => { updateLanguage(menuItem, 'en_US'); } },
                        { label: 'Español (España)', type: 'checkbox', checked: currentLanguage === 'es_ES', click: (menuItem: MenuItem) => { updateLanguage(menuItem, 'es_ES'); } },
                        { label: 'Français (France)', type: 'checkbox', checked: currentLanguage === 'fr_FR', click: (menuItem: MenuItem) => { updateLanguage(menuItem, 'fr_FR'); } },
                        { label: 'Português (Brasil)', type: 'checkbox', checked: currentLanguage === 'pt_BR', click: (menuItem: MenuItem) => { updateLanguage(menuItem, 'pt_BR'); } },
                    ]
                },
                // { type: 'separator' },
                // {
                //     label: 'Show Collisions',
                //     type: 'checkbox',
                //     checked: isShowCollisionsChecked,
                //     click: (menuItem: MenuItem) => {
                //         isShowCollisionsChecked = !isShowCollisionsChecked;
                //         menuItem.checked = isShowCollisionsChecked;
                //         console.log('..: Show Collisions clicado');
                //     }
                // },
                // {
                //     label: 'Show Connections', submenu: [
                //         { label: 'All', click: () => { console.log('..: All clicado'); } },
                //         { label: 'Current Scene', click: () => { console.log('..: Current Scene clicado'); } },
                //         { type: 'separator' },
                //         { label: 'None', click: () => { console.log('..: None clicado'); } },
                //     ]
                // },
                // {
                //     label: 'Show Navigator',
                //     type: 'checkbox',
                //     checked: isShowNavigatorChecked,
                //     click: (menuItem: MenuItem) => {
                //         isShowNavigatorChecked = !isShowNavigatorChecked;
                //         menuItem.checked = isShowNavigatorChecked;
                //         console.log('..: Show Navigator clicado');
                //     }
                // },
                { type: 'separator' },
                { label: t('actualSize'), role: 'resetZoom' },
                { label: t('zoomIn'), role: 'zoomIn' },
                { label: t('zoomOut'), role: 'zoomOut' }
            ]
        },
        {
            label: t('window'),
            submenu: [
                { label: t('minimize'), role: 'minimize' }
            ]
        },
        {
            label: t('help'),
            submenu: [
                {
                    label: t('documentation'),
                    click: () => {
                        console.log('..: Documentation clicado');
                        openBrowser('https://sacigamer.github.io/gba-studio-site/docs/intro');
                    }
                },
                {
                    label: t('learnMore'), click: () => {
                        console.log('..: Learn More clicado');
                        openBrowser('https://gbadev.net/getting-started.html/');
                    }
                },
                { type: 'separator' },
                {
                    label: t('about'), click: () => {
                        createAboutWindow();
                        console.log('..: About GBA Studio clicado');
                    }
                },
                {
                    label: 'Check for Updates...',
                    click: () => {
                        void checkForUpdates({
                            currentVersion: packageJson.version,
                            parentWindow: windows.main ?? windows.launcher,
                            showUpToDate: true,
                        });
                    },
                }
            ]
        }
    ]
};

// Função para abrir o navegador
function openBrowser(url: string): void {
    void shell.openExternal(url);
}

function updateTheme(menuItem: MenuItem, theme: string): void {
    // Desmarcar todos os itens de menu
    turnOfCheckedItems(menuItem);

    // Marcar o item selecionado e aplicar o tema
    menuItem.checked = true;
    console.log('..: Mudando tema para: ', theme);
    
    changeTheme(theme);
}

function updateLanguage(menuItem: MenuItem, language: string): void {
    // Desmarcar todos os itens de menu
    turnOfCheckedItems(menuItem);
    menuItem.checked = true;

    console.log('..: Mudando idioma para: ', language);

    updatePreferences('language', language);
    refreshWindowTitle();

    // Envia evento para todas as janelas abertas
    if (windows.main) {
        windows.main.webContents.send('change-language', language);
    }
    if (windows.launcher) {
        windows.launcher.webContents.send('change-language', language);
    }
    if (windows.emulator && !windows.emulator.isDestroyed()) {
        windows.emulator.webContents.send('change-language', language);
    }
    if (windows.runtimeMonitor && !windows.runtimeMonitor.isDestroyed()) {
        windows.runtimeMonitor.webContents.send('change-language', language);
    }

    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate()));

    // Rebuild first, then clear per-window menus. Applying the application menu
    // afterward can restore Electron's default menu on auxiliary windows.
    if (windows.emulator && !windows.emulator.isDestroyed()) {
        windows.emulator.setMenu(null);
        windows.emulator.setMenuBarVisibility(false);
    }
    if (windows.runtimeMonitor && !windows.runtimeMonitor.isDestroyed()) {
        windows.runtimeMonitor.setMenu(null);
        windows.runtimeMonitor.setMenuBarVisibility(false);
    }

}

function turnOfCheckedItems(menuItem: MenuItem): void {
    // Desmarcar todos os itens de menu
    const menu = menuItem.menu;
    menu.items.forEach(item => {
        if (item.checked === true) {
            item.checked = false;
        }
    });
}

export default menuTemplate;

import { exec } from 'child_process';
import { ipcMain, MenuItem, MenuItemConstructorOptions, BrowserWindow } from 'electron';
import { updatePreferences, getPreferences } from './handlers/preferenceHandlers';
import { changeTheme, createAboutWindow, createLauncherWindow, windows } from './main'
import { requestSaveChanges } from './services/saveSettingsService';

let isShowCollisionsChecked = true;
let isShowNavigatorChecked = true;

// Criar um template de menu personalizado
function menuTemplate(): MenuItemConstructorOptions[] {
    // Pegar as preferências salvas
    const preferences = getPreferences();
    const currentTheme = preferences.theme || 'systemDefault';
    const currentLanguage = preferences.language || 'systemDefault';

    return [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Project',
                    accelerator: 'CmdOrCtrl+N', 
                    click: () => {
                        console.log('..: New Project clicado'); 
                        // Trigger the main-process handler directly (same pattern as Open...)
                        try { ipcMain.emit('change-to-launcher', null, 'new_project', false); } catch (e) { console.warn('Failed to emit change-to-launcher', e); }
                    }
                },
                {
                    label: 'Open...',
                    accelerator: 'CmdOrCtrl+O', 
                    click: () => {
                        console.log('..: Open clicado');
                        try { ipcMain.emit('open-project-window'); } catch (e) { console.warn('Failed to emit open-project-window', e); }
                    },
                },
                {
                    label: 'Switch Project',
                    accelerator: 'CmdOrCtrl+P', 
                    click: () => {
                        console.log('..: Switch Project clicado'); 
                        // Trigger the main-process handler directly
                        try { ipcMain.emit('change-to-launcher', null, 'recent_project', false); } catch (e) { console.warn('Failed to emit change-to-launcher', e); }
                    }
                },
                { 
                    label: 'Save', 
                    accelerator: 'CmdOrCtrl+S', 
                    click: () => { 
                        console.log('..: Chamada para save pelo menu'); 
                        requestSaveChanges();
                    } },
                { 
                    label: 'Save As...', 
                    click: () => { console.log('..: Save As clicado'); } 
                },
                { type: 'separator' },
                { label: 'Reload Assets', click: () => { console.log('..: Recarregar Assets clicado'); } },
                { type: 'separator' },
                { label: 'Close', role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { label: 'Undo', role: 'undo' },
                { label: 'Redo', role: 'redo' },
                { type: 'separator' },
                { label: 'Cut', role: 'cut' },
                { label: 'Copy', role: 'copy' },
                { label: 'Past', role: 'paste' },
                { label: 'Past in Place', role: 'pasteAndMatchStyle', click: () => { console.log('..: Past in Place clicado'); } },
                { label: 'Delete', role: 'delete' },
                { label: 'Select All', role: 'selectAll', click: () => { console.log('..: Selecionar Tudo clicado'); } },
                { type: 'separator' },
                {
                    label: 'Spelling and Grammar', submenu: [
                        { label: 'Checke Spelling While Typing', click: () => { console.log('..: Spelling While Typing clicado'); } },
                    ]
                },
                { type: 'separator' },
                { label: 'Preferences...', click: () => { 
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
        {
            label: 'Game',
            submenu: [
                { label: 'Run', click: () => { console.log('..: Run clicado'); } },
                { label: 'Run with Debugging', click: () => { console.log('..: Run with Debugging clicado'); } },
                {
                    label: 'Export As',
                    submenu: [
                        { label: 'Export ROM', click: () => { console.log('..: Export as ROM clicado'); } },
                        { label: 'Exprot WEB', click: () => { console.log('..: Export as WEB clicado'); } },
                        { label: 'Export POCKET', click: () => { console.log('..: Export as POCKET clicado'); } },
                    ]
                },
                { type: 'separator' },
                {
                    label: 'Advanced',
                    submenu: [
                        { label: 'Eject Engine', click: () => { console.log('..: Eject Engine clicado'); } },
                        { type: 'separator' },
                        { label: 'Exprot Project Source', click: () => { console.log('..: Export Project Source clicado'); } },
                        { label: 'Export Project Data', click: () => { console.log('..: Export Project Data clicado'); } },
                    ]
                },
            ]
        },
        {
            label: 'View',
            submenu: [
                { label: 'Game World', accelerator: 'CmdOrCtrl+1', click: () => { console.log('..: Game World clicado'); try { if (windows.main && !windows.main.isDestroyed()) windows.main.webContents.send('change-content-view', 1); } catch (e) { console.warn('Failed to send change-content-view', e); } } },
                { label: 'Tiles Editor', accelerator: 'CmdOrCtrl+2', click: () => { console.log('..: Tiles Editor clicado'); try { if (windows.main && !windows.main.isDestroyed()) windows.main.webContents.send('change-content-view', 2); } catch (e) { console.warn('Failed to send change-content-view', e); } } },
                { label: 'Sprites', accelerator: 'CmdOrCtrl+3', click: () => { console.log('..: Sprites clicado'); try { if (windows.main && !windows.main.isDestroyed()) windows.main.webContents.send('change-content-view', 3); } catch (e) { console.warn('Failed to send change-content-view', e); } } },
                { label: 'Images', accelerator: 'CmdOrCtrl+4', click: () => { console.log('..: Images clicado'); try { if (windows.main && !windows.main.isDestroyed()) windows.main.webContents.send('change-content-view', 4); } catch (e) { console.warn('Failed to send change-content-view', e); } } },
                { label: 'Music', accelerator: 'CmdOrCtrl+5', click: () => { console.log('..: Music clicado'); try { if (windows.main && !windows.main.isDestroyed()) windows.main.webContents.send('change-content-view', 5); } catch (e) { console.warn('Failed to send change-content-view', e); } } },
                { label: 'Sound Effects', accelerator: 'CmdOrCtrl+6', click: () => { console.log('..: Sound Effects clicado'); try { if (windows.main && !windows.main.isDestroyed()) windows.main.webContents.send('change-content-view', 6); } catch (e) { console.warn('Failed to send change-content-view', e); } } },
                { label: 'Palettes', accelerator: 'CmdOrCtrl+7', click: () => { console.log('..: Palettes clicado'); try { if (windows.main && !windows.main.isDestroyed()) windows.main.webContents.send('change-content-view', 7); } catch (e) { console.warn('Failed to send change-content-view', e); } } },
                { label: 'Dialogue Review', accelerator: 'CmdOrCtrl+8', click: () => { console.log('..: Dialogue Review clicado'); try { if (windows.main && !windows.main.isDestroyed()) windows.main.webContents.send('change-content-view', 8); } catch (e) { console.warn('Failed to send change-content-view', e); } } },
                { label: 'Settings', accelerator: 'CmdOrCtrl+9', click: () => { console.log('..: Settings clicado'); try { if (windows.main && !windows.main.isDestroyed()) windows.main.webContents.send('change-content-view', 9); } catch (e) { console.warn('Failed to send change-content-view', e); } } },
                { type: 'separator' },
                {
                    label: 'Theme', submenu: [
                        { label: 'System Default', type: 'checkbox', checked: currentTheme === 'systemDefault', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'systemDefault'); } },
                        { type: 'separator' },
                        { label: 'Light', type: 'checkbox', checked: currentTheme === 'light', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'light'); } },
                        { label: 'Dark', type: 'checkbox', checked: currentTheme === 'dark', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'dark'); } },
                        { label: 'GameCubix', type: 'checkbox',  checked: currentTheme === 'gamecube', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'gamecube'); } },
                        { label: 'S-Nintenbu', type: 'checkbox', checked: currentTheme === 'nintendo', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'nintendo'); } },
                        { label: 'Blue', type: 'checkbox', checked: currentTheme === 'blue', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'blue'); } },
                        { label: 'Silver', type: 'checkbox', checked: currentTheme === 'silver', click: (menuItem: MenuItem) => { updateTheme(menuItem, 'silver'); } },
                    ]
                },
                {
                    label: 'Language', submenu: [
                        { label: 'System Default', type: 'checkbox', checked: currentLanguage === 'systemDefault', click: (menuItem: MenuItem) => updateLanguage(menuItem, 'systemDefault') },
                        { type: 'separator' },
                        { label: 'en_US', type: 'checkbox', checked: currentLanguage === 'en_US', click: (menuItem: MenuItem) => { updateLanguage(menuItem, 'en_US'); } },
                        { label: 'es_ES', type: 'checkbox', checked: currentLanguage === 'es_ES', click: (menuItem: MenuItem) => { updateLanguage(menuItem, 'es_ES'); } },
                        { label: 'fr_FR', type: 'checkbox', checked: currentLanguage === 'fr_FR', click: (menuItem: MenuItem) => { updateLanguage(menuItem, 'fr_FR'); } },
                        { label: 'pt_BR', type: 'checkbox', checked: currentLanguage === 'pt_BR', click: (menuItem: MenuItem) => { updateLanguage(menuItem, 'pt_BR'); } },
                    ]
                },
                { type: 'separator' },
                {
                    label: 'Show Collisions',
                    type: 'checkbox',
                    checked: isShowCollisionsChecked,
                    click: (menuItem: MenuItem) => {
                        isShowCollisionsChecked = !isShowCollisionsChecked;
                        menuItem.checked = isShowCollisionsChecked;
                        console.log('..: Show Collisions clicado');
                    }
                },
                {
                    label: 'Show Connections', submenu: [
                        { label: 'All', click: () => { console.log('..: All clicado'); } },
                        { label: 'Current Scene', click: () => { console.log('..: Current Scene clicado'); } },
                        { type: 'separator' },
                        { label: 'None', click: () => { console.log('..: None clicado'); } },
                    ]
                },
                {
                    label: 'Show Navigator',
                    type: 'checkbox',
                    checked: isShowNavigatorChecked,
                    click: (menuItem: MenuItem) => {
                        isShowNavigatorChecked = !isShowNavigatorChecked;
                        menuItem.checked = isShowNavigatorChecked;
                        console.log('..: Show Navigator clicado');
                    }
                },
                { type: 'separator' },
                { label: 'Actual Size', role: 'resetZoom', click: () => { console.log('..: Actual Size clicado'); } },
                { label: 'Zoom In', role: 'zoomIn', click: () => { console.log('..: Zoon In clicado'); } },
                { label: 'Zoom Out', role: 'zoomOut', click: () => { console.log('..: Zoon Out clicado'); } }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { label: 'Minimise', role: 'minimize', click: () => { console.log('..: Minimise clicado'); } }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Documentation',
                    click: () => {
                        console.log('..: Documentation clicado');
                        openBrowser('https://sacigamer.github.io/gba-studio-site/docs/intro');
                    }
                },
                {
                    label: 'Learn More', click: () => {
                        console.log('..: Learn More clicado');
                        openBrowser('https://gbadev.net/getting-started.html/');
                    }
                },
                { type: 'separator' },
                {
                    label: 'About GBA Studio', click: () => {
                        createAboutWindow();
                        console.log('..: About GBA Studio clicado');
                    }
                },
                { label: 'Check for Updates...', click: () => { console.log('..: Check for Updates clicado'); } }
            ]
        }
    ]
};

// Função para abrir o navegador
function openBrowser(url: string): void {
    const start = process.platform === 'darwin' ? 'open' :
        process.platform === 'win32' ? 'start' :
            'xdg-open';
    exec(`${start} ${url}`);
}

function updateTheme(menuItem: MenuItem, theme: string): void {
    // Desmarcar todos os itens de menu
    turnOfCheckedItems(menuItem);

    // Marcar o item selecionado e aplicar o tema
    menuItem.checked = true;
    console.log('..: Mudando tema para: ', theme);
    
    // Enviar evento para todas as janelas abertas
    if (windows.main) {
        windows.main.webContents.send('change-theme', theme);
    }
    if (windows.launcher) {
        windows.launcher.webContents.send('change-theme', theme);
    }
    
    changeTheme(theme);
}

function updateLanguage(menuItem: MenuItem, language: string): void {
    // Desmarcar todos os itens de menu
    turnOfCheckedItems(menuItem);
    menuItem.checked = true;

    console.log('..: Mudando idioma para: ', language);

    updatePreferences('language', language);

    // Envia evento para todas as janelas abertas
    if (windows.main) {
        windows.main.webContents.send('change-language', language);
    }
    if (windows.launcher) {
        windows.launcher.webContents.send('change-language', language);
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
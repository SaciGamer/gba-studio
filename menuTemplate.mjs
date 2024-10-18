import { exec } from 'child_process';

let isShowCollisionsChecked = true;
let isShowNavigatorChecked = true;

// Criar um template de menu personalizado
const menuTemplate = (createAboutWindow, changeTheme) => [
    {
        label: 'File',
        submenu: [
            { label: 'New Project', click: () => { console.log('..: New Project clicado'); } },
            { label: 'Open...', click: () => { console.log('..: Open clicado'); } },
            { label: 'Switch Project', click: () => { console.log('..: Switch Project clicado'); } },
            { label: 'Save', click: () => { console.log('..: save clicado'); } },
            { label: 'Save As...', click: () => { console.log('..: Save As clicado'); } },
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
                { label: 'Checke Spelling While Typing', click: () => { console.log('..: Eject Engine clicado'); } },
            ]  
            },
            { type: 'separator' },
            { label: 'Preferences...', click: () => { console.log('..: Preferencias clicado'); } }
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
            { label: 'Game World', click: () => { console.log('..: Game World clicado'); } },
            { label: 'Sprites', click: () => { console.log('..: Sprites clicado'); } },
            { label: 'Images', click: () => { console.log('..: Images clicado'); } },
            { label: 'Music', click: () => { console.log('..: Music clicado'); } },
            { label: 'Sound Effects', click: () => { console.log('..: Sound Effects clicado'); } },
            { label: 'Palettes', click: () => { console.log('..: Palettes clicado'); } },
            { label: 'Dialogue Review', click: () => { console.log('..: Dialogue Review clicado'); } },
            { label: 'Settings', click: () => { console.log('..: Settings clicado'); } },
            { type: 'separator' },
            { 
            label: 'Theme', submenu: [
                { label: 'System Default', type: 'checkbox', checked: true, click: (menuItem) => { updateTheme(menuItem, 'systemDefault', changeTheme); } },
                { type: 'separator' },
                { label: 'Light', type: 'checkbox', checked: false, click: (menuItem) => { updateTheme(menuItem, 'light', changeTheme); } },
                { label: 'Dark', type: 'checkbox', checked: false, click: (menuItem) => { updateTheme(menuItem, 'dark', changeTheme); } },
                { label: 'GameCube', type: 'checkbox', checked: false, click: (menuItem) => { updateTheme(menuItem, 'gamecube', changeTheme); } },
                { label: 'Nintendo', type: 'checkbox', checked: false, click: (menuItem) => { updateTheme(menuItem, 'nintendo', changeTheme); } },
                { label: 'Blue', type: 'checkbox', checked: false, click: (menuItem) => { updateTheme(menuItem, 'blue', changeTheme); } },
                { label: 'Silver', type: 'checkbox', checked: false, click: (menuItem) => { updateTheme(menuItem, 'silver', changeTheme); } },
            ]
            },
            { 
            label: 'Language', submenu: [
                { label: 'System Default', click: () => { console.log('..: System Default clicado'); } },
                { type: 'separator' },
                { label: 'en-GB', click: () => { console.log('..: en-GB clicado'); } },
                { label: 'en', click: () => { console.log('..: en clicado'); } },
            ]
            },
            { type: 'separator' },
            { 
                label: 'Show Collisions', 
                type: 'checkbox', 
                checked: isShowCollisionsChecked, 
                click: (menuItem) => { 
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
                click: (menuItem) => { 
                    isShowNavigatorChecked = !isShowNavigatorChecked;
                    menuItem.checked = isShowNavigatorChecked; 
                    console.log('..: Show Navigator clicado');
                }
            },
            { type: 'separator' },
            { label: 'Actual Size', role: 'resetzoom', click: () => { console.log('..: Actual Size clicado'); } },
            { label: 'Zoom In', role: 'zoomin', click: () => { console.log('..: Zoon In clicado'); } },
            { label: 'Zoom Out', role: 'zoomout', click: () => { console.log('..: Zoon Out clicado'); } }
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
                    openBrowser('https://www.google.com/?documentation'); 
                }  
            },
            { 
                label: 'Learn More', click: () => { 
                    console.log('..: Learn More clicado'); 
                    openBrowser('https://gbadev.net/getting-started.html/');  
                }
            },
            { type: 'separator' },
            { label: 'About GBA Studio', click: () => { 
                createAboutWindow(); 
                console.log('..: About GBA Studio clicado'); }  },
            { label: 'Check for Updates...', click: () => { console.log('..: Check for Updates clicado'); }  }
        ]
    }
];

// Função para abrir o navegador
function openBrowser(url) {
    const start = process.platform === 'darwin' ? 'open' :
                  process.platform === 'win32' ? 'start' :
                  'xdg-open';
    exec(`${start} ${url}`);
}

function updateTheme(menuItem, theme, changeTheme) {
    // Desmarcar todos os itens de menu
    const menu = menuItem.menu;
    menu.items.forEach(item => {
      if (item.checked === true) {
          item.checked = false;
      }
    });
    
    // Marcar o item selecionado e aplicar o tema
    menuItem.checked = true;
    changeTheme(theme);
}

export default menuTemplate;
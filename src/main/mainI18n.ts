import { app } from 'electron';

export type SupportedLanguage = 'en_US' | 'es_ES' | 'fr_FR' | 'pt_BR';

const messages: Record<SupportedLanguage, Record<string, string>> = {
  en_US: {
    file: 'File', newProject: 'New Project', open: 'Open...', switchProject: 'Switch Project', save: 'Save', saveAs: 'Save As...', reloadAssets: 'Reload Assets', close: 'Close',
    edit: 'Edit', preferences: 'Preferences...', view: 'View', theme: 'Theme', language: 'Language', systemDefault: 'System Default', light: 'Light', dark: 'Dark', glass: 'Glass', bootstrap: 'Bootstrap', cartoon: 'Cartoon', actualSize: 'Actual Size', zoomIn: 'Zoom In', zoomOut: 'Zoom Out',
    window: 'Window', minimize: 'Minimize', help: 'Help', documentation: 'Documentation', learnMore: 'Learn More', about: 'About GBA Studio',
    world: 'Game World', tiles: 'Tiles Editor', sprites: 'Sprites', images: 'Images', music: 'Music', sounds: 'Sound Effects', palettes: 'Palettes', dialogues: 'Dialogue Review', settings: 'Settings',
  },
  es_ES: {
    file: 'Archivo', newProject: 'Nuevo proyecto', open: 'Abrir...', switchProject: 'Cambiar de proyecto', save: 'Guardar', saveAs: 'Guardar como...', reloadAssets: 'Recargar recursos', close: 'Cerrar',
    edit: 'Editar', preferences: 'Preferencias...', view: 'Ver', theme: 'Tema', language: 'Idioma', systemDefault: 'Predeterminado del sistema', light: 'Claro', dark: 'Oscuro', glass: 'Cristal', bootstrap: 'Bootstrap', cartoon: 'Dibujos', actualSize: 'Tamaño real', zoomIn: 'Acercar', zoomOut: 'Alejar',
    window: 'Ventana', minimize: 'Minimizar', help: 'Ayuda', documentation: 'Documentación', learnMore: 'Más información', about: 'Acerca de GBA Studio',
    world: 'Mundo del juego', tiles: 'Editor de tiles', sprites: 'Sprites', images: 'Imágenes', music: 'Música', sounds: 'Efectos de sonido', palettes: 'Paletas', dialogues: 'Revisión de diálogos', settings: 'Configuración',
  },
  fr_FR: {
    file: 'Fichier', newProject: 'Nouveau projet', open: 'Ouvrir...', switchProject: 'Changer de projet', save: 'Enregistrer', saveAs: 'Enregistrer sous...', reloadAssets: 'Recharger les ressources', close: 'Fermer',
    edit: 'Édition', preferences: 'Préférences...', view: 'Affichage', theme: 'Thème', language: 'Langue', systemDefault: 'Valeur par défaut du système', light: 'Clair', dark: 'Sombre', glass: 'Verre', bootstrap: 'Bootstrap', cartoon: 'Cartoon', actualSize: 'Taille réelle', zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière',
    window: 'Fenêtre', minimize: 'Réduire', help: 'Aide', documentation: 'Documentation', learnMore: 'En savoir plus', about: 'À propos de GBA Studio',
    world: 'Monde du jeu', tiles: 'Éditeur de tuiles', sprites: 'Sprites', images: 'Images', music: 'Musique', sounds: 'Effets sonores', palettes: 'Palettes', dialogues: 'Révision des dialogues', settings: 'Paramètres',
  },
  pt_BR: {
    file: 'Arquivo', newProject: 'Novo projeto', open: 'Abrir...', switchProject: 'Trocar projeto', save: 'Salvar', saveAs: 'Salvar como...', reloadAssets: 'Recarregar recursos', close: 'Fechar',
    edit: 'Editar', preferences: 'Preferências...', view: 'Exibir', theme: 'Tema', language: 'Idioma', systemDefault: 'Padrão do sistema', light: 'Claro', dark: 'Escuro', glass: 'Vidro', bootstrap: 'Bootstrap', cartoon: 'Cartoon', actualSize: 'Tamanho real', zoomIn: 'Aumentar zoom', zoomOut: 'Diminuir zoom',
    window: 'Janela', minimize: 'Minimizar', help: 'Ajuda', documentation: 'Documentação', learnMore: 'Saiba mais', about: 'Sobre o GBA Studio',
    world: 'Mundo do jogo', tiles: 'Editor de tiles', sprites: 'Sprites', images: 'Imagens', music: 'Músicas', sounds: 'Efeitos sonoros', palettes: 'Paletas', dialogues: 'Revisão de diálogos', settings: 'Configurações',
  },
};

export function resolveMainLanguage(language?: string): SupportedLanguage {
  const requested = language === 'systemDefault' || !language ? app.getLocale() : language;
  const normalized = requested.replace('-', '_').toLowerCase();
  if (normalized.startsWith('pt')) return 'pt_BR';
  if (normalized.startsWith('es')) return 'es_ES';
  if (normalized.startsWith('fr')) return 'fr_FR';
  return 'en_US';
}

export function createMainTranslator(language?: string) {
  const locale = resolveMainLanguage(language);
  return (key: string): string => messages[locale][key] ?? messages.en_US[key] ?? key;
}

import { ConfigProvider, Layout, Spin } from 'antd';
import en_US from 'antd/locale/en_US';
import es_ES from 'antd/locale/es_ES';
import fr_FR from 'antd/locale/fr_FR';
import pt_BR from 'antd/locale/pt_BR';
import React, { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { LayoutOutlined } from '@ant-design/icons';
import { Content } from 'antd/es/layout/layout';
import { Locale } from 'antd/es/locale';
import About from './components/pages/about/About';
import Engine from './components/pages/engine/Engine';
import Launcher from './components/pages/launcher/Launcher';
import SplashScreen from './components/pages/splashScreen/SplashScreen';
import Emulator from './components/pages/emulator/Emulator';
import RuntimeMonitor from './components/pages/emulator/RuntimeMonitor';
import PreferencesModal from './components/PreferencesModal';
import './components/themes/globalStyles.css'; // Importe o arquivo CSS global
import Themes from './components/themes/Themes';
import AppProvider from './providers/AppProviders';
import { AppLanguage, I18nProvider, resolveLanguage } from './i18n/I18n';
import { clearImageCache } from './utils/imageCache';
import { clearPaletteTransparentImageCache } from './utils/paletteTransparency';
import { shareInFlightRequest } from './utils/inFlightRequest';

interface Preferences {
  theme: string;
  language: string;
  recentProjects: RecentProject[];
}

interface RecentProject {
  path: string;
  name: string;
  lastOpened: Date;
}

const App: React.FC = () => {
  const [theme, setTheme] = useState<any>();
  const [themeName, setThemeName] = useState('light');
  const [themePreference, setThemePreference] = useState('systemDefault');
  const [locale, setLocale] = useState<Locale>(en_US);
  const [language, setLanguage] = useState<AppLanguage>('en_US');

  const [isLoading, setIsLoading] = useState(true);
  const [prefsOpen, setPrefsOpen] = useState(false);

  useEffect(() => {
    const hideButtonFocusRing = (event: KeyboardEvent) => {
      if (event.key === 'Escape') document.documentElement.setAttribute('data-hide-button-focus-ring', 'true');
    };
    const restoreButtonFocusRing = () => document.documentElement.removeAttribute('data-hide-button-focus-ring');
    const handleFormTabNavigation = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') restoreButtonFocusRing();
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
      if (/^#\/engine(?:\/|$)/.test(window.location.hash)) return;
      const active = document.activeElement as HTMLElement | null;
      const scope = active?.closest<HTMLElement>('[role="dialog"], .ant-modal, .ant-drawer-content-wrapper') ?? document;
      const controls = Array.from(scope.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not(:disabled), textarea:not(:disabled), select:not(:disabled), [contenteditable="true"], [role="combobox"], [role="checkbox"], [role="radio"], [role="switch"], [role="slider"]',
      )).filter(control => control.tabIndex >= 0
        && control.getAttribute('aria-disabled') !== 'true'
        && !control.closest('[aria-hidden="true"], [inert]')
        && control.getClientRects().length > 0);
      event.preventDefault();
      if (!controls.length) return;
      const activeIndex = controls.findIndex(control => control === active || control.contains(active));
      const nextIndex = activeIndex < 0
        ? event.shiftKey ? controls.length - 1 : 0
        : (activeIndex + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      controls[nextIndex].focus();
    };
    document.addEventListener('keydown', hideButtonFocusRing, true);
    document.addEventListener('pointerdown', restoreButtonFocusRing, true);
    document.addEventListener('keydown', handleFormTabNavigation, true);
    return () => {
      document.removeEventListener('keydown', hideButtonFocusRing, true);
      document.removeEventListener('pointerdown', restoreButtonFocusRing, true);
      document.removeEventListener('keydown', handleFormTabNavigation, true);
      restoreButtonFocusRing();
    };
  }, []);

  const applyThemePreference = (preference: string) => {
    const resolvedTheme = preference === 'systemDefault'
      ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : Themes[preference] ? preference : 'light';
    setThemePreference(preference);
    setTheme(Themes[resolvedTheme]);
    setThemeName(resolvedTheme);
  };

  // Carregar preferências iniciais --------------------------------
  // Função auxiliar para carregar o locale
  const loadLocale = async (language: string) => {
    try {
      const resolvedLanguage = resolveLanguage(language);
      let localeModule;
      switch (resolvedLanguage) {
        case 'pt_BR':
          localeModule = pt_BR;
          break;
        case 'es_ES':
          localeModule = es_ES;
          break;
        case 'fr_FR':
          localeModule = fr_FR;
          break;
        case 'en_US':
        default:
          localeModule = en_US;
      }
      console.log('..: Carregando idioma: ', resolvedLanguage);
      setLanguage(resolvedLanguage);
      setLocale(localeModule);
    } catch (error) {
      console.error('Erro ao carregar idioma:', error);
      setLocale(en_US); // Fallback para inglês
    }
  };

  useEffect(() => {
    console.log('..: USE EFFECT loadPreferences ENTROU :..');

    if (!window.electronAPI) {
      console.error('window.electronAPI is undefined');
      return;
    }

    const loadPreferences = async () => {
      await shareInFlightRequest('app:initial-preferences', async () => {
        const preferencias: Preferences = await window.electronAPI.loadPreferences();
        // Carrega tema
        console.log('..: Carregando Tema: ', preferencias.theme);
        applyThemePreference(preferencias.theme || 'systemDefault');

        // Carrega idioma
        const language = preferencias.language || 'systemDefault';
        loadLocale(language);
        setIsLoading(false);
      });
    };

    loadPreferences();
  }, []);
  // Carregar preferências iniciais END ----------------------------

  // Evento para CHANGE THEME --------------------------------------
  useEffect(() => {
    if (!window.electronAPI) return;

    const themeChangeHandler = (event: any, newTheme: string) => {
      applyThemePreference(newTheme);
    };

    window.electronAPI.on('change-theme', themeChangeHandler);
    return () => window.electronAPI.removeListener('change-theme', themeChangeHandler);
  }, []);
  // Evento para CHANGE THEME END ----------------------------------

  useEffect(() => {
    const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!systemTheme) return;
    const handleSystemThemeChange = () => {
      if (themePreference === 'systemDefault') applyThemePreference('systemDefault');
    };
    systemTheme.addEventListener('change', handleSystemThemeChange);
    return () => systemTheme.removeEventListener('change', handleSystemThemeChange);
  }, [themePreference]);

  // Assets are cached across navigation so returning to Game World is instant.
  // Reload Assets is the explicit escape hatch that invalidates those caches.
  useEffect(() => {
    if (!window.electronAPI) return;
    const notifyAssetsReloaded = () => {
      clearImageCache();
      clearPaletteTransparentImageCache();
      window.dispatchEvent(new Event('gba-studio:assets-reloaded'));
    };
    const reloadAssets = () => notifyAssetsReloaded();
    const handleWatchedAssets = () => notifyAssetsReloaded();
    window.electronAPI.on('reload-assets', reloadAssets);
    window.electronAPI.on('update-images', handleWatchedAssets);
    return () => {
      window.electronAPI.removeListener('reload-assets', reloadAssets);
      window.electronAPI.removeListener('update-images', handleWatchedAssets);
    };
  }, []);

  // Evento para CHANGE LANGUAGE 
  useEffect(() => {
    if (!window.electronAPI) return;

    const languageChangeHandler = (event: any, newLanguage: string) => {
      loadLocale(newLanguage);
    };

    window.electronAPI.on('change-language', languageChangeHandler);
    return () => window.electronAPI.removeListener('change-language', languageChangeHandler);
  }, []);
  // Evento para CHANGE LANGUAGE END -------------------------------

  // Efeito PRETO/BRANCO tela inativa ------------------------------
  const [isWindowActive, setIsWindowActive] = useState(true);

  useEffect(() => {
    const handleWindowBlurred = () => {
      setIsWindowActive(false);
    };

    const handleWindowFocused = () => {
      setIsWindowActive(true);
    };

    const handleOpenPreferences = () => {
      setPrefsOpen(true);
    };

    // Adiciona os listeners
    window.electronAPI.on('window-blurred', handleWindowBlurred);
    window.electronAPI.on('window-focused', handleWindowFocused);
    window.electronAPI.on('open-preferences', handleOpenPreferences);

    // Limpa os listeners ao desmontar o componente
    return () => {
      window.electronAPI.removeListener('window-blurred', handleWindowBlurred);
      window.electronAPI.removeListener('window-focused', handleWindowFocused);
      window.electronAPI.removeListener('open-preferences', handleOpenPreferences);
    };
  }, []);
  // Efeito PRETO/BRANCO tela inativa END -------------------------

  const createHolder = (node: HTMLElement) => {
    const { borderWidth } = getComputedStyle(node);
    const borderWidthNum = parseInt(borderWidth, 10);

    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.inset = `-${borderWidthNum}px`;
    div.style.borderRadius = 'inherit';
    div.style.background = 'transparent';
    div.style.zIndex = '999';
    div.style.pointerEvents = 'none';
    div.style.overflow = 'hidden';
    node.appendChild(div);

    return div;
  };

  const createDot = (holder: HTMLElement, color: string, left: number, top: number, size = 0) => {
    const dot = document.createElement('div');
    dot.style.position = 'absolute';
    dot.style.left = `${left}px`;
    dot.style.top = `${top}px`;
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.borderRadius = '50%';
    dot.style.background = color;
    dot.style.transform = 'translate(-50%, -50%)';
    dot.style.transition = 'all 1s ease-out';
    holder.appendChild(dot);

    return dot;
  };

  if (isLoading) {
    return (
      <ConfigProvider theme={theme} locale={locale} select={{ showSearch: true }}>
        <Layout style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Spin size="large" percent={'auto'} indicator={<LayoutOutlined spin />} />
        </Layout>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider
      theme={theme}
      locale={locale}
      select={{ showSearch: true }}
    // wave={{
    //   disabled: false, // Desabilitar o efeito de onda
    //   showEffect: (node, { event, component }) => {
    //     if (component !== 'Button') {
    //       return;
    //     }

    //     const holder = createHolder(node);

    //     const rect = holder.getBoundingClientRect();

    //     const left = event.clientX - rect.left;
    //     const top = event.clientY - rect.top;

    //     const dot = createDot(holder, 'rgba(255, 255, 255, 0.65)', left, top);

    //     // Motion
    //     requestAnimationFrame(() => {
    //       dot.ontransitionend = () => {
    //         holder.remove();
    //       };

    //       dot.style.width = '200px';
    //       dot.style.height = '200px';
    //       dot.style.opacity = '0';
    //     });
    //   },
    // }}
    // floatButtonGroup={{ size: 'large' }}
    >
      <I18nProvider language={language}>
        <AppProvider>
          <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Content className={`gba-theme gba-theme-${themeName}`} data-theme={themeName} style={{ height: '100vh', filter: isWindowActive ? 'none' : 'grayscale(100%)' }}>
              <Routes>
                <Route path="/launcher" element={<Launcher />} />
                <Route path="/engine" element={<Engine />} />
                <Route path="/splash" element={<SplashScreen />} />
                <Route path="/emulator" element={<Emulator />} />
                <Route path="/runtime-monitor" element={<RuntimeMonitor />} />
                <Route path="/about" element={<About />} />
                <Route path="*" element={<Navigate to="/launcher" replace />} />
              </Routes>
            </Content>
          </HashRouter>
        </AppProvider>
        <PreferencesModal open={prefsOpen} onClose={() => setPrefsOpen(false)} />
      </I18nProvider>
    </ConfigProvider>
  );
}

export default App;

import React, { useEffect } from 'react';
import { Route, Routes, Navigate, HashRouter } from 'react-router-dom';
import { useState } from 'react';
import { ConfigProvider, Layout, Spin } from 'antd';
import en_US from 'antd/locale/en_US';

import './components/themes/globalStyles.css';  // Importe o arquivo CSS global
import { LayoutOutlined } from '@ant-design/icons';
import { Content } from 'antd/es/layout/layout';
import Themes from './components/themes/Themes';
import SplashScreen from './components/pages/splashScreen/SplashScreen';
import Launcher from './components/pages/launcher/Launcher';
import About from './components/pages/about/About';
import Engine from './components/pages/engine/Engine';
import AppProvider from './providers/AppProviders';
import PreferencesModal from './components/PreferencesModal';

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
  const [locale, setLocale] = useState(en_US);

  const [isLoading, setIsLoading] = useState(true);
  const [prefsOpen, setPrefsOpen] = useState(false);

  // Carregar preferências iniciais --------------------------------
  useEffect(() => {
    console.log('..: USE EFFECT ENTROU :..');

    if (!window.electronAPI) {
      console.error('window.electronAPI is undefined');
      return;
    }

    const loadPreferences = async () => {
      await window.electronAPI.loadPreferences().then((preferencias: Preferences) => {
        // Carrega tema
        console.log('..: Carregando Tema: ', preferencias.theme);
        if (Themes[preferencias.theme]) {
          setTheme(Themes[preferencias.theme]);
        } else {
          console.error(`Theme ${preferencias.theme} not found, falling back to default.`);
          setTheme(Themes.light);
        }

        // Carrega idioma
        const language = preferencias.language || 'en_US';
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
      setTheme(Themes[newTheme]);
    };

    window.electronAPI.on('change-theme', themeChangeHandler);
    return () => window.electronAPI.removeListener('change-theme', themeChangeHandler);
  }, []);
  // Evento para CHANGE THEME END ----------------------------------

  // Efeito PRETO/BRANCO tela inativa ------------------------------
  const [isWindowActive, setIsWindowActive] = useState(true);

  useEffect(() => {
    const handleWindowBlurred = () => {
      setIsWindowActive(false);
    };

    const handleWindowFocused = () => {
      setIsWindowActive(true);
    };

    // Adiciona os listeners
    window.electronAPI.on('window-blurred', handleWindowBlurred);
    window.electronAPI.on('window-focused', handleWindowFocused);
  window.electronAPI.on('open-preferences', () => setPrefsOpen(true));

    // Limpa os listeners ao desmontar o componente
    return () => {
      window.electronAPI.removeListener('window-blurred', handleWindowBlurred);
      window.electronAPI.removeListener('window-focused', handleWindowFocused);
  window.electronAPI.removeListener('open-preferences', () => setPrefsOpen(true));
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

  // Função auxiliar para carregar o locale
  const loadLocale = async (language: string) => {
    try {
      let localeModule;
      switch (language) {
        case 'pt_BR':
          localeModule = await import('antd/locale/pt_BR');
          break;
        case 'es_ES':
          localeModule = await import('antd/locale/es_ES');
          break;
        case 'fr_FR':
          localeModule = await import('antd/locale/fr_FR');
          break;
        case 'en_US':
        default:
          localeModule = await import('antd/locale/en_US');
      }
      setLocale(localeModule.default);
    } catch (error) {
      console.error('Erro ao carregar idioma:', error);
      setLocale(en_US); // Fallback para inglês
    }
  };

  if (isLoading) {
    return (
      <ConfigProvider theme={theme} locale={locale}>
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
      <AppProvider>
        <HashRouter>
          <Content style={{ height: '100vh', filter: isWindowActive ? 'none' : 'grayscale(100%)' }}>
            <Routes>
              <Route path="/launcher" element={<Launcher />} />
              <Route path="/engine" element={<Engine />} />
              <Route path="/splash" element={<SplashScreen />} />
              <Route path="/about" element={<About />} />
              <Route path="*" element={<Navigate to="/launcher" replace />} />
            </Routes>
          </Content>
        </HashRouter>
      </AppProvider>
  <PreferencesModal open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </ConfigProvider>
  );
}

export default App;

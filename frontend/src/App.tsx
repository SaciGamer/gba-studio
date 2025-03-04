import React, { Component, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, redirect, Navigate } from 'react-router-dom';
import Launcher from './components/launcher/Launcher.tsx';
import Engine from './components/engine/Engine.tsx'; // Novo componente para project.html
import { useState } from 'react';
import Themes from './components/themes/Themes.tsx';
import { ConfigProvider, Spin, TooltipProps} from 'antd';
import en_US from 'antd/locale/en_US';

import './components/themes/globalStyles.css';  // Importe o arquivo CSS global
import { LayoutOutlined } from '@ant-design/icons';
import { Content } from 'antd/es/layout/layout';
import SplashScreen from './components/splashScreen/SplashScreen.tsx';

const App: React.FC = () => {
  const [theme, setTheme] = useState(Themes[``]);
  const [locale, setLocale] = useState(en_US);

  const [isLoading, setIsLoading] = useState(true);

  // Carregar preferências iniciais --------------------------------
  useEffect(() => {
    if (!window.electronAPI) {
      console.error('window.electronAPI is undefined');
      return;
    }

    const loadPreferences = async () => {
      await window.electronAPI.loadPreferences().then(preferencias => {
        // Carrega tema
        console.log('..: Carregando Tema: ', preferencias.theme);
        setTheme(Themes[preferencias.theme]);

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
  
    // Limpa os listeners ao desmontar o componente
    return () => {
      window.electronAPI.removeListener('window-blurred', handleWindowBlurred);
      window.electronAPI.removeListener('window-focused', handleWindowFocused);
    };
  }, []);
  // Efeito PRETO/BRANCO tela inativa END -------------------------

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
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" percent={'auto'} indicator={<LayoutOutlined spin/>} tip="Carregando..." />
      </div>
    );
  }

  return (
    <Router>
      <ConfigProvider 
        theme={theme} 
        locale={locale} 
      >
        <Content style={{ height: '100vh', filter: isWindowActive ? 'none' : 'grayscale(100%)' }}>
          <Routes>
            <Route path="/launcher" element={<Launcher />} />
            <Route path="/engine" element={<Engine />} />
            <Route path="/splash" element={<SplashScreen />} />
            <Route path="*" element={<Navigate to="/launcher" />} />
          </Routes>
        </Content>
      </ConfigProvider>
    </Router>
  );
}

export default App;

import React, { useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, redirect, Navigate } from 'react-router-dom';
import Launcher from './components/launcher/Launcher.tsx';
import Engine from './components/engine/Engine.tsx'; // Novo componente para project.html
import { useState } from 'react';
import Themes from './components/themes/Themes.tsx';
import { ConfigProvider} from 'antd';

import './components/themes/globalStyles.css';  // Importe o arquivo CSS global

const App: React.FC = () => {
  // CHANGE THEME ------------------------------------------------
  const [theme, setTheme] = useState(Themes[``]);

  useEffect(() => {
    if (window.electronAPI) {  // Verifica se electronAPI está definida
      window.electronAPI.loadPreferences().then(preferencias => { 
        console.log("..: Carregando Tema: %s", preferencias.theme);
        setTheme(Themes[preferencias.theme]); 
      }); 
    } else { 
      console.error('window.electronAPI is undefined');  // Mensagem de erro se não definida
    }
  }, []);

  useEffect(() => {
    if (window.electronAPI) {  // Verifica se electronAPI está definido
        window.electronAPI.on('change-theme', (event, newTheme) => {
        // console.log("..: mudando tema: data-theme=%s", newTheme);
        setTheme(Themes[newTheme]);
        // document.documentElement.setAttribute(`data-theme`, newTheme);
      });

      return () => {
          window.electronAPI.removeListener('change-theme', (event, newTheme) => {
          // document.documentElement.setAttribute('data-theme', newTheme);
        });
      };
    } else { 
      console.error('window.electronAPI is undefined');  // Mensagem de erro se não definido
    }
  }, []);
  // CHANGE THEME END ----------------------------------------------

  return (
    <Router>
      <ConfigProvider theme={theme}>
        <Routes>
          <Route path="/launcher" element={<Launcher />} />
          <Route path="/engine" element={<Engine />} />
          <Route path="*" element={<Navigate to="/launcher"/> } />
        </Routes>
      </ConfigProvider>
    </Router>
  );
}

export default App;

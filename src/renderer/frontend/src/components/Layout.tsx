import React from 'react';
import Editor from './Editor';
import Emulator from './Emulator';
import AssetManager from './AssetManager';
import Toolbar from './Toolbar';

const Layout: React.FC = () => {
  return (
    <div className="layout">
      <Toolbar />
      <div className="main-content">
        <Editor />
        <Emulator />
      </div>
      <AssetManager />
    </div>
  );
};

export default Layout;

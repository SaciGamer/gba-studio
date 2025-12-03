import React from 'react';
import { ipcRenderer } from 'electron';
import { useBuildState } from '../providers/BuildStateProvider';

const Toolbar: React.FC = () => {
  const { isBuilding, isRunning, setBuilding } = useBuildState();

  const handleCompile = () => {
    setBuilding(true);
    ipcRenderer.send('compile-project');
    // actual completion is handled via compile-progress / compile-error events
  };

  const handleRun = () => {
    ipcRenderer.send('run-project');
  };

  return (
    <div className="toolbar">
      <button className="gb-button">New Project</button>
      <button className="gb-button">Open...</button>
      <button className="gb-button">Save</button>
      <button className="gb-button">Save As...</button>
      <button className="gb-button" onClick={handleCompile} disabled={isBuilding || isRunning}>
        {isBuilding ? 'Processando...' : 'Compilar'}
      </button>
      <button className="gb-button" onClick={handleRun} disabled={isBuilding}>Run</button>
    </div>
  );
};

export default Toolbar;

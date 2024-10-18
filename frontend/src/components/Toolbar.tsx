import React, { useState } from 'react';
import { ipcRenderer } from 'electron';

const Toolbar: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  
  const handleCompile = () => {
    setIsProcessing(true);
    ipcRenderer.send('compile-project');
    setIsProcessing(false);
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
      <button className="gb-button" onClick={handleCompile} disabled={isProcessing}>
        {isProcessing ? 'Processando...' : 'Compilar'}
      </button>
      <button className="gb-button" onClick={handleRun}>Run</button>
    </div>
  );
};

export default Toolbar;

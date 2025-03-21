import { ipcRenderer } from 'electron';
import React from 'react';

const Emulator: React.FC = () => {
  const handleStartEmulator = () => {
    const romPath = 'gba-project/build/rom/gba-project.gba';
    ipcRenderer.send('launch-emulator', romPath);
  };

  return (
    <div className="emulator">
      <h2>GBA Emulator</h2>
      <div className="emulator-screen"></div>
      <button className="gb-button" onClick={handleStartEmulator}>Start Emulator</button>
    </div>
  );
};

export default Emulator;

import React, { createContext, useContext, useEffect, useState } from 'react';

interface BuildState {
  isBuilding: boolean;
  isRunning: boolean;
  setBuilding: (v: boolean) => void;
  setRunning: (v: boolean) => void;
}

const BuildStateContext = createContext<BuildState | undefined>(undefined);

export const BuildStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isBuilding, setIsBuilding] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!window.electronAPI || !window.electronAPI.on) return;

    const compileProgress = (_e: any, payload: any) => {
      try {
        const status = payload && payload.status ? payload.status : null;
        if (status === 'started' || status === 'running') setIsBuilding(true);
        if (status === 'finished') setIsBuilding(false);
      } catch (e) {}
    };

    const compileError = () => {
      setIsBuilding(false);
    };

    const emulatorStarted = () => setIsRunning(true);
    const emulatorStopped = () => setIsRunning(false);

    window.electronAPI.on('compile-progress', compileProgress);
    window.electronAPI.on('compile-error', compileError);
    window.electronAPI.on('emulator-started', emulatorStarted);
    window.electronAPI.on('emulator-stopped', emulatorStopped);

    return () => {
      try { window.electronAPI.removeListener('compile-progress', compileProgress); } catch (e) {}
      try { window.electronAPI.removeListener('compile-error', compileError); } catch (e) {}
      try { window.electronAPI.removeListener('emulator-started', emulatorStarted); } catch (e) {}
      try { window.electronAPI.removeListener('emulator-stopped', emulatorStopped); } catch (e) {}
    };
  }, []);

  const setBuilding = (v: boolean) => setIsBuilding(v);
  const setRunning = (v: boolean) => setIsRunning(v);

  return (
    <BuildStateContext.Provider value={{ isBuilding, isRunning, setBuilding, setRunning }}>
      {children}
    </BuildStateContext.Provider>
  );
};

export function useBuildState() {
  const ctx = useContext(BuildStateContext);
  if (!ctx) throw new Error('useBuildState must be used within BuildStateProvider');
  return ctx;
}

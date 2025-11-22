import * as React from 'react';
const { useEffect, useState } = React;

const BottomPanel: React.FC = () => {
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
  const api = (window as any).electronAPI;
  if (!api || !api.on) return;

    const progressHandler = (_event: any, payload: any) => {
      try {
        const msg = payload && payload.message ? String(payload.message) : JSON.stringify(payload);
        setStatusLines((s) => [...s.slice(-30), msg]);
        if (payload && payload.status === 'running') setIsRunning(true);
        if (payload && payload.status === 'finished') setIsRunning(false);
        if (payload && payload.status === 'started') setIsRunning(true);
      } catch (e) { /* ignore */ }
    };

    const errorHandler = (_event: any, payload: any) => {
      try {
        const msg = payload && payload.message ? String(payload.message) : JSON.stringify(payload);
        setError(msg);
        setIsRunning(false);
        setStatusLines((s) => [...s.slice(-30), `ERROR: ${msg}`]);
      } catch (e) { /* ignore */ }
    };

  api.on('compile-progress', progressHandler);
  api.on('compile-error', errorHandler);

    return () => {
  try { api.removeListener('compile-progress', progressHandler); } catch (e) { }
  try { api.removeListener('compile-error', errorHandler); } catch (e) { }
    };
  }, []);

  return (
    <div className="h-64 bg-gray-800 p-4">
      <div className="bg-black w-full h-full flex flex-col text-white p-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-medium">Emulator Placeholder</div>
          <div className="text-sm">
            {isRunning ? <span>Compilando...</span> : <span>Ocioso</span>}
          </div>
        </div>

        <div className="mt-2 flex-1 overflow-auto text-xs font-mono">
          {statusLines.length === 0 ? (
            <div className="text-gray-400">Aguardando ações do compilador...</div>
          ) : (
            statusLines.map((l, i) => (
              <div key={i} className={l.startsWith('ERROR') ? 'text-red-400' : 'text-white'}>{l}</div>
            ))
          )}
        </div>

        {error && (
          <div className="mt-2 text-red-300 text-sm">Erro na compilação: {error}</div>
        )}
      </div>
    </div>
  );
};

export default BottomPanel;

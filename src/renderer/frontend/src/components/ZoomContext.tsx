import React, { createContext, useState, ReactNode, useContext } from 'react';

interface ZoomContextType {
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
}

const ZoomContext = createContext<ZoomContextType | undefined>(undefined);

interface ZoomProviderProps {
  children: ReactNode;
}

export const ZoomProvider: React.FC<ZoomProviderProps> = ({ children }) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  return (
    <ZoomContext.Provider value={{ zoomLevel, setZoomLevel }}>
      {children}
    </ZoomContext.Provider>
  );
};

export const useZoomContext = () => {
  const context = useContext(ZoomContext);
  if (context === undefined) {
    throw new Error('useZoomContext must be used within a ZoomProvider');
  }
  return context;
};

export default ZoomContext;
import React from 'react';

const DragAndDrop: React.FC<{ onDrop: (event: DragEvent) => void, height: number, width: number }> = ({ onDrop, height, width }) => {
  const handleDragOver = (e: any) => {
    e.preventDefault();
  };

  const handleDrop = (e: any) => {
    e.preventDefault();
    if (onDrop) {
      onDrop(e);
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ /*background: 'red', */position: 'absolute', top: 0, left: 0, height: `${height}px`, width: `${width}px` }}
    >
      {/* Arraste a imagem aqui */}
    </div>
  );
};

export default DragAndDrop;
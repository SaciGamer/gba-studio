import React from 'react';

const Editor: React.FC = () => {
  return (
    <div className="editor">
      <h2>Code Editor</h2>
      <textarea rows={20} cols={50}></textarea>
    </div>
  );
};

export default Editor;

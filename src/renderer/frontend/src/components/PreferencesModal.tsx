import React, { useEffect, useState } from 'react';
import { Modal, Input, Button, Space, message } from 'antd';

const PreferencesModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [devkitPath, setDevkitPath] = useState('');
  const [emulatorPath, setEmulatorPath] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const dk = await window.electronAPI.getDevkitPath();
        const em = await window.electronAPI.getEmulatorPath();
        setDevkitPath(dk || '');
        setEmulatorPath(em || '');
      } catch (err) {
        console.error(err);
      }
    })();
  }, [open]);

  const importDevkit = async () => {
    setLoading(true);
    try {
      // Let user select folder via selectFolder (opens a dialog)
      const res = await window.electronAPI.selectFolder();
      if (res && res.filePath) {
        const importRes = await window.electronAPI.importVendor('devkitPro', res.filePath);
        if (importRes.success) message.success('devkitPro imported');
        else message.error(importRes.message || 'Import failed');
      }
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  const importMgba = async () => {
    setLoading(true);
    try {
      const res = await window.electronAPI.selectFolder();
      if (res && res.filePath) {
        const importRes = await window.electronAPI.importVendor('mGBA', res.filePath);
        if (importRes.success) message.success('mGBA imported');
        else message.error(importRes.message || 'Import failed');
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const save = async () => {
    setLoading(true);
    try {
      await window.electronAPI.setDevkitPath(devkitPath);
      await window.electronAPI.setEmulatorPath(emulatorPath);
      message.success('Preferences saved');
      onClose();
    } catch (err) {
      message.error('Failed to save preferences');
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} title="Preferences" onCancel={onClose} footer={null}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div>
          <label>DEVKITARM path</label>
          <Input value={devkitPath} onChange={(e) => setDevkitPath(e.target.value)} placeholder="Path to devkitPro/devkitARM" />
          <Button style={{ marginTop: 8 }} onClick={importDevkit} loading={loading}>Import devkit from disk</Button>
        </div>

        <div>
          <label>Emulator path</label>
          <Input value={emulatorPath} onChange={(e) => setEmulatorPath(e.target.value)} placeholder="Path to emulator executable" />
          <Button style={{ marginTop: 8 }} onClick={importMgba} loading={loading}>Import mGBA from disk</Button>
        </div>

        <div style={{ textAlign: 'right' }}>
          <Button onClick={onClose} style={{ marginRight: 8 }}>Cancel</Button>
          <Button type="primary" onClick={save} loading={loading}>Save</Button>
        </div>
      </Space>
    </Modal>
  );
};

export default PreferencesModal;

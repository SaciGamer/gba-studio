import React, { useEffect, useState } from 'react';
import { Modal, Input, Button, Space, message, Form, Tag, Divider, Typography } from 'antd';
import { FolderOutlined, CheckCircleOutlined, ExclamationCircleOutlined, CloudDownloadOutlined } from '@ant-design/icons';

const PreferencesModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [tempBuildPath, setTempBuildPath] = useState('');
  const [tempProjectBackupLimit, setTempProjectBackupLimit] = useState<number | ''>(5);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const tb = await window.electronAPI.getTempBuildPath();
        const backupLimit = await window.electronAPI.getTempProjectBackupLimit();
        setTempBuildPath(tb || '');
        setTempProjectBackupLimit(backupLimit ?? 5);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [open]);

  const selectTempBuildPath = async () => {
    try {
      const res = await window.electronAPI.selectFolder();
      if (res && res.filePath) {
        setTempBuildPath(res.filePath);
      }
    } catch (err) {
      console.error(err);
      message.error('Failed to select temp build path');
    }
  };

  const save = async () => {
    setLoading(true);
    try {
      // await window.electronAPI.setDevkitPath(devkitPath);
      await window.electronAPI.setTempBuildPath(tempBuildPath);
      await window.electronAPI.setTempProjectBackupLimit(Number(tempProjectBackupLimit || 0));
      message.success('Preferences saved');
      onClose();
    } catch (err) {
      message.error('Failed to save preferences');
    } finally { 
      setLoading(false); 
    }
  };

  const clearTemporaryData = async () => {
    const confirmed = window.confirm('This will clear temporary project data. The currently open project sandbox will be preserved. Continue?');
    if (!confirmed) {
      return;
    }

    try {
      await window.electronAPI.clearTempProjectData();
      message.success('Temporary project data cleared');
    } catch (err) {
      console.error(err);
      message.error('Failed to clear temporary project data');
    }
  };

  return (
    <Modal open={open} title="Preferences" onCancel={onClose} footer={null} width={800}>
      <Form layout="vertical">
        <Space direction="vertical" size={0} style={{ marginBottom: 24, display: 'flex' }}>
          <Typography.Text strong>GBA Studio Configuration</Typography.Text>
          <Typography.Text type="secondary">General configurations to GBA Studio build.</Typography.Text>
        </Space>

        <Divider>Build Configuration</Divider>
        {/* Temporary Build Path */}
        <Form.Item 
          label="Temporary Build Path" 
          required
        >
          <Space.Compact style={{ width: '100%' }}>
            <Input 
              value={tempBuildPath} 
              onChange={(e) => setTempBuildPath(e.target.value)} 
              placeholder="Where to store temporary build files"
              readOnly
            />
            <Button icon={<FolderOutlined />} onClick={selectTempBuildPath}>Browse</Button>
          </Space.Compact>
        </Form.Item>

        <Form.Item label="Temporary Project Backups Limit">
          <Input
            type="number"
            min={0}
            max={50}
            step={1}
            value={tempProjectBackupLimit}
            onChange={(e) => setTempProjectBackupLimit(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="Maximum temp project backups to keep"
          />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button danger onClick={clearTemporaryData}>Clear Temp Folder</Button>
          </Space>
        </Form.Item>

        {/* Action Buttons */}
        <Form.Item>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" onClick={save} loading={loading}>Save</Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default PreferencesModal;

import React, { useEffect, useState } from 'react';
import { Modal, Input, Button, Space, message, Form, Tag, Divider, Typography } from 'antd';
import { FolderOutlined, CheckCircleOutlined, ExclamationCircleOutlined, CloudDownloadOutlined } from '@ant-design/icons';

const PreferencesModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [devkitPath, setDevkitPath] = useState('');
  const [tempBuildPath, setTempBuildPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [devkitValid, setDevkitValid] = useState<boolean | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const dk = await window.electronAPI.getDevkitPath();
        const tb = await window.electronAPI.getTempBuildPath();
        setDevkitPath(dk || '');
        setTempBuildPath(tb || '');
        
        // Validar caminhos
        if (dk) {
          const isValid = await window.electronAPI.checkToolsExe('devkitPro', 'devkitARM/bin/arm-none-eabi-gcc.exe');
          setDevkitValid(isValid);
        } else {
          setDevkitValid(false);
        }
        
      } catch (err) {
        console.error(err);
      }
    })();
  }, [open]);

  const selectDevkitPath = async () => {
    try {
      const res = await window.electronAPI.selectFolder();
      if (res && res.filePath) {
        setDevkitPath(res.filePath);
      }
    } catch (err) {
      console.error(err);
      message.error('Failed to select devkit path');
    }
  };

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

  const downloadDevkitPro = async () => {
    setDownloading(true);
    try {
      message.info('DevKit Pro download not yet implemented. Please configure path manually or use Import Tools.');
    } catch (err) {
      console.error(err);
      message.error('Failed to download DevKit Pro');
    } finally {
      setDownloading(false);
    }
  };

  const getStatusTag = (isValid: boolean | null) => {
    if (isValid === null) return null;
    if (isValid) return <Tag icon={<CheckCircleOutlined />} color="success">Valid</Tag>;
    return <Tag icon={<ExclamationCircleOutlined />} color="error">Invalid</Tag>;
  };

  const save = async () => {
    setLoading(true);
    try {
      await window.electronAPI.setDevkitPath(devkitPath);
      await window.electronAPI.setTempBuildPath(tempBuildPath);
      message.success('Preferences saved');
      onClose();
    } catch (err) {
      message.error('Failed to save preferences');
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <Modal open={open} title="Preferences" onCancel={onClose} footer={null} width={800}>
      <Form layout="vertical">
        <Space direction="vertical" size={0} style={{ marginBottom: 24, display: 'flex' }}>
          <Typography.Text strong>GBA Studio Configuration</Typography.Text>
          <Typography.Text type="secondary">Configure paths for DevKit Pro, temporary build files.</Typography.Text>
        </Space>

        <Divider>Development Tools</Divider>

        {/* DevkitARM Path */}
        <Form.Item 
          label={
            <Space>
              <span>DevKitARM Path</span>
              {getStatusTag(devkitValid)}
            </Space>
          } 
          required
        >
          <Space.Compact style={{ width: '100%' }}>
            <Input 
              value={devkitPath} 
              onChange={(e) => setDevkitPath(e.target.value)} 
              placeholder="Path to devkitPro/devkitARM"
              readOnly
            />
            <Button icon={<FolderOutlined />} onClick={selectDevkitPath}>Browse</Button>
            <Button icon={<CloudDownloadOutlined />} onClick={downloadDevkitPro} loading={downloading}>Download</Button>
          </Space.Compact>
        </Form.Item>

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

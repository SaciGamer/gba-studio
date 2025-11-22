import React, { useEffect, useState } from 'react';
import { Card, Button, Space, Typography, message } from 'antd';

const { Text, Title } = Typography;

const ToolchainPanel: React.FC = () => {
  const [devkitPresent, setDevkitPresent] = useState<boolean | null>(null);
  const [emulatorPresent, setEmulatorPresent] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const devkit = await window.electronAPI.checkVendorExe('devkitPro', 'devkitARM/bin/arm-none-eabi-gcc.exe');
        const mgba = await window.electronAPI.checkVendorExe('mGBA', 'mGBA.exe');
        setDevkitPresent(!!devkit);
        setEmulatorPresent(!!mgba);
      } catch (err) {
        setDevkitPresent(false);
        setEmulatorPresent(false);
      }
    };

    check();
  }, []);

  const openPreferences = () => {
    window.electronAPI.send('open-preferences', null);
  };

  const importTools = async () => {
    try {
      // Let user pick DEVKIT folder
      const devkitFolder = await window.electronAPI.selectFolder();
      if (devkitFolder?.filePath) {
        await window.electronAPI.importVendor('devkitPro', devkitFolder.filePath);
      }

      const mgbaFolder = await window.electronAPI.selectFolder();
      if (mgbaFolder?.filePath) {
        await window.electronAPI.importVendor('mGBA', mgbaFolder.filePath);
      }

      message.success('Import started. Check vendor folder.');
    } catch (err) {
      console.error(err);
      message.error('Import failed');
    }
  };

  const compileMake = async () => {
    try {
      message.info('Triggering make...');
      window.electronAPI.send('compile-project', null);
    } catch (err) {
      message.error('Failed to trigger make');
    }
  };

  const buildAndRunDemo = async () => {
    try {
      message.info('Starting build...');
  // Call the main demo compile path which copies the demo template into gba-project temp and builds
  const repoRoot = await window.electronAPI.pathJoin('.', '..', '..');
  // Use the packaged template path in the main process: src/main/templates/demo-showcase
  const templatePath = await window.electronAPI.pathJoin(repoRoot, 'src', 'main', 'templates', 'demo-showcase');
  const result = await window.electronAPI.compileProjectDemo(templatePath);
      message.success('Build triggered. See main logs for progress.');
      console.log('compile result', result);
    } catch (err) {
      message.error('Build failed to start');
    }
  };

  return (
    <Card style={{ marginTop: 12 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={5}>Toolchain</Title>
        <div>
          <Text>DevkitARM (vendor): </Text>
          <Text strong>{devkitPresent === null ? 'Checking...' : devkitPresent ? 'Available' : 'Missing'}</Text>
        </div>
        <div>
          <Text>mGBA (vendor): </Text>
          <Text strong>{emulatorPresent === null ? 'Checking...' : emulatorPresent ? 'Available' : 'Missing'}</Text>
        </div>

        <Space>
          <Button onClick={openPreferences}>Preferences</Button>
          <Button onClick={importTools}>Import Tools</Button>
          <Button onClick={compileMake}>Compile (make)</Button>
          <Button type="primary" onClick={buildAndRunDemo}>Build & Run Demo</Button>
        </Space>
      </Space>
    </Card>
  );
};

export default ToolchainPanel;

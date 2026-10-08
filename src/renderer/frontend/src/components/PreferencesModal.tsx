import React, { useEffect, useState } from 'react';
import { Modal, Input, Button, Space, message, Form, Divider, Switch, Typography, Radio } from 'antd';
import StepInputNumber, { InputNumber } from './StepInputNumber';
import { FolderOutlined, CheckCircleOutlined, ExclamationCircleOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { useI18n } from '@/i18n/I18n';

const PreferencesModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useI18n();
  const [tempBuildPath, setTempBuildPath] = useState('');
  const [tempProjectBackupLimit, setTempProjectBackupLimit] = useState<number | ''>(5);
  const [historyLimit, setHistoryLimit] = useState<number | ''>(50);
  const [parallelBuild, setParallelBuild] = useState(false);
  const [buildThreads, setBuildThreads] = useState(1);
  const [cpuCount, setCpuCount] = useState(1);
  const [gameWorldPanInertia, setGameWorldPanInertia] = useState(true);
  const [gameWorldMovementMode, setGameWorldMovementMode] = useState<'free' | 'grid'>('grid');

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const tb = await window.electronAPI.getTempBuildPath();
        const [backupLimit, savedHistoryLimit, buildConfig, availableCpuCount, preferences] = await Promise.all([
          window.electronAPI.getTempProjectBackupLimit(),
          window.electronAPI.getHistoryLimit(),
          window.electronAPI.getBuildConfig(),
          window.electronAPI.getCpuCount(),
          window.electronAPI.loadPreferences(),
        ]);
        setTempBuildPath(tb || '');
        setTempProjectBackupLimit(backupLimit ?? 5);
        setHistoryLimit(savedHistoryLimit ?? 50);
        const availableThreads = Math.max(1, Number(availableCpuCount) || 1);
        const configuredThreads = Number(buildConfig?.parallel) || 1;
        setCpuCount(availableThreads);
        setParallelBuild(configuredThreads > 1);
        setBuildThreads(Math.min(availableThreads, Math.max(1, configuredThreads)));
        setGameWorldPanInertia(preferences?.gameWorldPanInertia !== false);
        setGameWorldMovementMode(preferences?.gameWorldMovementMode === 'free' ? 'free' : 'grid');
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
    try {
      await window.electronAPI.setTempBuildPath(tempBuildPath);
      await window.electronAPI.setTempProjectBackupLimit(Number(tempProjectBackupLimit || 0));
      const safeHistoryLimit = Math.max(1, Math.min(500, Math.floor(Number(historyLimit) || 50)));
      await window.electronAPI.setHistoryLimit(safeHistoryLimit);
      window.dispatchEvent(new CustomEvent('gba-studio:history-limit', { detail: safeHistoryLimit }));
      await window.electronAPI.setBuildConfig({
        parallel: parallelBuild ? Math.min(cpuCount, Math.max(2, buildThreads)) : 1,
        optimizationLevel: 'O2',
        verbose: false,
      });
      await window.electronAPI.setGameWorldPreferences({
        panInertia: gameWorldPanInertia,
        movementMode: gameWorldMovementMode,
      });
      window.dispatchEvent(new CustomEvent('gba-studio:game-world-preferences', {
        detail: { gameWorldPanInertia, gameWorldMovementMode },
      }));
      message.success('Preferences saved');
      onClose();
    } catch (err) {
      message.error('Failed to save preferences');
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
    <Modal open={open} title="Preferences" onCancel={() => { void save(); }} maskClosable footer={null} width={800}>
      <Form layout="vertical">
        <Space direction="vertical" size={0} style={{ marginBottom: 24, display: 'flex' }}>
          <Typography.Text strong>GBA Studio Configuration</Typography.Text>
          <Typography.Text type="secondary">General configurations to GBA Studio build.</Typography.Text>
        </Space>

        <Divider>History</Divider>
        <Form.Item
          label="Undo and Redo history limit"
          extra="Maximum number of project states kept for undo and redo across all editors."
        >
          <InputNumber
            min={1}
            max={500}
            step={1}
            value={historyLimit}
            onChange={(value) => setHistoryLimit(value === null ? '' : Number(value))}
            style={{ width: 180 }}
          />
        </Form.Item>

        <Divider>Canvas Configuration</Divider>
        <Form.Item label={t('preferences.panInertia')} extra={t('preferences.panInertiaDescription')}>
          <Switch
            data-testid="preferences-game-world-pan-inertia"
            aria-label={t('preferences.panInertia')}
            checked={gameWorldPanInertia}
            onChange={setGameWorldPanInertia}
          />
        </Form.Item>
        <Form.Item label={t('preferences.sceneMovement')}>
          <Radio.Group
            data-testid="preferences-game-world-movement-mode"
            aria-label={t('preferences.sceneMovement')}
            optionType="button"
            buttonStyle="solid"
            value={gameWorldMovementMode}
            onChange={event => setGameWorldMovementMode(event.target.value)}
            options={[
              { value: 'free', label: t('preferences.freeMovement') },
              { value: 'grid', label: t('preferences.gridMovement') },
            ]}
          />
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

        <Form.Item
          label="Parallel Butano Build"
          extra={cpuCount > 1
            ? `Uses multiple CPU threads during compilation (up to ${cpuCount} available).`
            : 'This computer has one CPU thread available, so parallel compilation is unavailable.'}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Switch
              checked={parallelBuild}
              disabled={cpuCount < 2}
              onChange={setParallelBuild}
            />
            {parallelBuild && (
              <InputNumber
                min={2}
                max={cpuCount}
                value={buildThreads}
                onChange={(value) => setBuildThreads(Math.max(2, Number(value) || 2))}
                addonBefore="Threads"
                style={{ width: 180 }}
              />
            )}
          </Space>
        </Form.Item>

        <Form.Item>
          <Space>
            <Button danger onClick={clearTemporaryData}>Clear Temp Folder</Button>
          </Space>
        </Form.Item>

      </Form>
    </Modal>
  );
};

export default PreferencesModal;

import { useEffect, useState } from 'react';
import { Alert, Flex, Progress, Space, Typography } from 'antd';
import { AntdToken } from '@/components/common/AntDToken';
import { useI18n } from '@/i18n/I18n';
import { memoryLevel, parseRuntimeSnapshot, resourceLevel, type ResourceLevel, type RuntimeSnapshot } from '@/utils/runtimeMonitor';

const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;
export default function RuntimeMonitor() {
  const { t } = useI18n();
  const { token } = AntdToken();
  const [sample, setSample] = useState<{ snapshot: RuntimeSnapshot; at: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const unsubscribe = window.electronAPI.subscribe('runtime-monitor-metrics', (_event: unknown, message: unknown) => {
      const snapshot = parseRuntimeSnapshot(message);
      if (snapshot) setSample({ snapshot, at: Date.now() });
    });
    // Subscribe before requesting the retained snapshot so reopening the window
    // immediately displays the latest sample even when the emulator is paused.
    window.electronAPI.send('runtime-monitor-ready', null);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, []);
  const colors: Record<ResourceLevel, string> = { normal: token.colorSuccess, warning: token.colorWarning, critical: token.colorError };
  const data = sample?.snapshot;
  const rows = data ? [
    { key: 'iwram', label: t('monitor.iwram'), value: `${kib(data.iwramFree)} (${t('monitor.minimum')} ${kib(data.iwramMinFree)})`, level: memoryLevel(data.iwramFree, 8192), percent: (32768 - data.iwramFree) / 32768 * 100 },
    { key: 'heap', label: t('monitor.heap'), value: `${kib(data.heapFree)} (${t('monitor.minimum')} ${kib(data.heapMinFree)})`, level: memoryLevel(data.heapFree, 32768), percent: data.heapUsed / Math.max(1, data.heapUsed + data.heapFree) * 100 },
    { key: 'sprites', label: t('monitor.sprites'), value: `${data.spritesUsed} / ${data.spritesUsed + data.spritesFree} (${t('monitor.peak')} ${data.spritesPeak})`, level: resourceLevel(data.spritesUsed, data.spritesFree), percent: data.spritesUsed / Math.max(1, data.spritesUsed + data.spritesFree) * 100 },
    { key: 'tiles', label: t('monitor.spriteTiles'), value: `${data.spriteTilesUsed} / ${data.spriteTilesUsed + data.spriteTilesFree} (${t('monitor.peak')} ${data.spriteTilesPeak})`, level: resourceLevel(data.spriteTilesUsed, data.spriteTilesFree), percent: data.spriteTilesUsed / Math.max(1, data.spriteTilesUsed + data.spriteTilesFree) * 100 },
    ...(data.backgroundMode !== 'direct-bitmap' ? [{ key: 'backgrounds', label: t('monitor.bgBlocks'), value: `${data.bgBlocksUsed} / ${data.bgBlocksUsed + data.bgBlocksFree} (${t('monitor.peak')} ${data.bgBlocksPeak})`, level: resourceLevel(data.bgBlocksUsed, data.bgBlocksFree), percent: data.bgBlocksUsed / Math.max(1, data.bgBlocksUsed + data.bgBlocksFree) * 100 }] : []),
  ] : [];
  const overall: ResourceLevel = rows.some(row => row.level === 'critical') ? 'critical' : rows.some(row => row.level === 'warning') ? 'warning' : 'normal';
  const stale = !!sample && now - sample.at > 5000;
  return <div role="region" aria-label={t('monitor.title')} style={{ boxSizing: 'border-box', height: '100vh', overflowY: 'auto', padding: 16, background: token.colorBgElevated, color: token.colorText }}>
    <Typography.Title level={4} style={{ marginTop: 0 }}>{t('monitor.title')}</Typography.Title>
      {!data ? <Alert type="info" showIcon message={t('monitor.waiting')} description={t('monitor.rebuild')} /> : <Space direction="vertical" size={6} style={{ width: '100%' }}>
        <Alert type={stale ? 'info' : overall === 'critical' ? 'error' : overall === 'warning' ? 'warning' : 'success'} showIcon message={t(stale ? 'monitor.stale' : `monitor.${overall}`)} />
        {rows.map(row => <div key={row.key}>
          <Flex justify="space-between" gap={8}><Typography.Text>{row.label}</Typography.Text><Typography.Text strong style={{ color: colors[row.level] }}>{row.value}</Typography.Text></Flex>
          <Progress percent={Math.max(0, Math.min(100, row.percent))} showInfo={false} strokeColor={colors[row.level]} size="small" style={{ margin: 0 }} />
        </div>)}
        <Typography.Text type="secondary">{t('monitor.static')}: IWRAM {kib(data.iwramStatic)} / EWRAM {kib(data.ewramStatic)}</Typography.Text>
        <Typography.Text type="secondary">{t('monitor.stackPeak')}: {kib(data.stackPeak)}</Typography.Text>
        <Typography.Text type="secondary">{t('monitor.heapMinimum')}: {kib(data.heapMinFree)}</Typography.Text>
        <Typography.Text type="secondary">{t('monitor.frames')}: {data.frame}</Typography.Text>
      </Space>}
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>{t('monitor.sampleNote')}</Typography.Paragraph>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>{t('monitor.thresholds')}</Typography.Paragraph>
  </div>;
}

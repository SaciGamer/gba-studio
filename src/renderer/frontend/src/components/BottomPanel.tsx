import * as React from 'react';
const { useEffect, useState, useRef } = React;

import { Typography, Spin, Row, Space, notification } from 'antd';
import { useBuildState } from '../providers/BuildStateProvider';
import { AntdToken } from './common/AntDToken';
import { Content } from 'antd/es/layout/layout';
import Layout from 'antd/lib/layout/layout';
import { useI18n } from '@/i18n/I18n';
import { translateCompilerLog } from '@/utils/compilerLogTranslation';
import { CaretRightOutlined } from '@ant-design/icons';
import { NAVIGATION_HEADER_HEIGHT } from '@/utils/workspaceLayout';

const { Text } = Typography;
export const COMPILER_STATUS_HEADER_HEIGHT = NAVIGATION_HEADER_HEIGHT;

const BottomPanel: React.FC<{ expanded: boolean; onToggle: () => void }> = ({ expanded, onToggle }) => {
  const { t } = useI18n();
  const translatorRef = useRef(t);
  translatorRef.current = t;
  const { token } = AntdToken();
  const [notificationApi, notificationContextHolder] = notification.useNotification();
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const { isBuilding } = useBuildState();
  const listenersAttached = useRef(false);
  const wasBuilding = useRef(false);
  const listenerId = useRef(Math.random().toString(36).substr(2, 9));
  const seenMessages = useRef(new Set<string>());
  const logRef = useRef<HTMLDivElement>(null);

  // Limpa logs quando um novo build começa
  useEffect(() => {
    if (isBuilding && !wasBuilding.current) {
      // Novo build começou - limpa logs anteriores
      console.log(`[BottomPanel-${listenerId.current}] Novo build detectado, limpando logs`);
      setStatusLines([]);
      seenMessages.current.clear();
    } else if (!isBuilding && wasBuilding.current) {
      // Build terminou - verifica se foi sucesso
      console.log(`[BottomPanel-${listenerId.current}] Build finalizado, verificando sucesso`);
      const hasErrors = statusLines.some(line => line.startsWith('ERROR'));
      if (!hasErrors && statusLines.length > 0) {
        notificationApi.success({
          message: t('compiler.finished'),
          description: t('compiler.success'),
          placement: 'bottomRight',
        });
      }
    }
    wasBuilding.current = isBuilding;
  }, [isBuilding, statusLines]);

  useEffect(() => {
    // Evita adicionar listeners múltiplas vezes
    if (listenersAttached.current) {
      console.log(`[BottomPanel-${listenerId.current}] Listeners já anexados, pulando`);
      return;
    }

    console.log(`[BottomPanel-${listenerId.current}] Anexando listeners`);

    const progressHandler = (_event: any, payload: any) => {
      try {
        const msg = translateCompilerLog(payload, translatorRef.current);
        console.log(`[BottomPanel-${listenerId.current}] Progress: ${msg}`);
        const wasAtBottom = logRef.current ? logRef.current.scrollTop + logRef.current.clientHeight >= logRef.current.scrollHeight : true;
        setStatusLines((s) => {
          // Verifica se a mensagem já está nas últimas 5 linhas para evitar duplicatas
          const recentLines = s.slice(-5);
          if (recentLines.includes(msg)) {
            console.log(`[BottomPanel-${listenerId.current}] Duplicate message skipped: ${msg}`);
            return s;
          }
          const newLines = [...s.slice(-1000), msg];
          console.log(`[BottomPanel-${listenerId.current}] Status lines count: ${newLines.length}`);
          return newLines;
        });
        // Smart scroll: scroll to bottom only if was at bottom
        setTimeout(() => {
          if (logRef.current && wasAtBottom) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
          }
        }, 0);
      } catch (e) {
        console.error(`[BottomPanel-${listenerId.current}] Error in progress handler:`, e);
      }
    };

    const errorHandler = (_event: any, payload: any) => {
      try {
        const msg = payload && payload.message ? String(payload.message) : JSON.stringify(payload);
        console.log(`[BottomPanel-${listenerId.current}] Error: ${msg}`);
        notificationApi.error({
          message: translatorRef.current('compiler.error'),
          description: msg,
          placement: 'bottomRight',
        });
        const wasAtBottom = logRef.current ? logRef.current.scrollTop + logRef.current.clientHeight >= logRef.current.scrollHeight : true;
        setStatusLines((s) => {
          const errorMsg = `ERROR: ${msg}`;
          // Verifica se a mensagem de erro já está nas últimas 5 linhas
          const recentLines = s.slice(-5);
          if (recentLines.includes(errorMsg)) {
            console.log(`[BottomPanel-${listenerId.current}] Duplicate error message skipped: ${msg}`);
            return s;
          }
          const newLines = [...s.slice(-1000), errorMsg];
          console.log(`[BottomPanel-${listenerId.current}] Error lines count: ${newLines.length}`);
          return newLines;
        });
        // Smart scroll: scroll to bottom only if was at bottom
        setTimeout(() => {
          if (logRef.current && wasAtBottom) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
          }
        }, 0);
      } catch (e) {
        console.error(`[BottomPanel-${listenerId.current}] Error in error handler:`, e);
      }
    };

    window.electronAPI.on('compile-progress', progressHandler);
    window.electronAPI.on('compile-error', errorHandler);
    listenersAttached.current = true;

    return () => {
      console.log(`[BottomPanel-${listenerId.current}] Removendo listeners`);
      try { 
        window.electronAPI.removeListener('compile-progress', progressHandler); 
        listenersAttached.current = false;
      } catch (e) { 
        console.error(`[BottomPanel-${listenerId.current}] Error removing progress listener:`, e);
      }
      try { 
        window.electronAPI.removeListener('compile-error', errorHandler); 
      } catch (e) { 
        console.error(`[BottomPanel-${listenerId.current}] Error removing error listener:`, e);
      }
    };
  }, []);

  return (
    <Layout style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {notificationContextHolder}
      <Content style={{ flex: `0 0 ${COMPILER_STATUS_HEADER_HEIGHT}px`, height: COMPILER_STATUS_HEADER_HEIGHT, boxSizing: 'border-box', display: 'flex', alignItems: 'center', backgroundColor: token.colorBorder, zIndex: 1, padding: '0 24px', borderBottom: '1px solid #d9d9d9' }}>
        <Row justify="space-between" align="middle" style={{ width: '100%' }}>
          <Space role="button" tabIndex={0} aria-label={t('compiler.title')} aria-expanded={expanded} onClick={onToggle}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(); } }} style={{ cursor: 'pointer' }}>
            <CaretRightOutlined rotate={expanded ? 90 : 0} />
            <Typography.Text strong>{t('compiler.title')}</Typography.Text>
          </Space>
          <Space>
            {isBuilding && <Spin size="small" />}
            <Typography.Text type={isBuilding ? 'warning' : 'secondary'}>
              {isBuilding ? t('compiler.building') : t('compiler.idle')}
            </Typography.Text>
          </Space>
        </Row>
      </Content>
      <Content style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: 0, display: expanded ? 'flex' : 'none', flexDirection: 'column' }}>
        <Content ref={logRef} style={{ flex: 1, overflow: 'auto', width: '100%', fontFamily: 'monospace', fontSize: '12px', backgroundColor: '#000', color: '#fff', padding: '8px', borderRadius: 0 }}>
          {statusLines.length === 0 ? (
            <Text type="secondary" style={{ color: '#666' }}>Aguardando ações do compilador...</Text>
          ) : (
            statusLines.map((l, i) => (
              <div key={i} style={{ color: l.startsWith('ERROR') ? '#ff4d4f' : '#fff' }}>{l}</div>
            ))
          )}
        </Content>
      </Content>
    </Layout>
  );
};

export default BottomPanel;

import * as React from 'react';
const { useEffect, useState, useRef } = React;

import { Typography, Spin, Row, Space, notification } from 'antd';
import { useBuildState } from '../providers/BuildStateProvider';
import { AntdToken } from './common/AntDToken';
import { Content } from 'antd/es/layout/layout';
import Layout from 'antd/lib/layout/layout';

const { Text } = Typography;

const BottomPanel: React.FC = () => {
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
          message: 'Compilação concluída',
          description: 'Sucesso!',
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
        const msg = payload && payload.message ? String(payload.message) : JSON.stringify(payload);
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
          message: 'Erro na compilação',
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
    <Layout style={{ height: '100%' }}>
      {notificationContextHolder}
      <Content style={{ position: 'sticky', top: 0, backgroundColor: token.colorBorder, zIndex: 1, padding: '16px 24px', borderBottom: '1px solid #d9d9d9' }}>
        <Row justify="space-between" align="middle">
          <Typography.Text strong>Status do Compilador</Typography.Text>
          <Space>
            {isBuilding && <Spin size="small" />}
            <Typography.Text type={isBuilding ? 'warning' : 'secondary'}>
              {isBuilding ? 'Compilando...' : 'Ocioso'}
            </Typography.Text>
          </Space>
        </Row>
      </Content>
      <Content style={{ height: 'calc(100% - 55px)', overflow: 'auto', padding: 0, display: 'flex', flexDirection: 'column' }}>
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

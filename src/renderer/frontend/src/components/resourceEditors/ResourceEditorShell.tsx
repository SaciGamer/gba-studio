import { SearchOutlined } from '@ant-design/icons';
import { Flex, Layout, Splitter, theme, Tooltip, Typography } from 'antd';
import React, { ReactNode } from 'react';

interface ResourceEditorShellProps {
  assetKind?: string;
  title: string;
  library: ReactNode;
  children: ReactNode;
  inspector?: ReactNode;
  libraryActions?: ReactNode;
  searchOpen?: boolean;
  onToggleSearch?: () => void;
  hideLibrary?: boolean;
  hideHeader?: boolean;
  customPanels?: boolean;
  onLibraryBackgroundClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export default function ResourceEditorShell({ assetKind, title, library, children, inspector, libraryActions, searchOpen = false, onToggleSearch, hideLibrary = false, hideHeader = false, customPanels = false, onLibraryBackgroundClick }: ResourceEditorShellProps) {
  const { token } = theme.useToken();
  const panelStyle: React.CSSProperties = {
    backgroundColor: token.colorBorder,
    borderRadius: 0,
    height: 40,
    flex: '0 0 40px',
  };

  return (
    <Layout data-asset-kind={assetKind} style={{ height: '100%', minHeight: 0, background: token.colorBgBase }}>
      {customPanels ? (
        <Splitter style={{ flex: 1, minHeight: 0, background: token.colorBgBase }}>
          {children}
        </Splitter>
      ) : hideLibrary ? (
        <Flex vertical style={{ flex: 1, minHeight: 0 }}>
          {!hideHeader && <Flex align="center" justify="space-between" gap={8} style={{ ...panelStyle, paddingInline: 12 }}>
            <Typography.Text strong ellipsis style={{ color: '#fff', minWidth: 0 }}>{title.toUpperCase()}</Typography.Text>
            <Flex align="center" gap={8} onClick={event => event.stopPropagation()}>
              {library}
              {libraryActions}
              {onToggleSearch && <Tooltip placement="right" title="Search" color={token.colorBorder}><SearchOutlined style={{ padding: 4, borderRadius: token.borderRadius, backgroundColor: searchOpen ? token.colorPrimary : 'transparent', cursor: 'pointer' }} onClick={onToggleSearch} /></Tooltip>}
            </Flex>
          </Flex>}
          <main style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: hideHeader ? 'hidden' : 'auto', padding: hideHeader ? 0 : 16, background: token.colorBgContainer }}>{children}</main>
        </Flex>
      ) : (
        <Splitter style={{ flex: 1, minHeight: 0, background: token.colorBgBase }}>
          <Splitter.Panel defaultSize={260} min={220}>
            <aside style={{ height: '100%', background: token.colorBgBase, overflow: 'hidden' }}>
            <Flex align="center" justify="space-between" gap={4} style={{ ...panelStyle, paddingInline: 12 }}>
              <Typography.Text strong ellipsis style={{ color: '#fff', minWidth: 0 }}>{title.toUpperCase()}</Typography.Text>
              <Flex align="center" gap={2} onClick={event => event.stopPropagation()}>
                {libraryActions}
                {onToggleSearch && <Tooltip placement="right" title="Search" color={token.colorBorder}><SearchOutlined style={{ padding: 4, borderRadius: token.borderRadius, backgroundColor: searchOpen ? token.colorPrimary : 'transparent', cursor: 'pointer' }} onClick={onToggleSearch} /></Tooltip>}
              </Flex>
            </Flex>
            <div onClick={onLibraryBackgroundClick} style={{ height: 'calc(100% - 40px)', overflow: 'auto', padding: '8px 16px' }}>{library}</div>
            </aside>
          </Splitter.Panel>
          <Splitter.Panel min={360}>
            <main style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'auto', padding: 16, background: token.colorBgContainer }}>{children}</main>
          </Splitter.Panel>
          {inspector && (
            <Splitter.Panel defaultSize={300} min={260}>
              <aside style={{ height: '100%', background: token.colorBgBase, overflow: 'hidden' }}>
                <div style={{ height: '100%', overflow: 'auto', padding: 12 }}>{inspector}</div>
              </aside>
            </Splitter.Panel>
          )}
        </Splitter>
      )}
    </Layout>
  );
}

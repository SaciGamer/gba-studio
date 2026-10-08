import React, { useState, useEffect } from 'react';
import { CloseOutlined } from '@ant-design/icons';
import { Button, message, Layout, List, Typography } from 'antd';
import cartuchoGBA from '@/img/cartuchoGBA.png';
import cartridgeShell from '@/img/CartuchoGBASemFundo.png';
import { AntdToken } from '../../common/AntDToken';

const { Content } = Layout;

interface Project {
  title: string;
  path: string;
  hasCartridgeImage?: boolean;
  cartridgeImage?: string | null;
}

interface RecentProjectListProps {
  projects: Project[];
  handleRemoveProject: (title: string, path: string) => void;
  handleSelectProject: (path: string) => void;
}

// Keep covers in renderer memory while the launcher switches tabs. The stored
// filename is the cover revision: changing a project's cover selects a new file.
const cartridgeImageCache = new Map<string, { filename: string; source: string }>();

const projectKey = (project: Project) => `${project.path.toLowerCase()}\\${project.title.toLowerCase()}`;

function joinPaths(...segments: string[]): string {
  return segments
    .join('/') // Junta os segmentos com "/"
    .replace(/\/+/g, '/') // Garante que não há barras repetidas
    .replace(/\//g, '\\');
}

const RecentProjectList: React.FC<RecentProjectListProps> = ({ projects, handleRemoveProject, handleSelectProject }) => {
  const { token } = AntdToken();

  const [listHoveredItem, setlistHoveredItem] = useState<number | null>(null);
  const [cartridgeImages, setCartridgeImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    const cached: Record<string, string> = {};
    const pending = projects.flatMap(project => {
      const key = projectKey(project);
      const filename = project.cartridgeImage;
      if (!filename) {
        cartridgeImageCache.delete(key);
        return [];
      }

      const existing = cartridgeImageCache.get(key);
      if (existing?.filename === filename) {
        cached[key] = existing.source;
        return [];
      }

      return [window.electronAPI.getCartridgeImage(project.path, filename)
        .then((source: string | null) => {
          if (!mounted) return;
          if (!source) {
            cartridgeImageCache.delete(key);
            return;
          }
          cartridgeImageCache.set(key, { filename, source });
          cached[key] = source;
        })
        .catch(() => { cartridgeImageCache.delete(key); })];
    });
    setCartridgeImages(cached);
    void Promise.all(pending).then(() => {
      if (mounted) setCartridgeImages({ ...cached });
    });
    return () => { mounted = false; };
  }, [projects]);

  const handleProjectClick = async (index: number) => {
    const projectPath = joinPaths(projects[index].path, projects[index].title);
    console.log("..: Caminho a abrir recente: ", projectPath);
    const exists = await window.electronAPI.checkProjectFile(projectPath);
    if (exists) {
      handleSelectProject(projectPath);
      message.info(`Arquivo ${projects[index].title} está carregando...`);
    } else {
      message.error(`Arquivo ${projects[index].title} não foi encontrado.`);
    }
  };

  useEffect(() => {
    // Salvar a aba "lastUsedSplashTab"
    window.electronAPI.saveLastSplashTab('recent_project');
  }, []);

  return (
    <Content style={{ height: 'calc(100vh - 10px)', overflowY: 'auto' }}>
      <List
        itemLayout="vertical"
        size="small"
        dataSource={projects}
        renderItem={(item: Project, index) => (
          <List.Item
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = token.colorPrimary;
              setlistHoveredItem(index);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              setlistHoveredItem(null);
            }}
            style={{
              height: 70,
              // textSizeAdjust: '50%',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              borderBlockEndColor: token.colorBgBase,
            }}
            // actions={[]}
            onClick={(e) => {
              console.info('List item clicked:', index),
                handleProjectClick(index)
            }}
          >
            <div style={{ position: 'relative', width: '15%', aspectRatio: '236 / 138', flexShrink: 0, overflow: 'hidden' }}>
              <img src={cartuchoGBA} alt='' draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
              {cartridgeImages[projectKey(item)] && (
                <img src={cartridgeImages[projectKey(item)]} alt='' draggable={false} style={{ position: 'absolute', left: '14.41%', top: '23.91%', width: '72.03%', height: '63.04%', borderRadius: 3, objectFit: 'cover', objectPosition: 'center' }} />
              )}
              <img src={cartridgeShell} alt='' draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
            </div>
            <List.Item.Meta
              style={{ marginLeft: '10px' }}
              title={
                <span style={{  marginTop: '10px', fontWeight: 600, fontSize: 20, display: 'block' }}>
                  {item.title}
                </span>
              }
              description={
                <Typography.Text ellipsis type='secondary' style={{ marginBottom: '5px' }} >
                  {item.path}
                </Typography.Text>
              }
            />
            {(listHoveredItem === index) && (
              <Button
                danger size='small'
                icon={<CloseOutlined />}
                onClick={(e) => {
                  e.stopPropagation(); // Evita que o clique no botão "X" propague para o List.Item
                  handleRemoveProject(item.title, item.path);
                }}
                style={{ backgroundColor: token.colorBgBase, top: -15, right: -10, border: 'none', boxShadow: 'none' }}
              />
            )}
          </List.Item>
        )}
      />
    </Content>
  );
};

export default RecentProjectList;

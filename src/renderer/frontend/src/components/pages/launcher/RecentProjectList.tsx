import React, { useState, useEffect } from 'react';
import { CloseOutlined } from '@ant-design/icons';
import { Button, message, Layout, Image, List, Typography } from 'antd';
import cartuchoGBA from '@/img/cartuchoGBA.png';
import { AntdToken } from '../../common/AntDToken';

const { Content } = Layout;

interface Project {
  title: string;
  path: string;
}

interface RecentProjectListProps {
  projects: Project[];
  handleRemoveProject: (title: string, path: string) => void;
  handleSelectProject: (path: string) => void;
}

function joinPaths(...segments: string[]): string {
  return segments
    .join('/') // Junta os segmentos com "/"
    .replace(/\/+/g, '/') // Garante que não há barras repetidas
    .replace(/\//g, '\\');
}

const RecentProjectList: React.FC<RecentProjectListProps> = ({ projects, handleRemoveProject, handleSelectProject }) => {
  const { token } = AntdToken();

  const [listHoveredItem, setlistHoveredItem] = useState<number | null>(null);

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
            <Image
              preview={false}
              width={'15%'}
              src={cartuchoGBA}
            // fallback={cartuchoGBA}
            />
            <List.Item.Meta
              style={{ marginLeft: '10px' }}
              title={
                <Typography.Title ellipsis level={4} style={{ marginTop: '10px' }}>
                  {item.title}
                </Typography.Title>
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

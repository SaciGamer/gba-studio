import React, { useState, useEffect } from 'react';
import path from 'path';
import { CloseOutlined } from '@ant-design/icons';
import { Form, Input, Button, message, Layout, Image, List, Typography } from 'antd';
import cartuchoGBA from '../../img/cartuchoGBA.png';
import { AntdToken } from '../common/AntDToken.ts';


const { Header, Sider, Content } = Layout;

interface Project {
  title: string;
  path: string;
}

interface RecentProjectListProps {
  projects: Project[];
  handleRemoveProject: (title: string, path: string) => void;
  handleSelectProject: (path: string) => void;
  selectedProject: string | null;
}

const RecentProjectList: React.FC<RecentProjectListProps> = ({ projects, handleRemoveProject, handleSelectProject, selectedProject, }) => {
  const {
    token: { colorPrimary, colorTextLabel, colorBgContainer, borderRadiusLG, fontSize },
  } = AntdToken();

  const [listHoveredItem, setlistHoveredItem] = useState<number | null>(null);
  
  const handleProjectClick = async (index) => {
    const projectPath = path.join(projects[index].path, projects[index].title);
    console.log("..: Caminho a abrir recente: ", projectPath);
    const exists = await window.electronAPI.checkProjectFile(projectPath);
    if (exists) {
      handleSelectProject(projectPath);
      message.info(`Arquivo ${projects[index].title} está carregando...`);
    } else {
      message.error(`Arquivo ${projects[index].title} não foi encontrado.`);
    }
  };

  return (
    <Content style={{ height: 'calc(100vh - 10px)', overflowY: 'auto' }}>
      <List
        itemLayout="vertical"
        size="small"
        dataSource={projects}
        renderItem={(item: Project, index) => (
        <List.Item 
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = colorPrimary;
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
            cursor: 'pointer'
          }}
          actions={[]}
          onClick={() => handleProjectClick(index)}
        >
          <Image  
            preview={false}
            width={'15%'}
            src="error"
            fallback={cartuchoGBA}
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
              style={{ backgroundColor: 'transparent', top: 0, right: 0, border: 'none', boxShadow: 'none' }}
            />
          )}
        </List.Item>
        )}
      />
    </Content>
    );
};

export default RecentProjectList;

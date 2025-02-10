import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Layout, Menu, Typography, Image, Select, message, App as AntDApp} from 'antd';
import path from 'path'
import {
  FileAddOutlined,
  FileTextOutlined,
  BookOutlined,
  TeamOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import '../../index.css';
import NewProjectForm from "./NewProjectForm.tsx";
import RecentProjectList from "./RecentProjectList.tsx";
import { AntdToken } from '../common/AntDToken.ts';
import iconGBA from '../../img/defaultImgIcon.png';

const { Header, Sider, Content } = Layout;
const { Title, Paragraph, Text } = Typography;
const { Option } = Select

interface Project {
  title: string;
  path: string;
}

const projectsData: Project[] = [];

const Launcher = () => {
  const {
    token: { colorBgContainer, borderRadiusLG, },
  } = AntdToken();
  
  const [selectedKey, setSelectedKey] = useState("1");

  //Recents Projects ------------------------------------------
  const [recentProjects, setRecentProjects] = useState(projectsData);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => { 
    window.electronAPI.loadPreferences().then(preferencias => { 
      console.log('..: Carregando projetos recentes: ', preferencias.recentProjects);
      setRecentProjects(preferencias.recentProjects || []); 
    }); 
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const tab = query?.get('tab');    
    if ((tab != null && tab == 'recent_project') && recentProjects.length > 0) {
      setSelectedKey("2");
      console.log('..: Recent selected');
    } else {
      setSelectedKey("1");
      console.log('..: New selected');
    }
  }, [location.search]);

  const handleRemoveProject = (title, path) => {
      message.success(`${title} removido dos recentes`);
      const removedProject = recentProjects.filter(project => project.path !== path);
      setRecentProjects(removedProject);
      window.electronAPI.removePreferences("recentProjects", removedProject);
  };

  const handleSelectProject = (projetctPath) => {
    window.electronAPI.send('load-project-window', projetctPath);
  };
// Recents Projects - END ------------------------------------

  const handleMenuClick = async (e) => {
    if (e.key === '5') {
      // console.log('..: Chamando a busca de projeto');
      window.electronAPI.send('open-project-window');
    } else if(e.key == '3') {
      // console.log('..: Documentation clicado'); 
      window.electronAPI.send('open-documentation');
    } 
    else {
      setSelectedKey(e.key);
    }
  }

  useEffect(() => {
    const handleSelectedProjectFile = (event, filePath) => {
      console.log("..: Lancher - Arquivo de projeto selecionado:", filePath );
      window.electronAPI.send('load-project-window', filePath); // Abrir projeto
    };

    window.electronAPI.on('selected-project-file', handleSelectedProjectFile);
    
    // Limpeza do listener ao desmontar o componente
    return () => {
      window.electronAPI.removeListener('selected-project-file', handleSelectedProjectFile);
    };
  }, []);

  const siderStyle: React.CSSProperties = {
    // overflow: 'auto',
    height: '100vh',
    // width: '100%',
    position: 'fixed',
    insetInlineStart: 0,
    // top: 0,
    // bottom: 0,
    // scrollbarWidth: 'thin', // deixa fino
    // scrollbarColor: 'unset',
    boxShadow: '0 0 10px rgba(0, 0, 0, 0.1)',
    background: colorBgContainer
  };

  return (
    <AntDApp>
      <Layout hasSider style={{ minHeight: '100vh', /*width: '100vw', */overflow:'hidden' }}>
        <Sider width={200} style={siderStyle}>
          <Content style={{ paddingTop: '35px', paddingBottom: '16px', textAlign: 'center', fontSize: 11 }}>
            <Image
              width={150}
              src="error"
              fallback={iconGBA}
              alt="GBA Studio Image"
              preview={false}
              style={{ marginBottom: 10, transition: 'transform 1.5s ease' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            />
            <div>GBA Studio 0.0.1</div>
          </Content>
          <Menu
            mode="inline"
            // defaultSelectedKeys={['1']}
            selectedKeys={[selectedKey]}
            onClick={handleMenuClick}
            style={{ height: '100%', /*borderRight: 0, marginTop: 15*/ }}
            items={[
              { label: "New", key: "1", icon: <FileAddOutlined />, style: { height: 26, marginBottom: 0 }},
              { label: "Recent", key: "2", icon: <FileTextOutlined />, style: { height: 26, marginBottom: 0 } },
              { label: "Documentation", key: "3", icon: <BookOutlined />, style: { height: 26, marginBottom: 0 } },
              { label: "Credits", key: "4", icon: <TeamOutlined />, style: { height: 26, marginBottom: 0 } },
              // { type: 'divider' },
              { label: "Open Project", key: "5", icon: <FolderOpenOutlined />, style: { height: 26, marginTop: 30 } }
            ]}
          />
        </Sider>
        <Layout style={{ marginInlineStart: 200, /*height: '100vh',*/ width: "100vw" }}>
          <Content
            style={{
              padding: 5,
              // margin: '16px 16px 0',
              // minHeight: 280,
              // background: colorBgContainer,
            }}
          >
            {selectedKey === "1" && <NewProjectForm />}
            {selectedKey === "2" && <RecentProjectList projects={recentProjects} handleRemoveProject={handleRemoveProject} handleSelectProject={handleSelectProject} selectedProject={selectedKey} />}
            {/* {selectedKey === "3" && <div>Content for Documentation</div>} */}
            {selectedKey === "4" && <div style={{ padding: '15px' }}>Credits: SaciGamer-Dev</div>}
            {selectedKey === "5"}
          </Content>
        </Layout>
      </Layout>
    </AntDApp>
  )
};

export default Launcher;

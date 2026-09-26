import React, { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Layout, Menu, Image, message, App as AntDApp, Spin } from 'antd';
import {
  FileAddOutlined,
  FileTextOutlined,
  BookOutlined,
  TeamOutlined,
  FolderOpenOutlined,
  Loading3QuartersOutlined,
} from '@ant-design/icons';
import '../../../index.css';
import NewProjectForm from "./NewProjectForm";
import RecentProjectList from "./RecentProjectList";
import { LauncherCredit } from './credits';
import { AntdToken } from '../../common/AntDToken';
import iconGBA from '@/img/defaultImgIcon.png';

const { Sider, Content } = Layout;

interface Project {
  title: string;
  path: string;
}

const projectsData: Project[] = [];

type CreditEffect = 'normal' | 'basic' | 'featured';

const parseCredit = (credit: LauncherCredit): { name: string; effect: CreditEffect; href?: string } => {
  const isLinked = credit.entry.startsWith('@');
  const entry = isLinked ? credit.entry.slice(1).trim() : credit.entry.trim();
  if (entry.startsWith('#')) return { name: entry.slice(1).trim(), effect: 'basic', href: isLinked ? credit.href : undefined };
  if (entry.startsWith('$')) return { name: entry.slice(1).trim(), effect: 'featured', href: isLinked ? credit.href : undefined };
  return { name: entry, effect: 'normal', href: isLinked ? credit.href : undefined };
};

const CreditsRoll: React.FC<{ color: string; accent: string; sourceCredits: LauncherCredit[] }> = ({ color, accent, sourceCredits }) => {
  const credits = sourceCredits.map(parseCredit).filter(credit => credit.name);
  const loopingCredits = [...credits, ...credits];
  const openCreditLink = (href?: string) => {
    if (!href) return;
    try {
      const url = new URL(href);
      if (url.protocol === 'https:' || url.protocol === 'http:') void window.electronAPI.openBrowser(url.toString());
    } catch { /* An invalid contributor link is intentionally ignored. */ }
  };
  return <div className="launcher-credits-roll" data-testid="launcher-credits-roll" style={{ height: 'calc(100vh - 10px)', display: 'grid', placeItems: 'center', overflow: 'hidden', padding: 24, boxSizing: 'border-box' }}>
    <style>{`
      @keyframes launcher-credits-scroll { from { transform: translateY(0); } to { transform: translateY(-50%); } }
      @keyframes launcher-credit-pulse { 0%, 100% { opacity: .62; transform: scale(.98); } 50% { opacity: 1; transform: scale(1.04); } }
      @keyframes launcher-credit-shimmer { from { background-position: 200% center; transform: scale(1); } 50% { transform: scale(1.08); } to { background-position: -200% center; transform: scale(1); } }
      .launcher-credits-track { animation: launcher-credits-scroll ${Math.max(12, credits.length * 5)}s linear infinite; }
      .launcher-credit-basic { animation: launcher-credit-pulse 2.2s ease-in-out infinite; }
      .launcher-credit-featured { background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent !important; animation: launcher-credit-shimmer 2.8s ease-in-out infinite; }
      .launcher-credits-roll:hover .launcher-credits-track, .launcher-credits-roll:hover .launcher-credit-basic, .launcher-credits-roll:hover .launcher-credit-featured { animation-play-state: paused; }
      .launcher-credit-link { color: inherit; font: inherit; letter-spacing: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
      @media (prefers-reduced-motion: reduce) { .launcher-credits-track, .launcher-credit-basic, .launcher-credit-featured { animation: none; } }
    `}</style>
    <div style={{ height: 'min(60vh, 420px)', overflow: 'hidden', maskImage: 'linear-gradient(to bottom, transparent, black 14%, black 86%, transparent)' }}>
      <div className="launcher-credits-track" aria-label="Contributors">
        {loopingCredits.map((credit, index) => <div key={`${credit.name}-${index}`} data-credit-effect={credit.effect} className={credit.effect === 'basic' ? 'launcher-credit-basic' : credit.effect === 'featured' ? 'launcher-credit-featured' : undefined} style={{ color, backgroundImage: credit.effect === 'featured' ? `linear-gradient(90deg, ${color}, ${accent}, ${color})` : undefined, fontSize: credit.effect === 'featured' ? 28 : 22, fontWeight: credit.effect === 'featured' ? 700 : 500, letterSpacing: '.04em', textAlign: 'center', minWidth: 360, padding: '28px 24px' }}>{credit.href ? <button className="launcher-credit-link" data-credit-link={credit.href} onClick={() => openCreditLink(credit.href)}>@{credit.name}</button> : credit.name}</div>)}
      </div>
    </div>
  </div>;
};

const Launcher = () => {
  const { token } = AntdToken();

  const [tabSelectedKey, setSelectedKey] = useState("1");

  //Recents Projects ------------------------------------------
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [recentProjects, setRecentProjects] = useState(projectsData);
  const location = useLocation();
  const [versionAPI, setVersionAPI] = useState('');

  const [lastTabSelected, setLastTabSelected] = useState<string | null>(null);
  const [launcherCredits, setLauncherCredits] = useState<LauncherCredit[]>([]);

  useEffect(() => {
    let active = true;

    const handleCreditsUpdated = (_event: unknown, credits: LauncherCredit[]) => {
      if (active && Array.isArray(credits)) setLauncherCredits(credits);
    };
    window.electronAPI.on('credits-updated', handleCreditsUpdated);

    void window.electronAPI.loadCredits().then((credits: LauncherCredit[]) => {
      if (active && Array.isArray(credits)) setLauncherCredits(credits);
    }).catch((error: unknown) => {
      console.warn('Could not load launcher credits:', error);
    });

    return () => {
      active = false;
      window.electronAPI.removeListener('credits-updated', handleCreditsUpdated);
    };
  }, []);

  useLayoutEffect(() => {
    const loadPreferences = async () => {
      try {
        await window.electronAPI.loadPreferences().then((preferencias: { recentProjects?: Project[] }) => {
          console.log('..: Carregando projetos recentes: ', preferencias.recentProjects?.length);
          setRecentProjects(preferencias.recentProjects || []);
        });

        await window.electronAPI.loadLastSplashTab().then((lastSplashTab: string) => {
          console.log('..: Carregando última tab selecionada: ', lastSplashTab);
          setLastTabSelected(lastSplashTab);
        });

        setPreferencesLoaded(true);
      } catch (error) {
        console.error('Erro ao carregar preferências:', error);
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;

    const query = new URLSearchParams(location.search);
    const tab = query?.get('tab');
    console.info('..: Tab passada para o launcher: %s, quantidade recentes: %d e ultima tab selecionada: %s', tab, recentProjects.length, lastTabSelected);

    if (tab === 'recent_project') {
      setSelectedKey("2");
      console.log('..: Recent selected');
    } else if (tab === 'new_project') {
      setSelectedKey("1");
      console.log('..: New selected');
    } else {
      if (lastTabSelected === 'recent_project') {
        setSelectedKey("2");
        console.log('..: Recent selected');
      } else {
        setSelectedKey("1");
        console.log('..: New selected');
      }
    }

    setIsLoading(false);
  }, [preferencesLoaded]);

  const handleRemoveProject = (title: string, path: any) => {
    message.success(`${title} removido dos recentes`);
    const removedProject = recentProjects.filter(project => project.path !== path);
    setRecentProjects(removedProject);
    window.electronAPI.removePreferences("recentProjects", removedProject);
  };

  const handleSelectProject = (projetctPath: string) => {
    console.log('..:: Selecionando projeto no recentes ::..');
    window.electronAPI.send('load-project-window', projetctPath);
  };
  // Recents Projects - END ------------------------------------

  const handleMenuClick = async (e: any) => {
    if (e.key === '5') {
      console.log('..: Chamando a busca de projeto');
      window.electronAPI.send('open-project-window', null);
    } else if (e.key == '3') {
      console.log('..: Documentation clicado');
      window.electronAPI.send('open-documentation', null);
    }
    else {
      setSelectedKey(e.key);
    }
  }

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
    background: token.colorBgLayout
  };

  if (isLoading) {
    return (
      <AntDApp>
        <Layout style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Spin size="large" percent={'auto'} indicator={<Loading3QuartersOutlined spin />} />
        </Layout>
      </AntDApp>
    );
  }

  const fetchVersions = async () => {
    const fetchedVersions = await window.electronAPI.getVersionsAPI();
    setVersionAPI(fetchedVersions.projectVersion);
  };

  fetchVersions();

  return (
    <AntDApp>
      <Layout hasSider style={{ minHeight: '100vh', /*width: '100vw', */overflow: 'hidden' }}>
        <Sider width={200} style={siderStyle}>
          <Content style={{ paddingTop: '35px', paddingBottom: '16px', textAlign: 'center', fontSize: 11 }}>
            <Image
              width={150}
              src="error"
              fallback={iconGBA}
              alt="GBA Studio Image"
              preview={false}
              style={{ marginBottom: 10, /*transition: 'transform 1.5s ease'*/ }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.transition = 'transform 0.4s ease';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            />
            <div>GBA Studio {versionAPI}</div>
          </Content>
          <Menu
            mode="inline"
            // defaultSelectedKeys={['1']}
            selectedKeys={[tabSelectedKey]}
            onClick={handleMenuClick}
            style={{ background: token.colorBgLayout, height: '100%', /*borderRight: 0, marginTop: 15*/ }}
            items={[
              { label: <span>New</span>, key: "1", icon: <FileAddOutlined />, style: { height: 26, marginBottom: 0, color: tabSelectedKey === '1' ? token.colorTextLightSolid : undefined } },
              { label: <span>Recent</span>, key: "2", icon: <FileTextOutlined />, style: { height: 26, marginBottom: 0, color: tabSelectedKey === '2' ? token.colorTextLightSolid : undefined } },
              { label: <span>Documentation</span>, key: "3", icon: <BookOutlined />, style: { height: 26, marginBottom: 0, color: tabSelectedKey === '3' ? token.colorTextLightSolid : undefined } },
              { label: <span>Credits</span>, key: "4", icon: <TeamOutlined />, style: { height: 26, marginBottom: 0, color: tabSelectedKey === '4' ? token.colorTextLightSolid : undefined } },
              // { type: 'divider' },
              { label: <span>Open Project</span>, key: "5", icon: <FolderOpenOutlined />, style: { height: 26, marginTop: 30, color: tabSelectedKey === '5' ? token.colorTextLightSolid : undefined } }
            ]}
          />
        </Sider>
        <Layout style={{ background: tabSelectedKey === "1" ? token.colorBgTextActive : token.colorBorder, marginInlineStart: 200, /*height: '100vh',*/ width: "100vw" }}>
          <Content
            style={{
              padding: 5,
              // margin: '16px 16px 0',
              // minHeight: 280,
              // background: colorBgContainer,
            }}
          >
            {tabSelectedKey === "1" && <NewProjectForm />}
            {tabSelectedKey === "2" && <RecentProjectList projects={recentProjects} handleRemoveProject={handleRemoveProject} handleSelectProject={handleSelectProject} />}
            {tabSelectedKey === "4" && <CreditsRoll color={token.colorText} accent={token.colorPrimary} sourceCredits={launcherCredits} />}
            {tabSelectedKey === "5"}
          </Content>
        </Layout>
      </Layout>
    </AntDApp>
  )
};

export default Launcher;

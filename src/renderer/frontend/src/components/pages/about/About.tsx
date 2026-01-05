import React, { useEffect, useState } from "react";
import { Typography, Image, Layout, Space } from "antd";
import { AntdToken } from '../../common/AntDToken';

import imageGBA from '@/img/defaultImgIcon.png';

const About: React.FC = () => {
  const { token } = AntdToken();
  const [versions, setVersions] = useState({ electron: '', chrome: '', node: '', v8: '', projectVersion: '' });

  const handleImageClick = () => {
    window.electronAPI.openBrowser("https://sacigamer.github.io/gba-studio-site/about");
  };

  useEffect(() => {
    const fetchVersions = async () => {
      const fetchedVersions = await window.electronAPI.getVersionsAPI();
      setVersions(fetchedVersions);
    };
    fetchVersions();
  }, []);

  return (
    <Layout style={{ height: '100vh', display: 'flex', justifyContent: "stretch", alignContent: "center" }}>
      <Typography style={{
        textAlign: 'center',
        fontSize: '12px',
        // lineHeight: '0.5',
      }}>
        <Image
          src={imageGBA}
          alt="GBA Studio com link do site"
          preview={false}
          style={{ cursor: "pointer", maxWidth: '45%', marginTop: '10px' }}
          onClick={handleImageClick}
        />
        <Typography.Title level={4} style={{ lineHeight: '0.5' }}>GBA Studio {versions.projectVersion}</Typography.Title>
        <Typography.Title level={5} style={{ lineHeight: '0.5' }}>Engine Game Boy Advance</Typography.Title>
        <div style={{ marginBlock: '15px' }}>Distributed under MIT license.</div>  
        <Space direction="vertical" style={{ rowGap: 0 }}>
          <Typography.Text type="secondary"> electron  : {versions.electron} </Typography.Text>
          <Typography.Text type="secondary"> chrome    : {versions.chrome} </Typography.Text>
          <Typography.Text type="secondary"> node      : {versions.node} </Typography.Text>  
          <Typography.Text type="secondary"> v8        : {versions.v8} </Typography.Text>
        </Space>
      </Typography>
    </Layout>
  );
};

export default About;

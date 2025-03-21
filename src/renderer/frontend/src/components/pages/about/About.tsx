import React, { useEffect, useState } from "react";
import { Typography, Image, Layout } from "antd";
import { AntdToken } from '../../common/AntDToken';

import imageGBA from '@/img/defaultImgIcon.png';

const About: React.FC = () => {
  const { token } = AntdToken();
  const [versions, setVersions] = useState({ electron: '', chrome: '', node: '', v8: '', projectVersion: '' });

  const handleImageClick = () => {
    window.electronAPI.openBrowser("https://google.com.br/?gbastudio");
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
        color: token.colorTextDisabled,
        lineHeight: '0.5',
      }}>
        <Image
          src={imageGBA}
          alt="GBA Studio com link do site"
          preview={false}
          style={{ cursor: "pointer", maxWidth: '45%', marginTop: '10px' }}
          onClick={handleImageClick}
        />
        <h4 style={{ lineHeight: '0.5' }}>GBA Studio {versions.projectVersion}</h4>
        <h5 style={{ lineHeight: '0.5' }}>Engine Game Boy Advance</h5>
        <div style={{ marginBlock: '25px' }}>Distributed under MIT license.</div>  
        <div>
          <p>electron  : {versions.electron}</p>
          <p>chrome    : {versions.chrome}</p>
          <p>node      : {versions.node}</p>
          <p>v8        : {versions.v8}</p>
        </div>          
      </Typography>
    </Layout>
  );
};

export default About;

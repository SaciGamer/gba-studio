import React, { useEffect } from 'react';
// import './SplashScreen.css'; // Arquivo CSS para estilizar a splash screen
import { Content, Header } from 'antd/es/layout/layout';
import imageGBA from '../splashScreen/img/defaultImgIcon.png';
import { Typography } from 'antd';

const SplashScreen = () => {

  return (
    <Content className="splash-screen" style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'column',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'transparent',
      zIndex: 9999
    }}>
      <img src={imageGBA} alt="Logo" style={{
        width: '400px',
        height: 'auto',
      }} />
      <Typography style={{
        marginTop: '10px',
        fontSize: '20px',
        color: '#808080',
      }}>
        Bem-vindo ao GBA-Studio!
      </Typography>
    </Content>
  );
};

export default SplashScreen;

import { Content } from 'antd/es/layout/layout';
import { Image, Typography } from 'antd';

import imageGBA from '@/img/defaultImgIcon.png';

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
      <Image
        src={imageGBA}
        alt="splashImage"
        preview={false} style={{
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

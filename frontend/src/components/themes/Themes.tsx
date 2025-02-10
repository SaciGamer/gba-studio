import { theme } from 'antd'

const { defaultAlgorithm, darkAlgorithm } = theme;

const Themes = {
  light: {
    token: {
      colorPrimary: '#ffa500',
      // colorTextBase: '#000000',
      colorBgBase: '#ffffff',
      // borderRadius: '4px',
      // colorSuccess: '#52c41a',
      // colorWarning: '#faad14',
      // colorError: '#f5222d',
      // colorBgContainer: '#f0f0f0',
      // colorBgContainerDisabled: '#d9d9d9',
      // colorBgElevated: '#ffffff',
      // colorTextPlaceholder: '#000000', // Placeholder cinza
      // colorBorder: '#000000',
      controlHeightLG: '50px', // Define a altura dos componentes grandes
      algorithm: defaultAlgorithm,
    },
  },
  dark: {
    token: {
      colorPrimary: '#ffa500',
      // colorText: '#ffffff', // não pega todos os textos
      colorTextBase: '#ffffff',
      colorBgBase: '#353535',
      // borderRadius: '4px',
      // colorSuccess: '#52c41a',
      // colorWarning: '#faad14',
      // colorError: '#f5222d',
      colorBgContainer: '#6E6E6E',
      // colorBgContainerDisabled: '#505050',
      colorBgElevated: '#353535',
      // colorTextPlaceholder: '#ffffff', // Placeholder cinza
      controlHeightLG: '50px', // Define a altura dos componentes grandes
      // paddingXXS: '4px', // Define o padding extra pequeno
      // borderRadiusSM: '14px', // Define o border radius pequeno

      algorithm: [theme.darkAlgorithm, theme.compactAlgorithm]
    },
  },
  gamecube: {
    token: {
      colorPrimary: '#6A5ACD',
      colorTextBase: '#F8D030',
      colorBgBase: '#483D8B',
      borderRadius: '20px',
      colorSuccess: '#78C850', // Verde
      colorWarning: '#F8D030', // Amarelo
      colorError: '#ff3333', // Vermelho
      // colorBgContainer: '#088A08',
      colorBgContainerDisabled: '#2c2c2c',
      colorBgElevated: '#04B45F',
      colorFill: '#e60012',
      // colorTextPlaceholder: '#ffffff',
      colorBorder: '#ff3333 ',
      controlHeightLG: '50px', // Aumenta a altura dos botões grandes
      // paddingXXS: '4px',
      // borderRadiusSm: '4px',
      // controlHeightSM: '32px', // Aumenta a altura dos botões pequenos
      // controlHeight: '50px', // Aumenta a altura dos botões padrão
    },
  },
  nintendo: {
    token: {
      colorPrimary: '#e60012', // Cor primaria
      colorTextBase: '#FFFFFF', // Cor textos
      colorBgBase: '#D8D8D8',
      borderRadius: '0px', // Mais quadrado
      colorSuccess: '#52c41a',
      colorWarning: '#faad14',
      colorError: '#f5222d',
      colorBgContainer: '#505050', // Cor de fundo dos botões e inputs
      colorBgContainerDisabled: '#D8D8D8', // Cor de fundo desabilitada dos botões e inputs
      colorBgElevated: '#000000', // Cor de fundo dos menus suspensos
      colorTextPlaceholder: '#FFFFFF', // Placeholder cinza
      colorFill: '#e60012',
      fontSize: 18,
      colorBorder: '#000000',
    },
  },
  blue: {
    token: {
      colorPrimary: '#007BFF',
      colorTextBase: '#ffffff',
      colorBgBase: '#0080FF',
      borderRadius: '6px',
      colorSuccess: '#52c41a',
      colorWarning: '#faad14',
      colorError: '#f5222d',
      colorBgContainer: '#0489B1',
      colorBgContainerDisabled: '#003f7f',
      colorBgElevated: '#045FB4',
      // colorTextPlaceholder: '#ffffff',
    },
  },
  silver: {
    token: {
      colorPrimary: '#C0C0C0',
      colorTextBase: '#000000',
      colorBgBase: '#E0E0E0',
      borderRadius: '10px',
      colorSuccess: '#52c41a',
      colorWarning: '#faad14',
      colorError: '#f5222d',
      colorBgContainer: '#E0E0E0',
      colorBgContainerDisabled: '#B0B0B0',
      colorBgElevated: '#6E6E6E',
      // colorTextPlaceholder: '#000000',
    },
  },
};

export default Themes;
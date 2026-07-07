import { theme } from 'antd'

const Themes: Record<string, any> = {
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
      colorBorder: '#808080',
      controlHeightLG: '50px', // Define a altura dos componentes grandes
      
    },
    algorithm: [theme.defaultAlgorithm],
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

      // Splitter: {
      //   splitBarDraggableSize: 100,
      //   splitBarSize: 10,
      //   splitTriggerSize: 100
      // },

      // floatBtnDefault: '#78C850',
      // floatBtnBody: '#78C850',
      // floatBtnIcon: '#78C850',
      margin: 10

    }, 
    // algorithm: [theme.darkAlgorithm, theme.compactAlgorithm],
    components: {
      Tree: {
        nodeSelectedBg: '#ffa500',
        nodeHoverBg: '#353535',
      },
      Collapse: {
        // headerBg: '#6E6E6E', // Caso não use a config no painel
        contentBg:'#353535', // caso precise trocar a cor do fundo do colapse
        padding: 10,
      },
      Tooltip: {
        borderRadius: 4,                                            // Borda arredondada
        colorTextLightSolid: '#ffffff',                             // Cor do texto
        colorBgSpotlight: 'rgba(0, 0, 0, 0.8)',                   // Cor de fundo do tooltip
        //--------------------
        zIndexPopup: 1070,                                          // z-index do popup
        paddingXS: 8,                                               // Padding interno
        marginXS: 8,                                                // Margem
        boxShadowSecondary: '0 6px 16px 0 rgba(0, 0, 0, 0.08)',   // Sombra
        controlHeight: 32,                                          // Altura
      },
      Button: {
        borderRadius: 4,
        padding: '10px',
        primaryShadow: '0',
      }
    }
  },
  gamecube: {
    token: {
      colorPrimary: '#6A5ACD',
      colorTextBase: '#F8D030',
      colorBgBase: '#483D8B',
      // borderRadius: '20px',
      colorSuccess: '#78C850', // Verde
      colorWarning: '#F8D030', // Amarelo
      colorError: '#ff3333', // Vermelho
      // colorBgContainer: '#088A08',
      colorBgContainerDisabled: '#2c2c2c',
      colorBgElevated: '#088A08',
      colorFill: '#e60012',
      // colorTextPlaceholder: '#ffffff',
      // colorBorder: '#ff3333 ', // Borda e Titulo do LeftMenu
      controlHeightLG: '50px', // Aumenta a altura dos botões grandes
      // paddingXXS: '4px',
      // borderRadiusSm: '4px',
      // controlHeightSM: '32px', // Aumenta a altura dos botões pequenos
      // controlHeight: '50px', // Aumenta a altura dos botões padrão
    },
    components: {
      Collapse: {
        contentBg:'#483D8B', // caso precise trocar a cor do fundo do colapse
        padding: 10,
      },
      Tooltip: {
        borderRadius: 20,                                            // Borda arredondada
        colorTextLightSolid: '#F8D030',                              // Cor do texto
        colorBgSpotlight: 'rgba(243, 11, 11, 0.8)',                // Cor de fundo do tooltip
        //--------------------
      },
      Button: {
        borderRadius: 20,
      }
    }
  },
  nintendo: {
    token: {
      colorPrimary: '#e60012', // Cor primaria
      colorTextBase: '#FFFFFF', // Cor textos
      colorBgBase: '#979797',
      colorSuccess: '#52c41a',
      colorWarning: '#faad14',
      colorError: '#f5222d',
      colorBgContainer: '#505050', // Cor de fundo dos botões e inputs
      colorBgContainerDisabled: '#D8D8D8', // Cor de fundo desabilitada dos botões e inputs
      colorBgElevated: '#000000', // Cor de fundo dos menus suspensos
      colorTextPlaceholder: '#979797', // Placeholder cinza
      colorFill: '#e60012',
      fontSize: 15,
      colorBorder: '#000000',
      controlHeightLG: '45px',
      borderRadius: '0px', // Mais quadrado
      "borderRadiusXS": 0,
      "borderRadiusSM": 0,
      "borderRadiusLG": 0,
      "padding": 8,
      "paddingSM": 4,
      "paddingLG": 12,
      "margin": 8,
      "marginSM": 4,
      "marginLG": 12,
      "boxShadow": "none",
      "boxShadowSecondary": "none",
      
    },
    components: {
      Collapse: {
        contentBg:'#979797', // caso precise trocar a cor do fundo do colapse
        padding: 10,
      },
      Tooltip: {
        borderRadius: 20,                                            // Borda arredondada
        colorTextLightSolid: '#F8D030',                              // Cor do texto
        colorBgSpotlight: 'rgba(243, 11, 11, 0.8)',                // Cor de fundo do tooltip
      }
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

      controlHeightLG: '50px',
    },
    components: {
      Collapse: {
        // headerBg: '#6E6E6E', // Caso não use a config no painel
        contentBg:'#0080FF', // caso precise trocar a cor do fundo do colapse
        padding: 10,
      },
    }
  },
  silver: {
    token: {
      colorPrimary: '#93a5bb',
      colorTextBase: '#000000',
      colorBgBase: '#e0e0e0',
      borderRadius: '10px',
      colorSuccess: '#52c41a',
      colorWarning: '#faad14',
      colorError: '#f5222d',
      colorBgContainer: '#E0E0E0',
      colorBgContainerDisabled: '#B0B0B0',
      colorBgElevated: '#6E6E6E',
      colorBorder: '#808080',
      // colorTextPlaceholder: '#000000',

      controlHeightLG: '45px',
    },
  },
};

export default Themes;
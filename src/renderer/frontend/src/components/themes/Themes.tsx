import { Layout, theme } from 'antd'

const legacySliderTokens = {
  controlSize: 12,
  railSize: 4,
  handleSize: 12,
  handleSizeHover: 12,
  handleLineWidth: 2,
  handleLineWidthHover: 2,
};

const modernSliderTokens = {
  controlSize: 10,
  railSize: 4,
  handleSize: 10,
  handleSizeHover: 12,
  handleLineWidth: 2,
  handleLineWidthHover: 2.5,
};

const floatingMenuTokens = {
  floatButtonSize: 50,
  floatButtonIconSize: 30,
};

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
      colorBgSolidActive: '#ffa500',
      colorPrimaryBg: '#ffa500',
      controlItemBgActive: '#ffa500',
      // colorBgElevated: '#ffffff',
      // colorTextPlaceholder: '#000000', // Placeholder cinza
      colorBorder: '#808080',
      controlHeightLG: '50px', // Define a altura dos componentes grandes
      
    },
    algorithm: [theme.defaultAlgorithm],
    components: { Slider: legacySliderTokens },
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
     
      colorBgSolidActive: '#ffa500',
      colorPrimaryBg: '#ffa500',
      controlItemBgActive: '#ffa500',
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
      Slider: legacySliderTokens,
      FloatButton: floatingMenuTokens,
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
      colorBgSolidActive: '#6A5ACD',
      colorPrimaryBg: '#6A5ACD',
      controlItemBgActive: '#6A5ACD',
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
      Slider: legacySliderTokens,
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
      colorBgSolidActive: '#e60012',
      colorPrimaryBg: '#e60012',
      controlItemBgActive: '#e60012',
      colorBgElevated: '#000000', // Cor de fundo dos menus suspensos
      colorTextPlaceholder: '#979797', // Placeholder cinza
      colorFill: '#e60012',
      fontSize: 15,
      colorBorder: '#000000',
      controlHeightLG: '50px',
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
      Slider: legacySliderTokens,
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
      colorBgBase: '#0026ff',
      borderRadius: '6px',
      colorSuccess: '#52c41a',
      colorWarning: '#faad14',
      colorError: '#f5222d',
      colorBgContainer: '#0489B1',
      colorBgContainerDisabled: '#003f7f',
      colorBgSolidActive: '#007BFF',
      colorPrimaryBg: '#007BFF',
      controlItemBgActive: '#007BFF',
      colorBgElevated: '#045FB4',
      // colorTextPlaceholder: '#ffffff',

      controlHeightLG: '50px',
    },
    components: {
      Slider: legacySliderTokens,
      Collapse: {
        // headerBg: '#6E6E6E', // Caso não use a config no painel
        contentBg:'#0026ff', // caso precise trocar a cor do fundo do colapse
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
      colorPrimaryBg: '#93a5bb',
      colorBorder: '#808080',
      // colorTextPlaceholder: '#000000',

      controlHeightLG: '50px',
    },
    components: { Slider: legacySliderTokens },
  },
  glass: {
    algorithm: [theme.defaultAlgorithm],
    token: {
      colorPrimary: '#1677ff',
      colorBgBase: '#dce7f0',
      colorBgContainer: 'rgba(255, 255, 255, 0.42)',
      colorBgElevated: 'rgba(255, 255, 255, 0.72)',
      colorPrimaryBg: 'rgba(255, 255, 255, 0.42)',
      colorBorder: 'rgba(255, 255, 255, 0.52)',
      colorBorderSecondary: 'rgba(85, 85, 85, 0.16)',
      borderRadius: 12,
      borderRadiusSM: 10,
      borderRadiusLG: 12,
      controlHeightLG: 50,
      boxShadow: '0 8px 24px rgba(85, 85, 85, 0.1)',
      boxShadowSecondary: '0 8px 24px rgba(85, 85, 85, 0.1)',
    },
    components: {
      Slider: modernSliderTokens,
      FloatButton: floatingMenuTokens,
      Button: { primaryShadow: 'none', dangerShadow: 'none', defaultShadow: 'none' },
      Layout: { bodyBg: 'rgba(255, 255, 255, 0.16)', headerBg: 'rgba(255, 255, 255, 0.32)', siderBg: 'rgba(255, 255, 255, 0.18)' },
      Menu: { itemBg: 'transparent', subMenuItemBg: 'transparent', itemHoverBg: 'rgba(255, 255, 255, 0.28)', itemSelectedBg: 'rgba(255, 255, 255, 0.38)' },
      Progress: { remainingColor: 'rgba(255, 255, 255, 0.3)' },
    },
  },
  bootstrap: {
    algorithm: [theme.defaultAlgorithm],
    token: {
      colorPrimary: '#337ab7',
      colorInfo: '#3a87ad',
      colorBgBase: '#f8f9fa',
      colorBgContainer: '#ffffff',
      colorPrimaryBg: '#337ab7',
      colorBorder: '#b8bec5',
      borderRadius: 4,
      borderRadiusSM: 3,
      borderRadiusLG: 6,
      controlHeightLG: 50,
    },
    components: {
      Slider: modernSliderTokens,
      FloatButton: floatingMenuTokens,
      Layout: { bodyBg: '#f8f9fa', headerBg: '#ffffff', siderBg: '#ffffff', triggerBg: '#e9ecef', triggerColor: '#212529' },
      Menu: { itemBg: 'transparent', subMenuItemBg: 'transparent' },
      Tooltip: { fontSize: 12 },
      Progress: { defaultColor: '#337ab7', remainingColor: '#f5f5f5' },
    },
  },
  cartoon: {
    algorithm: [theme.defaultAlgorithm],
    token: {
      colorText: '#51463B',
      colorPrimary: '#225555',
      colorError: '#DA8787',
      colorInfo: '#9CD3D3',
      colorBorder: '#225555',
      colorBorderSecondary: '#88BBBB',
      colorBgBase: '#FAFAEE',
      colorBgContainer: '#fffdf3',
      colorPrimaryBg: '#9CD3D3',
      lineWidth: 2,
      lineWidthBold: 2,
      borderRadius: 18,
      borderRadiusSM: 14,
      borderRadiusLG: 18,
      controlHeightSM: 28,
      controlHeight: 36,
      controlHeightLG: 50,
    },
    components: {
      Slider: modernSliderTokens,
      FloatButton: floatingMenuTokens,
      Button: { primaryShadow: 'none', dangerShadow: 'none', defaultShadow: 'none' },
      Layout: { bodyBg: '#FAFAEE', headerBg: '#F6D878', siderBg: '#F5E8C0', triggerBg: '#E8D29A', triggerColor: '#51463B' },
      Menu: { itemBg: 'transparent', subMenuItemBg: 'transparent' },
      Select: { optionSelectedBg: '#CBC4AF' },
      Progress: { defaultColor: '#225555', remainingColor: '#CBC4AF' },
    },
  },
};

// Informational alerts use each theme's primary color, lightened by 40% white.
// Component tokens keep this styling consistent for every Ant Design Alert.
for (const configuredTheme of Object.values(Themes)) {
  const primary = configuredTheme.token.colorPrimary as string;
  const background = '#' + [1, 3, 5].map(offset => {
    const channel = parseInt(primary.slice(offset, offset + 2), 16);
    return Math.round(channel * 0.6 + 255 * 0.4).toString(16).padStart(2, '0');
  }).join('');
  configuredTheme.components = {
    ...configuredTheme.components,
    Alert: {
      ...configuredTheme.components?.Alert,
      colorInfoBg: background,
      colorInfoBorder: primary,
      colorInfo: '#141414',
      colorText: '#141414',
      colorTextHeading: '#141414',
    },
  };
}

export default Themes;

import React, { useState, useRef, useEffect } from 'react';
import { DownOutlined, RightOutlined, PlusOutlined, SearchOutlined, CaretRightOutlined, CaretRightFilled, CaretDownFilled, DollarCircleOutlined, CodeSandboxOutlined, PaperClipOutlined, JavaScriptOutlined, FileOutlined, FileTextOutlined, RadarChartOutlined, AppstoreAddOutlined, AppstoreOutlined, BuildOutlined } from '@ant-design/icons';
import { Input, Layout, Splitter, Flex, theme, Collapse, CollapseProps, Affix, Slider } from 'antd';
import { useBlockContext } from './BlockContext.tsx';
import { AntdToken } from '../components/common/AntDToken.ts';
import CollapsePanel from 'antd/es/collapse/CollapsePanel';
import Panel from 'antd/es/splitter/Panel';

const { Header, Sider, Content } = Layout;

// Definindo a interface para os props
interface LeftPanelProps {
  selectBlock: (id: number) => void;
  selectedBlockId: number | null;
}

interface Block {
  id: number;
  content: string;
  sceneId: number
}

const LeftPanel: React.FC<LeftPanelProps> = ({ selectBlock, selectedBlockId }) => {
  const { blocks, addBlockToGrid } = useBlockContext();

  const [isScenesOpen, setIsScenesOpen] = useState(true);
  const [isScriptsOpen, setIsScriptsOpen] = useState(true);
  const [isVariablesOpen, setIsVariablesOpen] = useState(true);

  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const searchInputRef = useRef<any>(null);
  const { token } = AntdToken();

  const toggleSection = (section: string) => {
    switch (section) {
      case 'scenes':
        setIsScenesOpen(!isScenesOpen);
        break;
      case 'scripts':
        setIsScriptsOpen(!isScriptsOpen);
        break;
      case 'variables':
        setIsVariablesOpen(!isVariablesOpen);
        break;
      default:
        break;
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const filteredBlocks = blocks.filter(block =>
    block.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSearchClick = () => {
      setIsSearchVisible(!isSearchVisible);
      if (isSearchVisible) {
        setSearchTerm('');
      }
  };

  useEffect(() => {
    if (isSearchVisible && searchInputRef.current) {
      searchInputRef.current?.focus();
    }
  }, [isSearchVisible]); 

  const [sizes, setSizes] = useState([30, 10, 10]); // Tamanhos iniciais dos Splitter Panels

  const handleDragEnd = (newSizes: any) => {
    console.log("..: Resize do Splitter %d, painel1: %s, painel2: %s", newSizes, newSizes[1], newSizes[2]);
    setSizes(newSizes);
    if (newSizes[0] <= 6) { // Verificar se o primeiro painel atingiu o mínimo
      toggleSection('scene'); // Chamar a função de colapsar
    }
    if (newSizes[1] <= 6) { // Verificar se o segundo painel atingiu o mínimo
      toggleSection('scripts'); // Chamar a função de colapsar
    }
    if (newSizes[2] <= 6) { // Verificar se o terceiro painel atingiu o mínimo
      toggleSection('variables'); // Chamar a função de colapsar
    }
  };

  return (
      <Splitter style={{ height: '100%', background: token.colorBgBase }} layout="vertical" onResizeEnd={handleDragEnd}>
        <Splitter.Panel defaultSize="30%" min="6%" max="95%">
          <Affix offsetTop={65}>
            <div className="p-2 text-mode" style={{ position: 'sticky', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: token.colorBgMask}}>
              <div className="flex items-center" onClick={() => toggleSection('scenes')}>
                {isScenesOpen ? <CaretDownFilled /> : <CaretRightFilled />}
                <h2 className="font-bold ml-2">SCENES</h2>
              </div>
              <div className="flex items-center">
                <PlusOutlined className="ml-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); addBlockToGrid(-1, "New Scene Block Left Panel") }} />
                <SearchOutlined className={`ml-2 p-1`} style={{backgroundColor: isSearchVisible ? token.colorPrimary : 'transparent'}} onClick={handleSearchClick}/>
              </div>
            </div>
          </Affix>
          <Content style={{ overflowY: 'auto', height: 'calc(100% - 35px)' }}>  {/* Ajustando contêiner de rolagem */}
          <div className="p-2 text-mode" >
              {isScenesOpen && (
                <div>
                  {isSearchVisible && <Input placeholder="Search scenes" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="mb-2" style={{ borderRadius: token.borderRadius }}/>}
                  {filteredBlocks.map(block => (
                    <div key={block.id} onClick={() => selectBlock(block.id)} 
                      style={{
                        backgroundColor: selectedBlockId === block.id ? token.colorPrimary : token.colorBgBase, 
                        borderRadius: token.borderRadius
                      }}
                    >
                      <CaretRightFilled /><BuildOutlined className='mr-1'/><span>{block.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div> 
          </Content>
        </Splitter.Panel>
        <Splitter.Panel defaultSize="10%" min="6%" max="90%">
          <Content>
            <div className="p-2 text-mode" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: token.colorBgMask}}>
                <div className="flex items-center" onClick={() => toggleSection('scripts')}>
                  {isScriptsOpen ? <CaretDownFilled /> : <CaretRightFilled />}
                  <h2 className="font-bold ml-2">SCRIPTS</h2>
                </div>
                <div className="flex items-center">
                  <PlusOutlined className="ml-2" />
                  <SearchOutlined className={`ml-2 p-1`}/>
                </div>
            </div>
            <div className="p-2 text-mode">
              {isScriptsOpen && (
                <div>
                  {/* Add script list items here */}
                  <p><CaretRightFilled /><FileTextOutlined className='mr-1'/>Script 1</p>
                  <p><CaretRightFilled /><FileTextOutlined className='mr-1'/>Script 2</p>
                </div>
              )}
            </div>
          </Content>
        </Splitter.Panel>
        <Splitter.Panel defaultSize="10%" min="6%" max="90%">
            {/* <Content> */}
            <Collapse bordered={false}>
              <div className="p-2 text-mode" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: token.colorBgMask}}>
                <div className="flex items-center" onClick={() => toggleSection('variables')}>
                  {isVariablesOpen ? <CaretDownFilled /> : <CaretRightFilled />}
                  <h2 className="font-bold ml-2">VARIABLES</h2>
                </div>
                <div className="flex items-center">
                  <SearchOutlined className={`ml-2 p-1`}/>
                </div>
              </div>
            </Collapse>
              
              <div className="p-2 text-mode">
                {isVariablesOpen && (
                  <div>
                    {/* Add variable list items here */}
                    <p><CaretRightFilled /><b>$</b> Variable 1</p>
                    <p><CaretRightFilled /><b>$</b> Variable 2</p>
                  </div>
                )}
              </div>
            {/* </Content> */}
        </Splitter.Panel>
      </Splitter>
  );
};

export default LeftPanel;

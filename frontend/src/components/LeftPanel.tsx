import React, { useState, useRef, useEffect } from 'react';
import { DownOutlined, RightOutlined, PlusOutlined, SearchOutlined, CaretRightOutlined, CaretRightFilled, CaretDownFilled, DollarCircleOutlined, CodeSandboxOutlined, PaperClipOutlined, JavaScriptOutlined, FileOutlined, FileTextOutlined, RadarChartOutlined, AppstoreAddOutlined, AppstoreOutlined, BuildOutlined } from '@ant-design/icons';
import { Input, Layout, Splitter, Flex } from 'antd';
import { useBlockContext } from './BlockContext.tsx';

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

  return (
    <Content className='dark-mode'>
      <Splitter style={{ height: '100%' }} layout="vertical">
        <Splitter.Panel defaultSize="8%" min="8%" max="90%">
          <Content>
            <div className="p-2 text-mode flex justify-between items-center">
              <div className="flex items-center" onClick={() => toggleSection('scenes')}>
                {isScenesOpen ? <CaretDownFilled /> : <CaretRightFilled />}
                <h2 className="font-bold ml-2">SCENES</h2>
              </div>
              <div className="flex items-center">
                <PlusOutlined className="ml-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); addBlockToGrid(-1, "New Scene Block Left Panel") }} />
                <SearchOutlined className={`ml-2 p-1 ${isSearchVisible ? 'bg-blue-300 bordArredondada' : ''}`} onClick={handleSearchClick}/>
              </div>
              
            </div>
            
            <div className="p-2 text-mode" >
              {isScenesOpen && (
                <div>
                  {isSearchVisible && <Input placeholder="Search scenes" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="mb-2 mt-2" style={{ borderRadius: `15px`}}/>}
                  {filteredBlocks.map(block => (
                    <div key={block.id} onClick={() => selectBlock(block.id)} className={`${selectedBlockId === block.id ? 'bg-blue-300 bordArredondada' : ''}`}>
                      <CaretRightFilled /><BuildOutlined className='mr-1'/><span>{block.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div> 
          </Content>
        </Splitter.Panel>
        <Splitter.Panel defaultSize="8%" min="8%" max="90%">
          <Content>
            <div className="p-2 text-mode">
              <div className="flex justify-between items-center">
                <div className="flex items-center" onClick={() => toggleSection('scripts')}>
                  {isScenesOpen ? <CaretDownFilled /> : <CaretRightFilled />}
                  <h2 className="font-bold ml-2">SCRIPTS</h2>
                </div>
                <div className="flex items-center">
                  <PlusOutlined className="ml-2" />
                  <SearchOutlined className={`ml-2 p-1`}/>
                </div>
              </div>
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
        <Splitter.Panel defaultSize="8%" min="8%" max="90%">
            <Content>
              <div className="p-2 text-mode">
                <div className="flex justify-between items-center">
                  <div className="flex items-center" onClick={() => toggleSection('variables')}>
                    {isScenesOpen ? <CaretDownFilled /> : <CaretRightFilled />}
                    <h2 className="font-bold ml-2">VARIABLES</h2>
                  </div>
                  <div className="flex items-center">
                    <SearchOutlined className={`ml-2 p-1`}/>
                  </div>
                </div>
                {isVariablesOpen && (
                  <div>
                    {/* Add variable list items here */}
                    <p><CaretRightFilled /><b>$</b> Variable 1</p>
                    <p><CaretRightFilled /><b>$</b> Variable 2</p>
                  </div>
                )}
              </div>
            </Content>
        </Splitter.Panel>
      </Splitter>
    </Content>
  );
};

export default LeftPanel;

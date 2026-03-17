import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Layout, Button, Space, Radio, InputNumber, Switch } from 'antd';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useElementContext, useSceneContext, useSettingsUtilsContext } from '@/providers/contexts/AppContexts';
import { Affix, Row } from 'antd/lib';
import FloatButttons from './FloatButtons';
import { AntdToken } from './common/AntDToken';
import { AimOutlined, AuditOutlined, BgColorsOutlined, BorderlessTableOutlined, BorderOutlined, CalculatorOutlined, CreditCardOutlined, DeleteOutlined, EditOutlined, PictureFilled, PlusSquareFilled, ReloadOutlined, TagOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';
import { ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';

const { Content } = Layout;

enum SubMenuType {
  TOOLTIP = 'tooltip',
  POPOVER = 'popover',
  DROPDOWN = 'dropdown',
}

interface IActions {
  key: string;
  type?: SubMenuType,
  icon: React.ReactNode;
  iconSize?: number;
  tooltip?: string;
  active?: boolean;
  onClick?: () => void;
  subMenu?: {
    type?: SubMenuType;
    items: {
      key: string;
      icon: React.ReactNode;
      iconSize?: number;
      active?: boolean;
      tooltip?: string;
      onClick: () => void;
    }[];
  };
}

interface TileEditorProps {
  scene: ISceneSettings; // ISceneSettings
  resetPanelSize: any;
  setShowFloatButton: any;
  showFloatButton: boolean;
}

const TileEditor: React.FC<TileEditorProps> = ({ scene, resetPanelSize, setShowFloatButton, showFloatButton }) => {
  const { token } = AntdToken();
  const { setScenes } = useSceneContext();
  const { elementSelected, setElementSelected } = useElementContext();

  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState({ x: 0, y: 0 });
  const [selectionEnd, setSelectionEnd] = useState({ x: 0, y: 0 });
  const [mapTiles, setMapTiles] = useState<number[][]>([]);
  const [isPainting, setIsPainting] = useState(false);

  const { settingUtils, setSettingUtils } = useSettingsUtilsContext();
  const [paintMode, setPaintMode] = useState<'move' | 'brush' | 'stamp' | 'fill' | 'erase' >('move');
  const [showGrid, setShowGrid] = useState(false);
  const zoomIn = () => transformRef.current?.zoomIn();
  const zoomOut = () => transformRef.current?.zoomOut();
  const resetTransform = () => transformRef.current?.resetTransform();

  const [mousePosition, setMousePosition] = useState({ row: -1, col: -1 });
  const [tilesetImage, setTilesetImage] = useState<HTMLImageElement | null>(null);
  const [mapWidth, setMapWidth] = useState(15);
  const [mapHeight, setMapHeight] = useState(10);
  const transformRef = useRef<any>(null);

  // Get selected tiles directly from elementSelected
  const selectedTiles = elementSelected?.selectedTiles || [];

  // Actions to FloatButtons
  const actions: IActions[] = [
    {
      key: 'move',
      icon: <AimOutlined />,
      tooltip: 'Move',
      active: settingUtils.activeButton == 'move',
      onClick: () => setPaintMode('move'),
      subMenu: {
        type: SubMenuType.TOOLTIP,
        items: [
          { key: 'zoomIn', icon: <ZoomInOutlined />, iconSize: 28, tooltip: 'Zoom In', onClick: zoomIn },
          { key: 'zoomOut', icon: <ZoomOutOutlined />, iconSize: 28, tooltip: 'Zoom Out', onClick: zoomOut },
          { key: 'reset', icon: <ReloadOutlined />, iconSize: 28, tooltip: 'Reset', onClick: resetTransform },
          { key: 'grid', icon: <BorderlessTableOutlined />, iconSize: 36, tooltip: 'Toggle Grid', active: showGrid, onClick: () => setShowGrid(prev => !prev) },
        ],
      }
    },
    {
      key: 'brush',
      type: SubMenuType.DROPDOWN,
      icon: <EditOutlined />,
      active: settingUtils.activeButton == 'brush',
      // onClick: () => setPaintMode('brush'),
      subMenu: {
        // type: SubMenuType.POPOVER,
        items: [
          { key: 'Brush', icon: <EditOutlined />, tooltip: 'Edit with Brush', active: settingUtils.activeSubButton == 'Brush', onClick: () => setPaintMode('brush') },
          { key: 'Stamp', icon: <TagOutlined />, tooltip: 'Edit with Stamp', active: settingUtils.activeSubButton == 'Stamp', onClick: () => setPaintMode('stamp') },
          { key: 'Fill', icon: <PictureFilled />, tooltip: 'Edit with Fill', active: settingUtils.activeSubButton == 'Fill', onClick: () => setPaintMode('fill') },
        ],
      },
    },
    {
      key: 'erase',
      icon: <DeleteOutlined />,
      tooltip: 'Erase',
      active: settingUtils.activeButton == 'erase',
      onClick: () => setPaintMode('erase')
    }
  ];

  function resizeTileMap(
    prev: number[][],
    newWidth: number,
    newHeight: number
  ): number[][] {
    const newMap: number[][] = [];

    for (let y = 0; y < newHeight; y++) {
      const oldRow = prev[y] || [];
      const newRow: number[] = [];

      for (let x = 0; x < newWidth; x++) {
        // mantém o valor existente se houver
        newRow[x] = oldRow[x] !== undefined ? oldRow[x] : -1;
      }

      newMap.push(newRow);
    }

    return newMap;
  }

  // Atualiza tiles quando scene ou dimensões mudam
  useEffect(() => {
    const w = elementSelected?.width ? elementSelected.width / 16 : 15;
    const h = elementSelected?.height ? elementSelected.height / 16 : 10;

    setMapWidth(w);
    setMapHeight(h);

    setMapTiles(prev => {
      if (scene?.tileMap) {
        return resizeTileMap(scene.tileMap, w, h);
      }
      return resizeTileMap(prev, w, h);
    });
  }, [scene, elementSelected?.width, elementSelected?.height]);


  // Load tileset image when tileset changes
  useEffect(() => {
    const loadTilesetImage = async () => {
      if (elementSelected?.selectedTilesetId) {
        try {
          const tilesetData = await window.electronAPI.fetchImages('tilesets');
          if (tilesetData.status === 'success' && tilesetData.fileImages) {
            const selectedTilesetFile = tilesetData.fileImages.find((filename: string) =>
              filename.replace(/\.[^/.]+$/, '') === elementSelected.selectedTilesetId
            );
            if (selectedTilesetFile) {
              const imagePath = `${tilesetData.localPath}/${selectedTilesetFile}`;
              const img = new Image();
              img.onload = () => {
                setTilesetImage(img);
              };
              img.src = imagePath;
            }
          }
        } catch (error) {
          console.error('Error loading tileset image:', error);
          setTilesetImage(null);
        }
      } else {
        setTilesetImage(null);
      }
    };

    loadTilesetImage();
  }, [elementSelected?.selectedTilesetId]);

  const handleMapMouseDown = (row: number, col: number) => {
    if (selectedTiles.length === 0) return;

    if (paintMode === 'stamp') {
      // Stamp mode: paint once on click
      paintTile(row, col);
    } else {
      // Brush and Fill modes: start painting on mouse down
      setIsPainting(true);
      paintTile(row, col);
    }
  };

  const handleMapMouseEnter = (row: number, col: number) => {
    setMousePosition({ row, col });
    if (isPainting && selectedTiles.length > 0 && paintMode !== 'stamp') {
      paintTile(row, col);
    }
  };

  const handleMapMouseLeave = () => {
    setMousePosition({ row: -1, col: -1 });
  };

  const handleMapMouseUp = () => {
    setIsPainting(false);
  };

  const paintTile = (row: number, col: number) => {
    if (selectedTiles.length === 0 || row >= mapHeight || col >= mapWidth || row < 0 || col < 0) return;

    const newMapTiles = [...mapTiles.map(row => [...row])];

    if (paintMode === 'brush') {
      // Brush mode: paint individual tiles
      if (selectedTiles.length === 1) {
        newMapTiles[row][col] = selectedTiles[0];
      } else {
        // Multiple tile selection - paint in a pattern based on selection dimensions
        const dimensions = getSelectionDimensions(selectedTiles);
        const tilesPerRow = tilesetImage ? Math.floor(tilesetImage.naturalWidth / 16) : 10;
        
        // Calculate which tile from the selection to use based on position
        const tileRow = row % dimensions.height;
        const tileCol = col % dimensions.width;
        
        // Find the corresponding tile index in the selection
        const minIndex = Math.min(...selectedTiles);
        const minCol = minIndex % tilesPerRow;
        const minRow = Math.floor(minIndex / tilesPerRow);
        
        const targetCol = minCol + tileCol;
        const targetRow = minRow + tileRow;
        const targetTileIndex = targetRow * tilesPerRow + targetCol;
        
        // Check if this tile index is in our selection
        const tileInSelection = selectedTiles.find((index: number) => index === targetTileIndex);
        if (tileInSelection !== undefined) {
          newMapTiles[row][col] = tileInSelection;
        }
      }
    } else if (paintMode === 'stamp') {
      // Stamp mode: paint the entire selection as a block
      const dimensions = getSelectionDimensions(selectedTiles);
      const tilesPerRow = tilesetImage ? Math.floor(tilesetImage.naturalWidth / 16) : 10;

      // Paint the entire selection block starting from the clicked position
      for (let sRow = 0; sRow < dimensions.height; sRow++) {
        for (let sCol = 0; sCol < dimensions.width; sCol++) {
          const mapRow = row + sRow;
          const mapCol = col + sCol;

          if (mapRow < mapTiles.length && mapCol < mapTiles[0].length) {
            // Calculate the corresponding tile index in the selection
            const minIndex = Math.min(...selectedTiles);
            const minCol = minIndex % tilesPerRow;
            const minRow = Math.floor(minIndex / tilesPerRow);
            
            const targetCol = minCol + sCol;
            const targetRow = minRow + sRow;
            const targetTileIndex = targetRow * tilesPerRow + targetCol;
            
            const tileInSelection = selectedTiles.find((index: number) => index === targetTileIndex);
            if (tileInSelection !== undefined) {
              newMapTiles[mapRow][mapCol] = tileInSelection;
            }
          }
        }
      }
    } else if (paintMode === 'fill') {
      // Fill mode: fill contiguous area with the same tile
      const targetTile = mapTiles[row][col];
      const fillTile = selectedTiles[0]; // Use first selected tile for filling

      if (targetTile !== fillTile) {
        fillArea(newMapTiles, row, col, targetTile, fillTile);
      }
    } else if (paintMode === 'erase') {
      // Erase mode: set tile to -1 (empty)
      newMapTiles[row][col] = -1;
    }

    setMapTiles(newMapTiles);

    // Update scene
    const updatedScene = { ...scene, tileMap: newMapTiles };
    setElementSelected(updatedScene);
    setScenes(prevScenes => prevScenes.map(s =>
      s.id === updatedScene.id
        ? { ...s, ...updatedScene, _saved: false }
        : s
    ));
  };

  const getTileImageStyle = (tileIndex: number): React.CSSProperties => {
    if (tileIndex < 0 || !tilesetImage) {
      return {
        backgroundColor: 'white',
        border: showGrid ? '1px solid #ddd' : 'none'
      };
    }

    const tileWidth = 16;
    const tileHeight = 16;
    const tilesPerRow = Math.floor(tilesetImage.naturalWidth / tileWidth);
    const tileX = (tileIndex % tilesPerRow) * tileWidth;
    const tileY = Math.floor(tileIndex / tilesPerRow) * tileHeight;

    return {
      backgroundImage: `url(${tilesetImage.src})`,
      backgroundPosition: `-${tileX}px -${tileY}px`,
      backgroundSize: `${tilesetImage.naturalWidth}px ${tilesetImage.naturalHeight}px`,
      border: showGrid ? '1px solid #ddd' : 'none'
    };
  };

  const getSelectionDimensions = (selectedTiles: number[]) => {
    if (selectedTiles.length === 0) return { width: 0, height: 0 };
    
    // Para seleções retangulares, precisamos encontrar a largura e altura corretas
    // Assumindo que a seleção foi feita da esquerda para direita, cima para baixo
    const maxIndex = Math.max(...selectedTiles);
    const tilesPerRow = tilesetImage ? Math.floor(tilesetImage.naturalWidth / 16) : 10;
    
    let maxCol = 0;
    let maxRow = 0;
    
    selectedTiles.forEach(tileIndex => {
      const col = tileIndex % tilesPerRow;
      const row = Math.floor(tileIndex / tilesPerRow);
      maxCol = Math.max(maxCol, col);
      maxRow = Math.max(maxRow, row);
    });
    
    // Calcular dimensões baseadas na diferença entre índices mínimo e máximo
    const minIndex = Math.min(...selectedTiles);
    const minCol = minIndex % tilesPerRow;
    const minRow = Math.floor(minIndex / tilesPerRow);
    
    const width = maxCol - minCol + 1;
    const height = maxRow - minRow + 1;
    
    return { width, height };
  };

  const fillArea = (tiles: number[][], startRow: number, startCol: number, targetTile: number, fillTile: number) => {
    const stack = [[startRow, startCol]];
    const visited = new Set<string>();

    while (stack.length > 0) {
      const [row, col] = stack.pop()!;
      const key = `${row},${col}`;

      if (visited.has(key) ||
          row < 0 || row >= tiles.length ||
          col < 0 || col >= tiles[0].length ||
          tiles[row][col] !== targetTile) {
        continue;
      }

      visited.add(key);
      tiles[row][col] = fillTile;

      // Add adjacent tiles
      stack.push([row - 1, col]); // up
      stack.push([row + 1, col]); // down
      stack.push([row, col - 1]); // left
      stack.push([row, col + 1]); // right
    }
  };

  return (
    // Quando colocar o menu flutuante remover o 
    <Layout style={{ width: '100%', height: '100%', backgroundColor: token.colorBgContainer }}>
      <Row >
        <Affix offsetTop={65} onChange={(affixed) => console.log('AFIXADO:: ' + affixed)} >
          <FloatButttons
            actions={actions}
            activeButton={paintMode}
            onResetPanelSize={resetPanelSize} 
            onShowFloatButton={setShowFloatButton} 
            showFloatButton={showFloatButton}
          />
        </Affix>
      </Row>
      <Content style={{ /*backgroundColor: 'red',*/ paddingLeft: 80, paddingTop: 50, width: '100%', height: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Map Canvas - Now takes full central area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* <h3>Map</h3> */}
              <div 
                style={{ 
                  flex: 1, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  // border: '1px solid #ccc',
                  // backgroundColor: '#424242',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <TransformWrapper
                  ref={transformRef}
                  initialScale={1}
                  minScale={0.5}
                  maxScale={4}
                  centerOnInit={false}
                  limitToBounds={false}
                  wheel={{ disabled: false, step: 0.1 }}
                  doubleClick={{ disabled: true }}
                  pinch={{ disabled: false }}
                  panning={{ 
                    // allowLeftClickPan: false, 
                    disabled: paintMode !== 'move',
                    // activationKeys: [ 'Ctrl', 'Shift' ]
                  }}
                >
                  <TransformComponent
                    wrapperStyle={{
                      width: '100%',
                      height: '100%',
                    }}
                    contentStyle={{
                      width: `${mapWidth * 16}px`,
                      height: `${mapHeight * 16}px`,
                      // width: '100%',
                      // height: '100%',
                    }}
                  >
                    {/* Grid container (relative para overlays posicionados) */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${mapWidth}, 16px)`,
                        gridTemplateRows: `repeat(${mapHeight}, 16px)`,
                        gap: 0,
                        position: 'relative'
                      }}
                      onMouseUp={handleMapMouseUp}
                      onMouseLeave={handleMapMouseLeave}
                    >
                
                      {/* Render map tiles */}
                      {mapTiles.map((row, rowIndex) => 
                        row.map((tileIndex, colIndex) => (
                          <div
                            key={`${rowIndex}-${colIndex}`}
                            style={{
                              width: 16,
                              height: 16,
                              cursor: selectedTiles.length > 0 ? 'none' : 'default', // crosshair (+)
                              ...getTileImageStyle(tileIndex)
                            }}
                            onMouseDown={() => handleMapMouseDown(rowIndex, colIndex)}
                            onMouseEnter={() => handleMapMouseEnter(rowIndex, colIndex)}
                          />
                        ))
                      )}

                      {/* Selection preview overlay */}
                      {selectedTiles.length > 0 && mousePosition.row >= 0 && mousePosition.col >= 0 && (
                        <div
                          style={{
                            position: 'absolute',
                            left: mousePosition.col * 16,
                            top: mousePosition.row * 16,
                            pointerEvents: 'none',
                            zIndex: 10
                          }}
                        >
                          {paintMode === 'brush' && (
                            <div
                              style={{
                                width: 16,
                                height: 16,
                                ...getTileImageStyle(selectedTiles[0]),
                                border: '1px solid #ff6b35',
                                opacity: 0.8
                              }}
                            />
                          )}

                          {paintMode === 'stamp' && selectedTiles.length > 0 && (
                            <div style={{ 
                              display: 'grid', 
                              gridTemplateColumns: `repeat(${getSelectionDimensions(selectedTiles).width}, 16px)`,
                              gridTemplateRows: `repeat(${getSelectionDimensions(selectedTiles).height}, 16px)`
                            }}>
                              {selectedTiles.map((tileIndex: number, index: number) => {
                                const dimensions = getSelectionDimensions(selectedTiles);
                                const tilesPerRow = tilesetImage ? Math.floor(tilesetImage.naturalWidth / 16) : 10;
                                const minIndex = Math.min(...selectedTiles);
                                const minCol = minIndex % tilesPerRow;
                                const minRow = Math.floor(minIndex / tilesPerRow);
                                
                                const tileCol = tileIndex % tilesPerRow;
                                const tileRow = Math.floor(tileIndex / tilesPerRow);
                                
                                const relativeCol = tileCol - minCol;
                                const relativeRow = tileRow - minRow;
                                
                                return (
                                  <div
                                    key={index}
                                    style={{
                                      width: 16,
                                      height: 16,
                                      ...getTileImageStyle(tileIndex),
                                      opacity: 0.8,
                                      gridColumn: relativeCol + 1,
                                      gridRow: relativeRow + 1
                                    }}
                                  />
                                );
                              })}

                              {/* Overlay com borda única */}
                              <div
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  top: 0,
                                  width: getSelectionDimensions(selectedTiles).width * 16,
                                  height: getSelectionDimensions(selectedTiles).height * 16,
                                  border: '1px solid #ff6b35',
                                  pointerEvents: 'none'
                                }}
                              />
                            </div>
                          )}

                          {paintMode === 'fill' && (
                            <div
                              style={{
                                width: 16,
                                height: 16,
                                ...getTileImageStyle(selectedTiles[0]),
                                border: '1px solid #ff6b35',
                                // backgroundColor: selectedTiles.length > 0 
                                //   ? `hsl(${(selectedTiles[0] * 37) % 360}, 70%, 70%)`
                                //   : 'transparent',
                                opacity: 0.8
                              }}
                            />
                          )}

                          {paintMode === 'erase' && (
                            <div
                              style={{
                                width: 16,
                                height: 16,
                                border: '1px solid #ff6b35',
                                backgroundColor: 'red',
                                opacity: 0.8
                              }}
                            />
                          )}
                        </div>
                      )}
                      </div>
                  </TransformComponent>
                </TransformWrapper>
              </div>
            </div>
          </div>
      </Content>
      {/* <Content style={{ padding: 16, backgroundColor: 'green', width: '100%', height: '100%' }}>
        <Space direction="vertical" style={{ backgroundColor: 'green'}}>
          <Space>
            <span>Selected tiles: {selectedTiles.length}</span>
            <span>Map size: {mapWidth * 16} x {mapHeight * 16} px ({mapWidth} x {mapHeight} tiles)</span>
          </Space>
          <Space direction="vertical" size="small">
            <span><strong>Map Size (in tiles):</strong></span>
            <Space>
              <div>
                <span>Width: </span>
                <InputNumber
                  min={15}
                  max={50}
                  value={mapWidth}
                  onChange={(value) => handleMapSizeChange('width', (value || 15) * 16)}
                  formatter={(value) => `${value} tiles`}
                  parser={(value) => parseInt(value?.replace(' tiles', '') || '15')}
                />
              </div>
              <div>
                <span>Height: </span>
                <InputNumber
                  min={10}
                  max={50}
                  value={mapHeight}
                  onChange={(value) => handleMapSizeChange('height', (value || 10) * 16)}
                  formatter={(value) => `${value} tiles`}
                  parser={(value) => parseInt(value?.replace(' tiles', '') || '10')}
                />
              </div>
            </Space>
            <span style={{ fontSize: '12px', color: '#666' }}>
              Minimum: 240x160px (15x10 tiles) | Maximum: 800x800px (50x50 tiles)
            </span>
          </Space>
        </Space>
      </Content> */}
    </Layout>
    
  );
};

export default TileEditor;
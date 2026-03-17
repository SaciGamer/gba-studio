import { useElementContext, useSceneContext } from '@/providers/contexts/AppContexts';
import { EImageType, ETypeScene, IBackgroundElement, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { BgColorsOutlined, PictureOutlined } from '@ant-design/icons';
import { Button, Divider, Input, InputNumber, Layout, Select, Space, Tabs, theme, Typography } from 'antd';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackgroundSelector } from './BackgroundSelector';
import CollapseEventManager from './events/CollapseEventManager';
import SelectNewEvent from './events/SelectNewEvent';
import RightPanelGWSettings from './RightPanelGWSettings';

const { useToken } = theme;
const { Content } = Layout;

interface IRightPanelProps {
  controllerView: any;
  isTileEditor?: boolean;
}

const RightPanel: React.FC<IRightPanelProps> = ({ controllerView, isTileEditor = false }) => {
  const { token } = useToken();
  const { scenes, setScenes, ignoredFields } = useSceneContext();
  const { elementSelected, setElementSelected } = useElementContext();

  const [isEditingTitle, setIsEditingTitle ] = useState(false);
  const [availableTilesets, setAvailableTilesets] = useState<any[]>([]);
  const [selectedTiles, setSelectedTiles] = useState<number[]>(elementSelected?.selectedTiles || []);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState({ x: 0, y: 0 });
  const [selectionEnd, setSelectionEnd] = useState({ x: 0, y: 0 });

  const [tileset, setTileset] = useState({
    image: new Image(),
    tileWidth: 16,
    tileHeight: 16,
    columns: 10,
    rows: 10
  });
  const [mapWidth, setMapWidth] = useState(((elementSelected?.width || 240) / tileset.tileWidth));
  const [mapHeight, setMapHeight] = useState(((elementSelected?.height || 160) / tileset.tileHeight));
  const [imageType, setImageType] = useState<EImageType>(EImageType.PALETTE_BITMAP_BG);
  const backgroundLayers = [0, 1, 2, 3];
  const groupEvents = [
    {
      key: 'playerHit1Script',
      label: 'Group 1'
    },
    {
      key: 'playerHit2Script',
      label: 'Group 2'
    },
    {
      key: 'playerHit3Script',
      label: 'Group 3'
    },
  ];
  const [activeLayerKey, setActiveLayerKey] = useState("2");

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load available tilesets
  useEffect(() => {
    const loadTilesets = async () => {
      try {
        if (window.electronAPI && window.electronAPI.fetchImages) {
          const tilesetsData = await window.electronAPI.fetchImages('tilesets');
          if (tilesetsData.status === 'success') {
            // Convert file names to tileset objects
            const tilesets = tilesetsData.fileImages?.map((filename: string, index: number) => ({
              id: filename.replace(/\.[^/.]+$/, ''), // Remove extension for id
              name: filename,
              path: `${tilesetsData.localPath}/${filename}`
            })) || [];
            setAvailableTilesets(tilesets);
          }
        }
      } catch (error) {
        console.error('Error loading tilesets:', error);
        // Fallback to mock tilesets
        setAvailableTilesets([
          { id: 'tileset1', name: 'Grassland Tileset' },
          { id: 'tileset2', name: 'Dungeon Tileset' },
          { id: 'tileset3', name: 'Castle Tileset' }
        ]);
      }
    };

    loadTilesets();
  }, []);

  useEffect(() => {
    if (elementSelected?.height && elementSelected?.width) {
      setMapWidth((elementSelected.width) / tileset.tileWidth);
      setMapHeight((elementSelected.height) / tileset.tileHeight);
    } 

    if (elementSelected?.selectedTiles) {
      setSelectedTiles(elementSelected.selectedTiles);
    }
  }, [elementSelected, tileset.tileWidth, tileset.tileHeight, elementSelected?.width, elementSelected?.height, elementSelected?.selectedTiles]);

  // const handleBackgroundChange = (backgroundData: { preview: string, file: File }) => {
  //   if (elementSelected) {
  //     elementSelected.background = backgroundData.preview;
  //     console.log(`..: RightPanel background file ${backgroundData.file}`);
  //   }
  // };

  const handleTitleClick = () => {
    setIsEditingTitle(true);
    // setNewTitle(elementSelected?.name || '');

  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (elementSelected) {
      const sceneToUpdate = scenes.find(scene => scene.id === elementSelected.id);
      console.log('..: RightPanel sceneToUpdate:', sceneToUpdate);

      const updatedElement = { ...sceneToUpdate, name: e.target.value? e.target.value : `SCENE_${sceneToUpdate?._index}` };
      setElementSelected(updatedElement);
      console.log('..: RightPanel updated element:', elementSelected);

      setScenes(prevScenes => prevScenes.map(scene => 
        scene.id === updatedElement.id 
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      ));
      console.log('..: RightPanel updated array:', scenes)
      // window.electronAPI.updateSettings('scene', updatedElement);
    }
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
  };

  const handleMapSizeChange = (dimension: 'width' | 'height', value: number, elementId: string) => {
    // Ensure minimum size (240x160 for 16px tiles = 15x10 tiles)
    const minTiles = dimension === 'width' ? 15 : 10;
    const maxTiles = 64; // Maximum 64 tiles
    const tileSize = 16;
    
    // Ensure value is multiple of tile size and within bounds
    const clampedValue = Math.max(minTiles, Math.min(maxTiles, Math.floor(value / tileSize)));
    const pixelValue = clampedValue * tileSize;
    
    if (dimension === 'width') {
      setMapWidth(clampedValue);
      const updatedElement = { ...elementSelected, width: pixelValue };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => {
        if (scene.id === updatedElement.id) {
          return { ...scene, ...updatedElement, _saved: false };
        }
          return scene;
        })
      );
    } else {
      setMapHeight(clampedValue);
      const updatedElement = { ...elementSelected, height: pixelValue };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => {
        if (scene.id === updatedElement.id) {
          return { ...scene, ...updatedElement, _saved: false };
        }
          return scene;
        })
      );
    }

  };

  const sceneTypes = [
    { label: 'Top Down', value: ETypeScene.TOPDOWN },
    { label: 'Platformer', value: ETypeScene.PLATFORM },
    { label: 'Adventure', value: ETypeScene.ADVENTURE },
    { label: 'Shoot Em\'Up', value: ETypeScene.SHMUP },
    { label: 'Point Click', value: ETypeScene.POINTNCLICK },
    { label: 'Logo', value: ETypeScene.LOGO }
  ];

  const imageTypes = [
    { icon: <BgColorsOutlined />, label: 'Palette Bitmap BG', value: EImageType.PALETTE_BITMAP_BG },
    { icon: <PictureOutlined />, label: 'DP Direct Bitmap BG', value: EImageType.DP_DIRECT_BITMAP_BG }
  ];

  // Mock tilesets - in a real app, this would come from loaded assets
  const tilesets = availableTilesets.length > 0 ? availableTilesets : [
    { id: 'tileset1', name: 'Grassland Tileset' },
    { id: 'tileset2', name: 'Dungeon Tileset' },
    { id: 'tileset3', name: 'Castle Tileset' }
  ];

  const handleImageTypeChange = (value: EImageType) => {
    if (elementSelected) {
      const updatedElement = { ...elementSelected, imageType: value };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => 
        scene.id === updatedElement.id 
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      ));
    }
  };

  const handleTilesetChange = (value: string) => {
    if (elementSelected) {
      const updatedElement = { ...elementSelected, selectedTilesetId: value };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => 
        scene.id === updatedElement.id 
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      ));
    }
  };

  const handleSceneTypeChange = (value: string) => {
    if (!elementSelected) 
      return;

    // função auxiliar para validar backgrounds
    const validChangeBackgrounds = (): IBackgroundElement[] | undefined => {
      const isHDScene = value === ETypeScene.LOGO || value === ETypeScene.POINTNCLICK;
      const elementSelectIsHD = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;

      if (elementSelectIsHD != isHDScene) {
        // zera todos os backgrounds
        return elementSelected.backgrounds?.map((bg: IBackgroundElement) => ({
          ...bg,
          backgroundId: null,
          name: "",
          path: ""
        }));
      }
      // mantém os backgrounds atuais
      return elementSelected.backgrounds;
    };

    const updatedElement = { 
      ...elementSelected, 
      sceneType: value,
      backgrounds: validChangeBackgrounds(),
      _saved: false
    };

    setElementSelected(updatedElement);
    setScenes(prevScenes => prevScenes.map(scene => 
      scene.id === updatedElement.id 
        ? { ...scene, ...updatedElement } 
        : scene
    ));
  }

  const handleEditMap = () => {
    if (elementSelected && controllerView) {
      // Navigate to Tiles Editor view (contentView = 2)
      controllerView(2);
    }
  };

  // Initialize tileset image
  useEffect(() => {
    const loadTilesetImage = async () => {
      if (elementSelected?.selectedTilesetId) {
        try {
          // Load tileset image from project assets
          const tilesetData = await window.electronAPI.fetchImages('tilesets');
          if (tilesetData.status === 'success' && tilesetData.fileImages) {
            const selectedTilesetFile = tilesetData.fileImages.find((filename: string) =>
              filename.replace(/\.[^/.]+$/, '') === elementSelected.selectedTilesetId
            );
            if (selectedTilesetFile) {
              const imagePath = `${tilesetData.localPath}/${selectedTilesetFile}`;
              const img = new Image();
              img.onload = () => {
                // Calculate tileset dimensions based on actual image size
                const tileWidth = 16;
                const tileHeight = 16;
                const columns = Math.floor(img.naturalWidth / tileWidth);
                const rows = Math.floor(img.naturalHeight / tileHeight);
                
                setTileset({
                  image: img,
                  tileWidth,
                  tileHeight,
                  columns,
                  rows
                });
                // drawTileset();
              };
              img.onerror = () => {
                console.log('Tileset image not found, using generated tileset');
                // Use default generated tileset
                setTileset({
                  image: new Image(),
                  tileWidth: 16,
                  tileHeight: 16,
                  columns: 10,
                  rows: 10
                });
                drawTileset();
              };
              img.src = imagePath;
            } else {
              // Use default generated tileset
              setTileset({
                image: new Image(),
                tileWidth: 16,
                tileHeight: 16,
                columns: 10,
                rows: 10
              });
              drawTileset();
            }
          } else {
            // Use default generated tileset
            setTileset({
              image: new Image(),
              tileWidth: 16,
              tileHeight: 16,
              columns: 10,
              rows: 10
            });
            drawTileset();
          }
        } catch (error) {
          console.error('Error loading tileset:', error);
          // Use default generated tileset
          setTileset({
            image: new Image(),
            tileWidth: 16,
            tileHeight: 16,
            columns: 10,
            rows: 10
          });
          drawTileset();
        }
      }
    };

    loadTilesetImage();
  }, [elementSelected?.selectedTilesetId]);

  const drawTileset = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Desliga o filtro de suavização
    ctx.imageSmoothingEnabled = false;

    // Set canvas size based on tileset
    canvas.width = tileset.columns * tileset.tileWidth;
    canvas.height = tileset.rows * tileset.tileHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If tileset image is loaded, draw it
    if (tileset.image.complete && tileset.image.naturalWidth > 0) {
      ctx.drawImage(tileset.image, 0, 0);
    } else {
      // Draw generated tileset
      for (let row = 0; row < tileset.rows; row++) {
        for (let col = 0; col < tileset.columns; col++) {
          const tileIndex = row * tileset.columns + col;
          ctx.fillStyle = `hsl(${(tileIndex * 37) % 360}, 70%, 70%)`;
          ctx.fillRect(
            col * tileset.tileWidth,
            row * tileset.tileHeight,
            tileset.tileWidth,
            tileset.tileHeight
          );
          ctx.strokeStyle = '#ddd';
          ctx.lineWidth = 1;
          ctx.strokeRect(
            col * tileset.tileWidth,
            row * tileset.tileHeight,
            tileset.tileWidth,
            tileset.tileHeight
          );
        }
      }
    }

    // Highlight selected tiles
    if (elementSelected?.selectedTiles && elementSelected.selectedTiles.length > 0) {
      const cols = elementSelected.selectedTiles.map(
        (tileIndex: number) => tileIndex % tileset.columns
      );
      const rows = elementSelected.selectedTiles.map(
        (tileIndex: number) => Math.floor(tileIndex / tileset.columns)
      );

      const minCol = Math.min(...cols);
      const maxCol = Math.max(...cols);
      const minRow = Math.min(...rows);
      const maxRow = Math.max(...rows);

      const totalWidth = (maxCol - minCol + 1) * tileset.tileWidth;
      const totalHeight = (maxRow - minRow + 1) * tileset.tileHeight;

      // Overlay semi-transparente em cada tile (se quiser manter)
      elementSelected.selectedTiles.forEach((tileIndex: number) => {
        const col = tileIndex % tileset.columns;
        const row = Math.floor(tileIndex / tileset.columns);
        ctx.fillStyle = 'rgba(0, 123, 255, 0.2)';
        ctx.fillRect(
          col * tileset.tileWidth,
          row * tileset.tileHeight,
          tileset.tileWidth,
          tileset.tileHeight
        );
      });

      // Borda única em volta do bloco inteiro
      ctx.strokeStyle = '#007bff';
      ctx.lineWidth = 3;
      ctx.strokeRect(
        minCol * tileset.tileWidth,
        minRow * tileset.tileHeight,
        totalWidth,
        totalHeight
      );
    }

  }, [tileset, elementSelected?.selectedTiles]);

  useEffect(() => {
    drawTileset();
  }, [drawTileset]);

  const handleTilesetMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // If Ctrl is pressed, do individual tile selection
    if (e.ctrlKey) {
      const col = Math.floor(x / tileset.tileWidth);
      const row = Math.floor(y / tileset.tileHeight);
      const tileIndex = row * tileset.columns + col;
      
      if (tileIndex < tileset.columns * tileset.rows) {
        const currentSelected = elementSelected?.selectedTiles || [];
        let newSelectedTiles: number[];
        
        if (currentSelected.includes(tileIndex)) {
          // Remove tile from selection
          newSelectedTiles = currentSelected.filter((t: number) => t !== tileIndex);
        } else {
          // Add tile to selection
          newSelectedTiles = [...currentSelected, tileIndex];
        }
        
        setSelectedTiles(newSelectedTiles);
        
        // Update elementSelected with selected tiles
        if (elementSelected) {
          const updatedElement = { ...elementSelected, selectedTiles: newSelectedTiles };
          setElementSelected(updatedElement);
          setScenes(prevScenes => prevScenes.map(scene => 
            scene.id === updatedElement.id 
              ? { ...scene, ...updatedElement, _saved: false }
              : scene
          ));
        }
      }
      return;
    }

    // Normal rectangular selection
    setSelectionStart({ x, y });
    setSelectionEnd({ x, y });
    setIsSelecting(true);
  };

  const handleTilesetMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting && !e.ctrlKey) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // If Ctrl is pressed, handle individual tile selection during drag
    if (e.ctrlKey) {
      const col = Math.floor(x / tileset.tileWidth);
      const row = Math.floor(y / tileset.tileHeight);
      const tileIndex = row * tileset.columns + col;
      
      if (tileIndex < tileset.columns * tileset.rows) {
        const currentSelected = elementSelected?.selectedTiles || [];
        if (!currentSelected.includes(tileIndex)) {
          // Add tile to selection
          const newSelectedTiles = [...currentSelected, tileIndex];
          setSelectedTiles(newSelectedTiles);
          
          // Update elementSelected with selected tiles
          if (elementSelected) {
            const updatedElement = { ...elementSelected, selectedTiles: newSelectedTiles };
            setElementSelected(updatedElement);
            setScenes(prevScenes => prevScenes.map(scene => 
              scene.id === updatedElement.id 
                ? { ...scene, ...updatedElement, _saved: false }
                : scene
            ));
          }
        }
      }
      return;
    }

    setSelectionEnd({ x, y });
  };

  const handleTilesetMouseUp = () => {
    if (!isSelecting) return;

    setIsSelecting(false);

    // Calculate selected tiles for rectangular selection (only if not using Ctrl)
    const startCol = Math.floor(Math.min(selectionStart.x, selectionEnd.x) / tileset.tileWidth);
    const endCol = Math.floor(Math.max(selectionStart.x, selectionEnd.x) / tileset.tileWidth);
    const startRow = Math.floor(Math.min(selectionStart.y, selectionEnd.y) / tileset.tileHeight);
    const endRow = Math.floor(Math.max(selectionStart.y, selectionEnd.y) / tileset.tileHeight);

    const newSelectedTiles: number[] = [];
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const tileIndex = row * tileset.columns + col;
        if (tileIndex < tileset.columns * tileset.rows) {
          newSelectedTiles.push(tileIndex);
        }
      }
    }

    setSelectedTiles(newSelectedTiles);

    // Update elementSelected with selected tiles
    if (elementSelected) {
      const updatedElement = { ...elementSelected, selectedTiles: newSelectedTiles };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => 
        scene.id === updatedElement.id 
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      ));
    }
  };
  
  useEffect(() => {
    // Se a aba atual ficar desabilitada, volta para a default
    const isDisabled =
      (activeLayerKey !== "2" && elementSelected?.sceneType == ETypeScene.LOGO) || elementSelected?.sceneType == ETypeScene.POINTNCLICK;

    if (isDisabled) {
      setActiveLayerKey("2");
    }
  }, [activeLayerKey, elementSelected?.sceneType]);

  if (!elementSelected) {
    return (
      <Content style={{ padding: token.padding }}>
        <RightPanelGWSettings controllerView={controllerView}/>
      </Content>
    );
  }

  const getSceneScripts = scenes.find(scene => scene.id === elementSelected.id)?.script?.map((script) => script);
  const getPlayerHitScripts = (groupKey: string): IScriptsElement[] | undefined => {
    const scene = scenes.find(s => s.id === elementSelected.id);
    if (!scene) return;

    switch (groupKey) {
      case "playerHit1Script":
        return scene.playerHit1Script?.map(s => s);
      case "playerHit2Script":
        return scene.playerHit2Script?.map(s => s);
      case "playerHit3Script":
        return scene.playerHit3Script?.map(s => s);
      default:
        return [];
    }
  };  

  return (
    <Content>
      <Space direction="vertical" style={{ width: '100%', zIndex: 50, padding: 10 }}>
        {isEditingTitle ? (
          <Input
            autoFocus
            value={elementSelected.name}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            onPressEnter={handleTitleBlur}
          />
        ) : (
          <Typography.Title level={5} onClick={handleTitleClick} style={{ margin: 0, cursor: 'pointer' }}>
            {elementSelected.name}
          </Typography.Title>
        )}
        <Divider style={{ margin: `${token.margin}px 0` }} />
        {/* <Form.Item name="startSceneId" label="Starting Scene" style={{ flex: 1, textAlign: 'center' }}> */}
        {/* TODO lista de imagens para escolher */}
        {/* </Form.Item> */}
      </Space>
      <Space direction="vertical" style={{ width: '100%' }}>
        {isTileEditor ? (
          // Tiles Editor Mode - Scene properties + tileset selector
          <Space direction="vertical" style={{ width: '100%', padding: 10 }}>
            <Typography.Title level={5}>Tileset</Typography.Title>
            <Content style={{ width: '100%', height: '100%' }}>
              <Space direction="vertical" >
                <Space>
                  <span>Selected tiles: {selectedTiles.length}</span>
                  <span>Map size: {mapWidth * 16} x {mapHeight * 16} px</span>
                </Space>
                <Space direction="vertical" size="small">
                  <span><strong>Map Size (in tiles):</strong></span>
                  <Space>
                    <div>
                      <span>Width: </span>
                      <InputNumber
                        min={15}
                        max={64}
                        value={mapWidth}
                        onChange={(value) => handleMapSizeChange('width', (value || 15) * 16, elementSelected.id)}
                        formatter={(value) => `${value} tiles`}
                        parser={(value) => parseInt(value?.replace(' tiles', '') || '15')}
                      />
                    </div>
                    <div>
                      <span>Height: </span>
                      <InputNumber
                        min={10}
                        max={64}
                        value={mapHeight}
                        onChange={(value) => handleMapSizeChange('height', (value || 10) * 16, elementSelected.id)}
                        formatter={(value) => `${value} tiles`}
                        parser={(value) => parseInt(value?.replace(' tiles', '') || '10')}
                      />
                    </div>
                  </Space>
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    Minimum: 240x160px (15x10 tiles) | Maximum: 1024x1024px (64x64 tiles)
                  </span>
                </Space>
              </Space>
            </Content>
            <Content style={{ 
              width: '100%', 
              height: '100%',
              border: '4px solid #ccc', 
              backgroundColor: '#f5f5f5',
              overflow: 'auto',
              position: 'relative'
            }}>
              <canvas
                ref={canvasRef}
                width={tileset.columns * tileset.tileWidth}
                height={tileset.rows * tileset.tileHeight}
                onMouseDown={handleTilesetMouseDown}
                onMouseMove={handleTilesetMouseMove}
                onMouseUp={handleTilesetMouseUp}
                style={{ /*border: '1px solid #ccc',*/ cursor: 'crosshair', display: 'block' }}
              />
              {/* Selection overlay */}
              {isSelecting && (
                <div
                  style={{
                    position: 'absolute',
                    left: Math.min(selectionStart.x, selectionEnd.x),
                    top: Math.min(selectionStart.y, selectionEnd.y),
                    width: Math.abs(selectionEnd.x - selectionStart.x),
                    height: Math.abs(selectionEnd.y - selectionStart.y),
                    backgroundColor: 'rgba(0, 123, 255, 0.3)',
                    border: '2px solid #007bff',
                    pointerEvents: 'none'
                  }}
                />
              )}
            </Content>
            <Select
              placeholder="Select Tileset"
              value={elementSelected.selectedTilesetId}
              onChange={handleTilesetChange}
              style={{ width: '100%' }}
              options={tilesets.map(ts => ({ label: ts.name, value: ts.id }))}
            />
            <Select
              placeholder="Select Image Type"
              value={elementSelected.imageType}
              onChange={(value: EImageType) => handleImageTypeChange(value)}
              style={{ width: '100%' }}
              options={imageTypes.map(type => ({
                  label: (<Space> {type.icon}{type.label} </Space>), 
                  value: type.value
                })
              )}
            >
              
            </Select>
            <Divider style={{ margin: `${token.margin}px 0` }} />
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Text strong>Instructions:</Typography.Text>
              <Typography.Text>1. Click and drag on tileset to select tiles</Typography.Text>
              <Typography.Text>2. Click and drag on map to paint tiles</Typography.Text>
              <Typography.Text>3. Selected tiles</Typography.Text>
            </Space>
          </Space>
        ) : (
          // Game World Mode - Basic scene properties + Tiles Editor button
          <Content>
            <Space direction="vertical" style={{ width: '100%', padding: 10 }}>
              <Typography.Text>Backgrounds</Typography.Text>
              <Tabs 
                activeKey={activeLayerKey}
                onChange={setActiveLayerKey}
                type="card"
                size={'small'}
                items={backgroundLayers.map(key => ({
                  key: String(key),
                  label: `Layer ${key}`,
                  children: (
                    <BackgroundSelector
                      selectedElementId={elementSelected.id}
                      layerKey={key}
                    />
                  ),
                  disabled: key!= 2 && elementSelected.sceneType === ETypeScene.LOGO || elementSelected.sceneType === ETypeScene.POINTNCLICK
                  }))
                }
              />

              <Divider style={{ margin: `${token.margin}px 0` }} />

              <Typography.Text>Scene type</Typography.Text>
              <Select
                title="Select scene type"
                placeholder="Select scene type"
                value={elementSelected.sceneType || sceneTypes[0].value}
                onChange={handleSceneTypeChange}
                style={{ width: '100%' }}
                options={sceneTypes.map(ts => ({ label: ts.label, value: ts.value }))}
              />
              { (elementSelected.sceneType === ETypeScene.LOGO || elementSelected.sceneType === ETypeScene.POINTNCLICK) && (
                <Button 
                  type="default" 
                  onClick={handleEditMap}
                  style={{ width: '100%' }}
                >
                  Open Tiles Editor
                </Button>
              )}
            </Space>

            <Divider variant="solid" style={{ margin: `${token.margin}px 0` }} />

            <Tabs 
              // activeKey={'oninit'}
              // onChange={setActiveLayerKey}
              defaultActiveKey='1'
              type="line"
              size={'small'}
              items={
                [
                  {
                    key: '1',
                    label: '  On Init  ',
                    children: (
                      <Content>
                        <CollapseEventManager scripts={getSceneScripts} />
                        <SelectNewEvent tabIndex={'1'}/>
                      </Content>
                    )
                  },
                  {
                    key: '2',
                    label: 'On Player Hit',
                    disabled: true,
                    children: (
                      <Tabs
                        defaultActiveKey='1'
                        type="card"
                        size={'small'}
                        items={ groupEvents.map((groupEvent) => (
                          {
                            key: groupEvent.key,
                            label: groupEvent.label,
                            children: (
                              <Content>
                                <CollapseEventManager scripts={getPlayerHitScripts(groupEvent.key)} />
                                <SelectNewEvent subTabIndex={groupEvent.key}/>
                              </Content>
                            )
                          }))
                        }
                      />
                    )
                  }
                ]
              }
            />
          </Content>
        )}
      </Space>
    </Content>
  );
};

export default RightPanel;

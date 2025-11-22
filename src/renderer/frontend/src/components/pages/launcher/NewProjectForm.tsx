import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Space, message, Image } from 'antd';
import { AntdToken } from '../../common/AntDToken';
import { Content } from 'antd/es/layout/layout';
import blanckGBA from '@/img/blankGBA_Studio.jpg';
import samplekGBA from '@/img/sampleProjectGBA_Studio.jpg';

const templates = [
  { value: 'Blank Project', imgSrc: blanckGBA, description: 'A completely blank canvas', templateId: 'blank' },
  { value: 'Sample Project', imgSrc: samplekGBA, description: 'A GBA template containing examples', templateId: 'sample_project_example' },
];

const NewProjectForm = () => {
  const { token } = AntdToken();
    
  const [form] = Form.useForm();
  const [selectedTemplate, setSelectedTemplate] = useState('template no selected');

  const [pathForm, setPathForm] = useState('');
  const [creating, setCreating] = useState(false);

  const handlePathClick = async () => {
    const { filePath } = await window.electronAPI.selectFolder();
    console.log('..: handlePathClick com path: %s', `${filePath}`);
    window.electronAPI.saveLastUsedPath(`${filePath}`)
    setPathForm(filePath);
    form.setFieldsValue({ path: filePath });
  };

  const handlePathChange = (e: any) => {
    const path = e.target.value;
    // console.log('..: handlePathChange com path: %s', `${path}`);
    window.electronAPI.saveLastUsedPath(`${path}`)
    setPathForm(path);
    form.setFieldsValue({ path: path });
  };

  useEffect(() => {
    // Salvar a aba "lastUsedSplashTab"
    window.electronAPI.saveLastSplashTab('new_project');

    // Carregar o último caminho utilizado
    window.electronAPI.loadLastUsedPath().then((lastPath: string) => {
      console.log('..: newProject tab lastPath: ', lastPath)
      setPathForm(lastPath);
      form.setFieldsValue({ path: lastPath });

      handleTemplateSelect('Blank Project'); // Sempre Selecionado o primeiro
    });
  }, []);

  const handleTemplateSelect = (value: any) => {
    setSelectedTemplate(value);
    const tpl = templates.find(t => t.value === value)?.templateId ?? value;
    form.setFieldsValue({ template: tpl })
  };

  const handleSubmit = async (values: any) => {
    console.log('..: Criando projeto: Name: %s, Path: %s, Template: %s', values.projectName, values.path, values.template);
    const pathToProject = await window.electronAPI.pathJoin(values.path, values.projectName);
    const exists = await window.electronAPI.checkProjectFile(pathToProject);
    
    if (!exists) {
      // Lógica para criar o projeto
      setCreating(true);
      // values.template is now the templateId (e.g. 'sample_project_example' or 'blank')
      const createdPath = await window.electronAPI.createProjectPath(pathToProject, values.template)
      console.log('..: Path criado: ', createdPath);

      const pathWithFileProject = await window.electronAPI.pathJoin(createdPath, `${values.projectName}.gbaproj`);
      window.electronAPI.send('load-project-window', pathWithFileProject);
    } else {
      message.error('Projeto já existe');
    }
    
  };

  return (
    <Content style={{ height: 'calc(100vh - 10px)', padding: '20px'/*, overflowY: 'auto'*/ }}>
      <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ rowGap: '8px'}}>
        <Form.Item label="Project Name" name="projectName" rules={[{ required: true, message: 'Please input the project name!' }]} style={{ marginBottom: '8px' }}>
          <Input />
        </Form.Item>
        <Form.Item label="Path" name="path" rules={[{ required: true, message: 'Please input the path!' }]} style={{ marginBottom: '8px' }}>
          <Space.Compact block>
            <Input style={{ width: 'calc(100% - 32px)' }} value={pathForm} onChange={handlePathChange} />
            <Button onClick={handlePathClick} style={{ width: '32px' }}>...</Button>
          </Space.Compact>
        </Form.Item>
        <Form.Item label="Template" name="template" rules={[{ required: true, message: 'Please select the template!' }]} style={{ marginBottom: '0px' }}>
          <Space size="middle">
            {templates.map(template => (
              <Content key={template.value} onClick={() => handleTemplateSelect(template.value)} style={{ border: selectedTemplate === template.value ? `3px solid ${token.colorPrimary}` : '3px solid transparent', borderRadius: token.borderRadiusLG, cursor: 'pointer', }}>
                <Image preview={false} src={template.imgSrc} alt={template.value} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: token.borderRadiusSM, }} />
              </Content>
            ))}
          </Space>
        </Form.Item>
        <Form.Item label={selectedTemplate} style={{ marginBottom: '8px' }}>
          {templates.find(template => template.value === selectedTemplate)?.description}
        </Form.Item>
        <Form.Item>
          <Button loading={creating} disabled={creating} type="primary" htmlType="submit" style={{ border: 'none', boxShadow: 'none' }}>
            {creating ? 'Creating' : 'Create Project' } 
          </Button>
        </Form.Item>
      </Form>
    </Content>
  );
};

export default NewProjectForm;

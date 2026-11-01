import { Select } from 'antd';

export function soundAssetOptions(files: string[]) {
  return files.map(file => ({ value: file.replace(/\.[^/.]+$/, ''), label: file }));
}

export default function SoundAssetSelect({ files, value, placeholder, onChange }: {
  files: string[];
  value?: string;
  placeholder: string;
  onChange: (soundId?: string) => void;
}) {
  return <Select showSearch allowClear style={{ width: '100%' }} value={value || undefined}
    options={soundAssetOptions(files)} placeholder={placeholder} onChange={onChange} />;
}

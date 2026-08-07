import { Upload, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api } from '../api';

// 单图上传组件：value 为图片 URL
export default function ImgUpload({ value, onChange }) {
  const fileList = value ? [{ uid: '-1', name: 'image', status: 'done', url: value }] : [];

  const handleChange = (url) => {
    console.log('ImgUpload onChange:', url);  // 🐛 调试：看看是否被调用
    onChange(url);
  };

  return (
    <Upload
      listType="picture-card"
      fileList={fileList}
      accept="image/*"
      customRequest={async ({ file, onSuccess, onError }) => {
        try {
          const fd = new FormData();
          fd.append('file', file);
          const r = await api('/api/upload', { method: 'POST', body: fd });
          handleChange(r.url);
          onSuccess(r);
        } catch (e) {
          message.error(e.message);
          onError(e);
        }
      }}
      onRemove={() => handleChange('')}
    >
      {fileList.length === 0 && (
        <div>
          <PlusOutlined />
          <div style={{ marginTop: 4 }}>上传</div>
        </div>
      )}
    </Upload>
  );
}

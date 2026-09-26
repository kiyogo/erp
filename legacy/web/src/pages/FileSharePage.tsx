import React, { useEffect, useMemo, useState } from 'react';
import { DownloadOutlined, FileImageOutlined, FileTextOutlined, FileWordOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { Button, Tag, Typography, message } from '../custom-ui';
import { filesApi, type FileSharePayload } from '../api/endpoints';

const { Title, Text } = Typography;

const isImageFile = (file?: FileSharePayload['file']) =>
  Boolean(file?.mime?.startsWith('image/')) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file?.name || '');

const isVideoFile = (file?: FileSharePayload['file']) =>
  Boolean(file?.mime?.startsWith('video/')) || /\.(mp4|webm|ogg|ogv|mov|m4v)$/i.test(file?.name || '');

const isDocumentFile = (file?: FileSharePayload['file']) =>
  /\.(pdf|doc|docx|xls|xlsx|csv|txt|rtf|ppt|pptx)$/i.test(file?.name || '');

export const FileSharePage: React.FC = () => {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', []);
  const [share, setShare] = useState<FileSharePayload | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    const loadShare = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await filesApi.getPublicShare(token);
        setShare(res.data.share);
        if (isImageFile(res.data.share.file) || isVideoFile(res.data.share.file)) {
          const blobRes = await filesApi.downloadPublicShare(token);
          objectUrl = URL.createObjectURL(blobRes.data);
          setPreviewUrl(objectUrl);
        }
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Link chia sẻ không hoạt động.');
      } finally {
        setLoading(false);
      }
    };
    void loadShare();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token]);

  const handleDownload = async () => {
    if (!share?.file) return;
    try {
      const res = await filesApi.downloadPublicShare(token);
      const url = URL.createObjectURL(res.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = share.file.name;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải tệp chia sẻ.');
    }
  };

  const file = share?.file;
  const isImage = isImageFile(file);
  const isVideo = isVideoFile(file);
  const isDoc = isDocumentFile(file);

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', padding: 24, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <Title level={4} style={{ margin: 0, color: '#0F172A' }}>Tệp được chia sẻ</Title>
            <Text style={{ color: '#64748B' }}>{file?.name || (loading ? 'Đang tải...' : 'Không tìm thấy tệp')}</Text>
          </div>
          {share && <Tag color={share.isActive ? 'success' : 'default'}>{share.isActive ? 'Đang hoạt động' : 'Không hoạt động'}</Tag>}
        </div>

        <div style={{ padding: 22 }}>
          {!loading && !file ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#64748B' }}>Link chia sẻ không tồn tại hoặc đã bị tắt.</div>
          ) : isImage && previewUrl ? (
            <img src={previewUrl} alt={file?.name || 'Ảnh chia sẻ'} style={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', margin: '0 auto' }} />
          ) : isVideo && previewUrl ? (
            <video src={previewUrl} controls style={{ display: 'block', width: '100%', maxHeight: '70vh', background: '#000000' }} />
          ) : (
            <div style={{ padding: 28, border: '1px dashed #CBD5E1', borderRadius: 8, textAlign: 'center', color: '#334155' }}>
              {isDoc ? <FileWordOutlined style={{ fontSize: 42, color: '#2563EB' }} /> : <FileTextOutlined style={{ fontSize: 42, color: '#64748B' }} />}
              <div style={{ fontWeight: 700, marginTop: 12 }}>{file?.name || 'Đang tải tệp...'}</div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 4 }}>Nhấn tải xuống để mở tệp trên thiết bị của bạn.</div>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {(isImage || isVideo) && (
            <Tag color="cyan" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {isVideo ? <PlayCircleOutlined /> : <FileImageOutlined />} Xem trực tiếp
            </Tag>
          )}
          <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload} disabled={!file} style={{ background: '#009688', borderColor: '#009688' }}>
            Tải xuống
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FileSharePage;

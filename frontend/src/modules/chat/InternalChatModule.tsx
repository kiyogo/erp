import React from 'react';
import { ChatPage } from './chat-page';
import { DEFAULT_SERVER_ID, DEFAULT_CHANNEL_ID } from './chat-config';

export const InternalChatModule: React.FC = () => {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 84px)', margin: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>
      <ChatPage slug={DEFAULT_SERVER_ID} channelId={DEFAULT_CHANNEL_ID} immersive={false} />
    </div>
  );
};

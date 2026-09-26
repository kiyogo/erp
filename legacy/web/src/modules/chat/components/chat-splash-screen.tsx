'use client';

import React from 'react';
import { cn } from '../utils';

export function ChatSplashScreen({ fixed = true }: { fixed?: boolean }) {
  const containerClass = fixed 
    ? "fixed inset-0 z-[9999] h-screen w-screen" 
    : "relative flex-1 h-full w-full";

  return (
    <div className={cn("flex items-center justify-center bg-app-bg", containerClass)}>
      <img 
        src="/kiyovn.png" 
        alt="Logo" 
        className="size-24 object-contain"
      />
    </div>
  );
}

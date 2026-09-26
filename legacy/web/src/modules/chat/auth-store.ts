'use client';

import { create } from 'zustand';
import { dataService } from '../../services/dataService';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
  fullName: string;
  avatarUrl?: string;
  profile?: {
    fullName: string;
    avatarUrl?: string;
    title?: string;
  };
  employee?: {
    title?: string;
    department?: { name: string };
    branch?: { name: string };
  };
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  setUser: (user: AuthUser | null) => void;
}

const getInitialUser = (): AuthUser => {
  const profile = dataService.getEmployeeProfile();
  const displayName = profile.name || profile.fullName || 'Người dùng';
  const employeeCode = profile.employeeCode || profile.code || 'employee-user';
  const title = profile.position || profile.title || 'Nhân viên';
  const departmentName = profile.department || 'Chưa cập nhật';
  const branchName = profile.unit || profile.branch || 'Chưa cập nhật';
  const avatarUrl = profile.avatar || undefined;
  return {
    userId: employeeCode,
    email: profile.email || '',
    role: 'ADMIN',
    fullName: displayName,
    avatarUrl,
    profile: {
      fullName: displayName,
      avatarUrl,
      title,
    },
    employee: {
      title,
      department: { name: departmentName },
      branch: { name: branchName },
    },
  };
};

export const useAuthStore = create<AuthState>((set) => ({
  user: getInitialUser(),
  accessToken: 'mock_chat_token_v1',
  setUser: (user) => set({ user }),
}));

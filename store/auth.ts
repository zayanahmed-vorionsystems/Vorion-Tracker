'use client';
// store/auth.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'super_admin'|'executive'|'qa_manager'|'team_lead'|'employee';

export interface AuthUser { id:string; name:string; email:string; role:Role; teamId:string|null; }

interface AuthState {
  token: string|null; user: AuthUser|null;
  setAuth: (token:string, user:AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null, user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'worktrack-auth' }
  )
);

const LEVELS: Record<Role,number> = { super_admin:5,executive:4,qa_manager:3,team_lead:2,employee:1 };
export const canMonitorAll  = (r:Role) => ['super_admin','qa_manager'].includes(r);
export const canManageUsers = (r:Role) => r === 'super_admin';
export const canSendAlerts  = (r:Role) => ['super_admin','qa_manager','team_lead'].includes(r);
export const isAtLeast      = (r:Role,min:Role) => LEVELS[r]>=LEVELS[min];

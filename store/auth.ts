'use client';
// store/auth.ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Role = 'super_admin'|'admin'|'qa_manager'|'team_lead'|'employee';

export interface AuthUser { id:string; name:string; email:string; role:Role; teamId:string|null; }

interface AuthState {
  token: string|null; user: AuthUser|null;
  setAuth: (token:string, user:AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => {
        // Normalize role casing to avoid case-sensitive mismatches from DB
        const normalizedRole = (user?.role && String(user.role).toLowerCase()) as any;
        const normalizedUser = user ? { ...user, role: normalizedRole } : null;
        set({ token, user: normalizedUser });
      },
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'worktrack-auth',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

const LEVELS: Record<Role,number> = { super_admin:5,admin:5,qa_manager:4,team_lead:3,employee:1 };
export const canMonitorAll  = (r:Role) => ['super_admin','qa_manager','admin'].includes(r);
export const canManageUsers = (r:Role) => ['super_admin','admin'].includes(r);
export const canSendAlerts  = (r:Role) => ['super_admin','qa_manager','team_lead','admin'].includes(r);
export const isAtLeast      = (r:Role,min:Role) => LEVELS[r]>=LEVELS[min];

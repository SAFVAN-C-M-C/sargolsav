import { useContext } from 'react';
import { AuthContext } from '../contexts/authContext';
import type { AuthContextValue } from '../types/auth';

export function useAdminAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAdminAuth must be used inside AuthProvider');
  return context;
}

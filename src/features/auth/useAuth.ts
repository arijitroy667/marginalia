import { useSyncExternalStore } from 'react';
import { authState, subscribeAuth, type AuthState } from '../../core/auth';

export const useAuth = (): AuthState => useSyncExternalStore(subscribeAuth, authState);

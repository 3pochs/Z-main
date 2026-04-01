import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateSessionHash, validateSessionHash, logAdminAccess, clearAdminData } from '@/utils/adminSecurity';

interface AdminAuthContextType {
    isAuthenticated: boolean;
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => void;
    isLoading: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

// Secure credentials - in production, this should be environment variables
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'fridayMarch23!'
};

// Session key for secure storage
const ADMIN_SESSION_KEY = 'ww_admin_session';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface AdminAuthProviderProps {
    children: ReactNode;
}

export const AdminAuthProvider: React.FC<AdminAuthProviderProps> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    // Check for existing session on mount
    useEffect(() => {
        checkExistingSession();
    }, []);

    const checkExistingSession = () => {
        try {
            const sessionData = localStorage.getItem(ADMIN_SESSION_KEY);
            if (sessionData) {
                const { timestamp, authenticated, hash, username } = JSON.parse(sessionData);
                const now = Date.now();

                // Check if session is still valid and hash is correct
                if (authenticated &&
                    (now - timestamp) < SESSION_DURATION &&
                    validateSessionHash(hash, username, timestamp)) {
                    setIsAuthenticated(true);
                    logAdminAccess('login_success', { type: 'session_restored' });
                } else {
                    // Session expired or invalid, clear it
                    clearAdminData();
                    logAdminAccess('login_failure', { reason: 'session_expired_or_invalid' });
                }
            }
        } catch (error) {
            console.error('Error checking admin session:', error);
            clearAdminData();
            logAdminAccess('login_failure', { reason: 'session_check_error', error: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (username: string, password: string): Promise<boolean> => {
        logAdminAccess('login_attempt', { username });

        // Add a small delay to prevent brute force attacks
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify credentials
        if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
            // Create secure session
            const timestamp = Date.now();
            const hash = generateSessionHash(username, timestamp);

            const sessionData = {
                authenticated: true,
                timestamp,
                username,
                hash
            };

            try {
                localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(sessionData));
                setIsAuthenticated(true);
                logAdminAccess('login_success', { username });
                return true;
            } catch (error) {
                console.error('Error storing admin session:', error);
                logAdminAccess('login_failure', { reason: 'storage_error', error: error.message });
                return false;
            }
        }

        logAdminAccess('login_failure', { reason: 'invalid_credentials', username });
        return false;
    };

    const logout = () => {
        logAdminAccess('logout');
        clearAdminData();
        setIsAuthenticated(false);
        navigate('/');
    };

    const value: AdminAuthContextType = {
        isAuthenticated,
        login,
        logout,
        isLoading
    };

    return (
        <AdminAuthContext.Provider value={value}>
            {children}
        </AdminAuthContext.Provider>
    );
};

export const useAdminAuth = (): AdminAuthContextType => {
    const context = useContext(AdminAuthContext);
    if (context === undefined) {
        throw new Error('useAdminAuth must be used within an AdminAuthProvider');
    }
    return context;
};

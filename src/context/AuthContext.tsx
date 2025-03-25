import React, { createContext, useContext, useState, useEffect } from 'react';
import axios, { AxiosError } from 'axios';
import { User, AuthState } from '../types/auth';

const API_URL = import.meta.env.VITE_API_URL;

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (userData: Omit<User, 'id'> & { password: string }) => Promise<void>;
  logout: () => void;
}

interface ApiResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: User;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
      setState({
        user: JSON.parse(user),
        isAuthenticated: true,
        loading: false,
        error: null,
      });
    } else {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  const handleApiError = (error: unknown) => {
    let errorMessage = 'An unknown error occurred';

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<ApiResponse>;
      errorMessage = axiosError.response?.data?.message || axiosError.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    setState(prev => ({
      ...prev,
      error: errorMessage,
      loading: false,
    }));

    throw new Error(errorMessage);
  };

  const login = async (email: string, password: string) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const response = await axios.post<ApiResponse>(`${API_URL}/api/auth/login`, {
        email,
        password,
      });

      if (!response.data.success || !response.data.token || !response.data.user) {
        throw new Error(response.data.message || 'Login failed');
      }

      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      localStorage.setItem('userId', response.data.user.id);

      setState({
        user: response.data.user,
        isAuthenticated: true,
        loading: false,
        error: null,
      });
    } catch (error) {
      handleApiError(error);
    }
  };

  const register = async (userData: Omit<User, 'id'> & { password: string }) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const response = await axios.post<ApiResponse>(`${API_URL}/api/auth/register`, userData);

      if (!response.data.success || !response.data.token || !response.data.user) {
        throw new Error(response.data.message || 'Registration failed');
      }

      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      localStorage.setItem('userId', response.data.user.id);

      setState({
        user: response.data.user,
        isAuthenticated: true,
        loading: false,
        error: null,
      });
    } catch (error) {
      handleApiError(error);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userId');
    setState({
      user: null,
      isAuthenticated: false,
      loading: false,
      error: null,
    });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {!state.loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
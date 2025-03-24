export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  birthDate: string;
  phoneNumber: string;
  role: 'student' | 'teacher';
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}
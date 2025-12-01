const API_URL = import.meta.env.DEV 
  ? '' // Empty string in development to avoid doubling /api
  : import.meta.env.VITE_API_URL || 'https://order.barokahperkasagroup.com';

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  access_token: string;
  user_id: number;
  login: string;
}

export const authApi = {
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const requestBody = {
      login: credentials.email,
      password: credentials.password,
      db: 'po-bunker',
    };

    const response = await fetch(`${API_URL}/api/login2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      try {
        const error = JSON.parse(errorText);
        throw new Error(error.message || error.error || 'Invalid email or password');
      } catch (e) {
        throw new Error('Invalid email or password');
      }
    }

    return response.json();
  },
};

// Token management utilities
export const tokenManager = {
  setToken: (token: string) => {
    localStorage.setItem('access_token', token);
  },
  
  getToken: (): string | null => {
    return localStorage.getItem('access_token');
  },
  
  removeToken: () => {
    localStorage.removeItem('access_token');
  },
  
  setUser: (userId: number, email: string) => {
    localStorage.setItem('user_id', userId.toString());
    localStorage.setItem('user_email', email);
  },
  
  getUser: () => {
    const userId = localStorage.getItem('user_id');
    const email = localStorage.getItem('user_email');
    return userId && email ? { userId: parseInt(userId), email } : null;
  },
  
  clearUser: () => {
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_email');
  },
  
  isAuthenticated: (): boolean => {
    return !!tokenManager.getToken();
  },
};
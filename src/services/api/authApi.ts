import { API_URL, getHeaders } from './config';

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
      headers: getHeaders(),
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
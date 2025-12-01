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
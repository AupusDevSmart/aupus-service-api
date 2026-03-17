import * as jwt from 'jsonwebtoken';

export function generateMockToken(userId: string, userName: string = 'Test User', userEmail: string = 'test@test.com'): string {
  const payload = {
    sub: userId,
    nome: userName,
    email: userEmail,
    role: 'ADMINISTRADOR',
    permissions: [],
  };

  // Use the same secret as in the app (or default)
  const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

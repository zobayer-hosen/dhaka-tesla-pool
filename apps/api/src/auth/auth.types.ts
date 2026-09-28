import { UserRole } from '../database/enums';

// What we put inside the JWT: who you are and your role. The token is signed
// with JWT_SECRET, so a client that edits it (e.g. role → DRIVER) breaks the signature.
export interface JwtPayload {
  sub: string;
  role: UserRole;
}

// The logged-in user as the rest of the API sees it (req.user).
export interface AuthUser {
  id: string;
  role: UserRole;
}

export interface LoginResponse {
  accessToken: string;
  user: { id: string; name: string; role: UserRole };
}

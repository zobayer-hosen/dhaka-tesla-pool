import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// "Who is this?" Runs JwtStrategy; no valid token → 401 UNAUTHORIZED.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

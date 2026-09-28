import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, loginAs, resetDatabase } from './test-app';

interface LoginBody {
  accessToken: string;
  user: { id: string; name: string; role: string };
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('login', () => {
    beforeAll(() => resetDatabase(app));

    it('lets Nusrat sign in and use her token on /auth/me', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nusrat@teslapool.dev', password: 'password123' })
        .expect(200);
      const body = login.body as LoginBody;
      expect(body).toEqual({
        accessToken: expect.any(String) as string,
        user: {
          id: expect.any(String) as string,
          name: 'Nusrat',
          role: 'PASSENGER',
        },
      });

      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
      expect(me.body).toEqual({
        id: body.user.id,
        name: 'Nusrat',
        email: 'nusrat@teslapool.dev',
        role: 'PASSENGER',
      });

      // Neither response ever contains the password hash.
      expect(JSON.stringify([login.body, me.body])).not.toMatch(
        /password|\$2b\$/i,
      );
    });

    it('accepts the email in any letter case', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'Nusrat@TeslaPool.DEV', password: 'password123' })
        .expect(200);
    });

    it('answers a wrong password and an unknown email the same way', async () => {
      const wrongPassword = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nusrat@teslapool.dev', password: 'not-her-password' })
        .expect(401);
      const unknownEmail = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nusrat@teslapool.com', password: 'password123' })
        .expect(401);

      expect(wrongPassword.body).toEqual({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });
  });

  describe('GET /auth/me without a valid token', () => {
    beforeAll(() => resetDatabase(app));

    it('returns 401 when there is no token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
      expect(response.body).toEqual({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
    });

    it('returns 401 when Nusrat edits her role inside the token', async () => {
      const token = await loginAs(app, 'nusrat');
      const [header, payload, signature] = token.split('.');
      const claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString(),
      ) as Record<string, unknown>;
      const editedPayload = Buffer.from(
        JSON.stringify({ ...claims, role: 'DRIVER' }),
      ).toString('base64url');

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${header}.${editedPayload}.${signature}`)
        .expect(401);
    });
  });

  describe('signup', () => {
    // Start without the cast, so Shirin can sign up herself.
    beforeAll(() => resetDatabase(app, { withCast: false }));

    it('creates Shirin as a passenger and logs her in', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          name: 'Shirin',
          email: 'Shirin@TeslaPool.dev',
          password: 'password123',
        })
        .expect(201);
      expect(response.body).toEqual({
        accessToken: expect.any(String) as string,
        user: {
          id: expect.any(String) as string,
          name: 'Shirin',
          role: 'PASSENGER',
        },
      });

      // The email was stored lowercase, so the lowercase login works.
      await loginAs(app, 'shirin');
    });

    it('refuses the same email again → 409 EMAIL_TAKEN', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          name: 'Shirin',
          email: 'SHIRIN@teslapool.dev',
          password: 'password123',
        })
        .expect(409);
      expect(response.body).toEqual({
        statusCode: 409,
        code: 'EMAIL_TAKEN',
        message: 'An account with this email already exists',
      });
    });

    it('rejects a bad email → 400 VALIDATION_ERROR', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          name: 'Rafiq',
          email: 'rafiq-at-teslapool',
          password: 'password123',
        })
        .expect(400);
      expect(response.body).toEqual({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'email must be an email',
      });
    });

    it('rejects a password shorter than 8 characters → 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          name: 'Rafiq',
          email: 'rafiq@teslapool.dev',
          password: 'short',
        })
        .expect(400);
      expect(response.body).toEqual({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'password must be longer than or equal to 8 characters',
      });
    });

    it('refuses to create a driver → 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          name: 'Rafiq',
          email: 'rafiq@teslapool.dev',
          password: 'password123',
          role: 'DRIVER',
        })
        .expect(400);
      expect(response.body).toEqual({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'property role should not exist',
      });
    });
  });
});

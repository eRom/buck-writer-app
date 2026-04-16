import { SignJWT, jwtVerify } from 'jose';

export interface JwtOptions {
  secret: string;
  issuer: string;
  audience: string;
}

export interface JwtPayload {
  sub: string;
  scope?: 'app' | 'webdav';
  [key: string]: unknown;
}

export function createJwtService(opts: JwtOptions) {
  const key = new TextEncoder().encode(opts.secret);

  return {
    async sign(payload: JwtPayload, expiresIn: string): Promise<string> {
      return new SignJWT(payload as Record<string, unknown>)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer(opts.issuer)
        .setAudience(opts.audience)
        .setExpirationTime(expiresIn)
        .sign(key);
    },
    async verify(token: string): Promise<JwtPayload> {
      const { payload } = await jwtVerify(token, key, {
        issuer: opts.issuer,
        audience: opts.audience,
      });
      return payload as JwtPayload;
    },
  };
}

export type JwtService = ReturnType<typeof createJwtService>;

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
        // Pin signing algorithm explicitly. jose v5 already rejects 'none',
        // but an attacker could try to downgrade to 'RS256'/'ES256' with a
        // public-key-as-HMAC-secret confusion. Locking to HS256 is defence
        // in depth and matches the symmetric secret we sign with.
        algorithms: ['HS256'],
      });
      return payload as JwtPayload;
    },
  };
}

export type JwtService = ReturnType<typeof createJwtService>;

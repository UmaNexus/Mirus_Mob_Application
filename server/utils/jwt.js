import jwt from 'jsonwebtoken';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in the environment');
  }
  return secret;
};

/**
 * Sign a JWT carrying the minimal identity claims needed for authorization.
 * Never embed sensitive fields (password, bank details) into the token.
 */
export const signToken = (user) =>
  jwt.sign(
    { sub: user._id.toString(), role: user.role, email: user.email, companyId: user.companyId?.toString() },
    getSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );

export const verifyJwt = (token) => jwt.verify(token, getSecret());

export const COOKIE_NAME = () => process.env.COOKIE_NAME || 'hrms_token';

/**
 * Standard HTTP-only cookie options. `secure` is enabled outside development
 * so the token is only ever transmitted over HTTPS in production.
 */
export const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000 // 1 day
});

import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signAccessToken(user) {
  return jwt.sign({ sub: user.uid, type: 'access' }, config.jwtAccessSecret, { expiresIn: config.jwtAccessTtl });
}

export function signRefreshToken(user) {
  return jwt.sign({ sub: user.uid, type: 'refresh' }, config.jwtRefreshSecret, { expiresIn: config.jwtRefreshTtl });
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, config.jwtAccessSecret);
  if (payload.type !== 'access') throw new Error('Wrong token type.');
  return payload;
}

export function verifyRefreshToken(token) {
  const payload = jwt.verify(token, config.jwtRefreshSecret);
  if (payload.type !== 'refresh') throw new Error('Wrong token type.');
  return payload;
}

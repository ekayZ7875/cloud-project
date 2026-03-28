import jwt from 'jsonwebtoken';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.match(/^\s*Bearer\s+(.+)$/i)
    ? authHeader.replace(/^\s*Bearer\s+/i, '')
    : authHeader;
  const jwtSecret = process.env.JWT_SECRET_KEY || process.env.JWT_SECRET;

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  if (!jwtSecret) {
    return res.status(500).json({ error: 'JWT secret is not configured.' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token.' });
  }
};

export default authMiddleware;

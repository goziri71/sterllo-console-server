let _app = null;

export const setApp = (app) => {
  _app = app;
};

export const generateToken = (payload) => {
  if (!_app || !_app.jwt) {
    throw new Error("JWT utility not initialized: Fastify app instance or JWT plugin is missing.");
  }
  return _app.jwt.sign(payload);
};

export const verifyToken = (token) => {
  if (!_app || !_app.jwt) {
    throw new Error("JWT utility not initialized: Fastify app instance or JWT plugin is missing.");
  }
  return _app.jwt.verify(token);
};

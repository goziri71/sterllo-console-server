let _app = null;

export const setApp = (app) => {
  _app = app;
};

export const generateToken = (payload) => {
  return _app.jwt.sign(payload);
};

export const verifyToken = (token) => {
  return _app.jwt.verify(token);
};
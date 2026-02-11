import { ErrorClass } from "../utils/errorClass/index.js";
import { verifyToken } from "../utils/jwt/index.js";
import User from "../models/users/user.js";


export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ErrorClass("Access denied. No token provided", 401);
    }
    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    const user = await User.findOne({
      where: { user_key: decoded.user_key },
      attributes: { exclude: ["password"] },
    });
    if (!user) {
      throw new ErrorClass("User no longer exists", 401);
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return next(new ErrorClass("Invalid token", 401));
    }
    if (error.name === "TokenExpiredError") {
      return next(new ErrorClass("Token expired", 401));
    }
    next(error);
  }
};

/**
 * Authorize - restricts access to specific roles
 * Usage: authorize("finance", "operations", "compliance")
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ErrorClass("Access denied. Not authenticated", 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ErrorClass("Access denied. Insufficient permissions", 403)
      );
    }

    next();
  };
};

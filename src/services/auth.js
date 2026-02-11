import bcrypt from "bcrypt";
import crypto from "crypto";
import User from "../models/users/user.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import { generateToken } from "../utils/jwt/index.js";

const SALT_ROUNDS = 6;

export default class AuthService {
  constructor() {
    this.user = User;
  }

  _generateUserKey() {
    return crypto.randomBytes(32).toString("hex");
  }

  _sanitizeUser(user) {
    const { password, ...safeUser } = user.toJSON();
    return safeUser;
  }

  async register({ email, password, first_name, last_name, role }) {
    const existingUser = await this.user.findOne({ where: { email } });
    if (existingUser) {
      throw new ErrorClass("Email already registered", 409);
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const newUser = await this.user.create({
      user_key: this._generateUserKey(),
      email,
      password: hashedPassword,
      first_name,
      last_name,
      role: role || "user",
      date_created: new Date(),
    });

    const token = generateToken({
      id: newUser.id,
      user_key: newUser.user_key,
      role: newUser.role,
    });

    return {
      user: this._sanitizeUser(newUser),
      token,
    };
  }

  /**
   * Login with email and password
   */
  async login({ email, password }) {
    const invalidFields = [];

    const user = await this.user.findOne({ where: { email } });
    if (!user) {
      invalidFields.push("email");
    }

    if (user) {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        invalidFields.push("password");
      }
    }

    if (invalidFields.length > 0) {
      throw new ErrorClass(`Invalid credentials: ${invalidFields.join(", ")}`, 401);
    }

    // 3. Update last_login
    await user.update({
      last_login: new Date(),
      date_modified: new Date(),
    });

    const token = generateToken({
      id: user.id,
      user_key: user.user_key,
      role: user.role,
    });

    return {
      user: this._sanitizeUser(user),
      token,
    };
  }

  /**
   * Change password (requires current password)
   */
  async changePassword({ userKey, currentPassword, newPassword }) {
    const user = await this.user.findOne({ where: { user_key: userKey } });
    if (!user) {
      throw new ErrorClass("User not found", 404);
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new ErrorClass("Current password is incorrect", 401);
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new ErrorClass("New password must be different from current password", 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.update({
      password: hashedPassword,
      date_modified: new Date(),
    });

    return { message: "Password changed successfully" };
  }

  /**
   * Get current user profile
   */
  async getProfile(userId) {
    const user = await this.user.findByPk(userId);
    if (!user) {
      throw new ErrorClass("User not found", 404);
    }

    return this._sanitizeUser(user);
  }
}

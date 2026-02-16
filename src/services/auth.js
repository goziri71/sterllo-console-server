import bcrypt from "bcrypt";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { ErrorClass } from "../utils/errorClass/index.js";
import { generateToken } from "../utils/jwt/index.js";
import { clearUserCache } from "../middleware/auth.js";

const SALT_ROUNDS = 6;

export default class AuthService {
  _generateUserKey() {
    return crypto.randomBytes(32).toString("hex");
  }

  _sanitizeUser(user) {
    const { password, ...safeUser } = user;
    return safeUser;
  }

  async register({ email, password, first_name, last_name, role }) {
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      throw new ErrorClass("Email already registered", 409);
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const userValues = {
      user_key: this._generateUserKey(),
      email,
      password: hashedPassword,
      first_name,
      last_name,
      role: role || "user",
      date_created: new Date(),
    };

    const result = await db.insert(users).values(userValues);
    const insertId = result[0].insertId;

    const [newUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, insertId))
      .limit(1);

    const token = generateToken({
      id: newUser.id,
      user_key: newUser.user_key,
      role: newUser.role,
      token_version: newUser.token_version,
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

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

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
      throw new ErrorClass(
        `Invalid credentials: ${invalidFields.join(", ")}`,
        401
      );
    }

    const newTokenVersion = (user.token_version || 0) + 1;

    await db
      .update(users)
      .set({ last_login: new Date(), date_modified: new Date(), token_version: newTokenVersion })
      .where(eq(users.id, user.id));

    clearUserCache(user.user_key);

    const token = generateToken({
      id: user.id,
      user_key: user.user_key,
      role: user.role,
      token_version: newTokenVersion,
    });

    return {
      user: this._sanitizeUser({ ...user, token_version: newTokenVersion }),
      token,
    };
  }

  /**
   * Change password (requires current password)
   */
  async changePassword({ userKey, currentPassword, newPassword }) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.user_key, userKey))
      .limit(1);

    if (!user) {
      throw new ErrorClass("User not found", 404);
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isPasswordValid) {
      throw new ErrorClass("Current password is incorrect", 401);
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw new ErrorClass(
        "New password must be different from current password",
        400
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const newTokenVersion = (user.token_version || 0) + 1;

    await db
      .update(users)
      .set({ password: hashedPassword, date_modified: new Date(), token_version: newTokenVersion })
      .where(eq(users.id, user.id));

    clearUserCache(user.user_key);

    return { message: "Password changed successfully" };
  }

  /**
   * Logout - invalidates the current token by incrementing token_version
   */
  async logout(userKey) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.user_key, userKey))
      .limit(1);

    if (!user) {
      throw new ErrorClass("User not found", 404);
    }

    await db
      .update(users)
      .set({ token_version: (user.token_version || 0) + 1, date_modified: new Date() })
      .where(eq(users.id, user.id));

    clearUserCache(user.user_key);

    return { message: "Logged out successfully" };
  }

  /**
   * Get current user profile
   */
  async getProfile(userId) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new ErrorClass("User not found", 404);
    }

    return this._sanitizeUser(user);
  }
}

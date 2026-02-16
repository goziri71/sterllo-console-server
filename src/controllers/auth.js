import AuthService from "../services/auth.js";
import { ErrorClass } from "../utils/errorClass/index.js";

const authService = new AuthService();

export const register = async (request, reply) => {
  if (!request.body || Object.keys(request.body).length === 0) {
    throw new ErrorClass("Request body is required", 400);
  }
  const { email, password, first_name, last_name, role } = request.body;

  // Validation
  const missingFields = [];
  if (!email) missingFields.push("email");
  if (!password) missingFields.push("password");
  if (!first_name) missingFields.push("first_name");
  if (!last_name) missingFields.push("last_name");

  if (missingFields.length > 0) {
    throw new ErrorClass(`Missing required fields: ${missingFields.join(", ")}`, 400);
  }

  if (password.length < 8) {
    throw new ErrorClass("Password must be at least 8 characters", 400);
  }

  const result = await authService.register({
    email,
    password,
    first_name,
    last_name,
    role,
  });

  return reply.code(201).send({
    code: 201,
    success: true,
    message: "User registered successfully",
    data: result,
  });
};

export const login = async (request, reply) => {
  if (!request.body || Object.keys(request.body).length === 0) {
    throw new ErrorClass("Login request body is required", 400);
  }

  const { email, password } = request.body;

  const missingFields = [];
  if (!email) missingFields.push("email");
  if (!password) missingFields.push("password");
  if (missingFields.length > 0) {
    throw new ErrorClass(`Missing required fields: ${missingFields.join(", ")}`, 400);
  }

  const result = await authService.login({ email, password });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Login successful",
    data: result,
  });
};

export const changePassword = async (request, reply) => {
  if (!request.body || Object.keys(request.body).length === 0) {
    throw new ErrorClass("Request body is required", 400);
  }
  const { current_password, new_password } = request.body;

  const missingFields = [];
  if (!current_password) missingFields.push("current_password");
  if (!new_password) missingFields.push("new_password");

  if (missingFields.length > 0) {
    throw new ErrorClass(`Missing required fields: ${missingFields.join(", ")}`, 400);
  }

  if (new_password.length < 8) {
    throw new ErrorClass("New password must be at least 8 characters", 400);
  }

  const result = await authService.changePassword({
    userId: request.user.id,
    currentPassword: current_password,
    newPassword: new_password,
  });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: result.message,
  });
};

export const logout = async (request, reply) => {
  const result = await authService.logout(request.user.user_key);

  return reply.code(200).send({
    code: 200,
    success: true,
    message: result.message,
  });
};

export const getProfile = async (request, reply) => {
  const user = await authService.getProfile(request.user.id);

  return reply.code(200).send({
    code: 200,
    success: true,
    data: user,
  });
};

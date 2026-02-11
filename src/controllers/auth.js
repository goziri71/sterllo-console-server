import AuthService from "../services/auth.js";
import { tryCatchFunction } from "../utils/tryCatch/index.js";
import { ErrorClass } from "../utils/errorClass/index.js";

const authService = new AuthService();

export const register = tryCatchFunction(async (req, res) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new ErrorClass("Request body is required", 400);
  }
  const { email, password, first_name, last_name, role } = req.body;

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

  res.status(201).json({
    code: 201,
    success: true,
    message: "User registered successfully",
    data: result,
  });
});



export const login = tryCatchFunction(async (req, res) => {
  if(!req.body || Object.keys(req.body).length === 0){
    throw new ErrorClass("Login request body is required", 400);
  }

  const { email, password } = req.body;

  const missingFields = [];
  if (!email) missingFields.push("email");
  if (!password) missingFields.push("password");
  if (missingFields.length > 0) {
    throw new ErrorClass(`Missing required fields: ${missingFields.join(", ")}`, 400);
  }

  const result = await authService.login({ email, password });

  res.status(200).json({
    code: 200,
    success: true,
    message: "Login successful",
    data: result,
  });
});



export const changePassword = tryCatchFunction(async (req, res) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    throw new ErrorClass("Request body is required", 400);
  }
  const { current_password, new_password } = req.body;

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
    userId: req.user.id,
    currentPassword: current_password,
    newPassword: new_password,
  });

  res.status(200).json({
    code: 200,
    success: true,
    message: result.message,
  });
});


export const getProfile = tryCatchFunction(async (req, res) => {
  const user = await authService.getProfile(req.user.id);

  res.status(200).json({
    code: 200,
    success: true,
    data: user,
  });
});

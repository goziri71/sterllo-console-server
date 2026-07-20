import AuthService from "../services/auth.js";
import { requestSecurityMetadata } from "../services/mfaSecurity.js";
import { ErrorClass } from "../utils/errorClass/index.js";

export const register = async (request, reply) => {
  const authService = new AuthService();
  if (!request.body || Object.keys(request.body).length === 0) {
    throw new ErrorClass("Request body is required", 400);
  }
  const { email, password, first_name, last_name, device_label } = request.body;

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
    metadata: requestSecurityMetadata(request, device_label),
  });

  return reply.code(201).send({
    code: 201,
    success: true,
    message: "User registered successfully",
    data: result,
  });
};

export const login = async (request, reply) => {
  const authService = new AuthService();
  if (!request.body || Object.keys(request.body).length === 0) {
    throw new ErrorClass("Login request body is required", 400);
  }

  const { email, password, device_label } = request.body;

  const missingFields = [];
  if (!email) missingFields.push("email");
  if (!password) missingFields.push("password");
  if (missingFields.length > 0) {
    throw new ErrorClass(`Missing required fields: ${missingFields.join(", ")}`, 400);
  }

  const result = await authService.login({
    email,
    password,
    metadata: requestSecurityMetadata(request, device_label),
  });

  return reply.code(200).send({
    code: 200,
    success: true,
    message:
      result.state === "mfa_enrollment_required"
        ? "MFA enrollment required"
        : "MFA verification required",
    data: result,
  });
};

export const loginCrosslink = async (request, reply) => {
  const authService = new AuthService();
  if (!request.body || Object.keys(request.body).length === 0) {
    throw new ErrorClass("Request body is required", 400);
  }

  const { token, device_label } = request.body;
  if (!token || typeof token !== "string" || !token.trim()) {
    throw new ErrorClass("Missing required fields: token", 400);
  }

  const result = await authService.loginCrosslink({
    token: token.trim(),
    metadata: requestSecurityMetadata(request, device_label),
  });

  const isAuthenticated = result.state === "authenticated";
  return reply.code(200).send({
    code: 200,
    success: true,
    status: true,
    message: isAuthenticated
      ? "Login successful"
      : result.state === "mfa_enrollment_required"
        ? "MFA enrollment required"
        : "MFA verification required",
    data: isAuthenticated
      ? {
          authToken: result.authToken || result.token,
          token: result.token,
          sessionID: result.sessionID ?? null,
          userKey: result.userKey ?? null,
          user: result.user,
          session: result.session,
          state: result.state,
        }
      : result,
  });
};

export const confirmMfaEnrollment = async (request, reply) => {
  if (!request.body || Object.keys(request.body).length === 0) {
    throw new ErrorClass("Request body is required", 400);
  }
  const { challenge_token, code, device_label } = request.body;
  if (!challenge_token || !code) {
    throw new ErrorClass("challenge_token and code are required", 400);
  }
  if (!/^\d{6}$/.test(String(code))) {
    throw new ErrorClass("code must be a 6-digit authenticator code", 400);
  }

  const result = await new AuthService().confirmMfaEnrollment({
    challengeToken: challenge_token,
    code: String(code),
    metadata: requestSecurityMetadata(request, device_label),
  });
  return reply.code(200).send({
    code: 200,
    success: true,
    status: true,
    message: "MFA enrolled and login completed",
    data: {
      ...result,
      authToken: result.authToken || result.token,
      token: result.token,
    },
  });
};

export const completeMfaLogin = async (request, reply) => {
  if (!request.body || Object.keys(request.body).length === 0) {
    throw new ErrorClass("Request body is required", 400);
  }
  const { challenge_token, code, recovery_code, device_label } = request.body;
  if (!challenge_token || (!code && !recovery_code)) {
    throw new ErrorClass(
      "challenge_token and either code or recovery_code are required",
      400,
    );
  }
  if (code && !/^\d{6}$/.test(String(code))) {
    throw new ErrorClass("code must be a 6-digit authenticator code", 400);
  }

  const result = await new AuthService().completeMfaLogin({
    challengeToken: challenge_token,
    code: code ? String(code) : undefined,
    recoveryCode: recovery_code,
    metadata: requestSecurityMetadata(request, device_label),
  });
  return reply.code(200).send({
    code: 200,
    success: true,
    status: true,
    message: "Login successful",
    data: {
      ...result,
      authToken: result.authToken || result.token,
      token: result.token,
    },
  });
};

export const changePassword = async (request, reply) => {
  const authService = new AuthService();
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
    userKey: request.user.user_key,
    currentPassword: current_password,
    newPassword: new_password,
    metadata: requestSecurityMetadata(request),
  });

  return reply.code(200).send({
    code: 200,
    success: true,
    message: result.message,
  });
};

export const logout = async (request, reply) => {
  const authService = new AuthService();
  const result = await authService.logout(
    request.user.id,
    request.authSession.id,
    requestSecurityMetadata(request),
  );

  return reply.code(200).send({
    code: 200,
    success: true,
    message: result.message,
  });
};

export const logoutAll = async (request, reply) => {
  const result = await new AuthService().logoutAll(
    request.user.id,
    requestSecurityMetadata(request),
  );
  return reply.code(200).send({
    code: 200,
    success: true,
    message: result.message,
  });
};

export const listSessions = async (request, reply) => {
  const sessions = await new AuthService().listSessions(request.user.id);
  return reply.code(200).send({
    code: 200,
    success: true,
    data: {
      current_session_id: request.authSession.id,
      sessions,
    },
  });
};

export const regenerateRecoveryCodes = async (request, reply) => {
  const { code } = request.body || {};
  if (!code || !/^\d{6}$/.test(String(code))) {
    throw new ErrorClass("A valid 6-digit authenticator code is required", 400);
  }
  const recoveryCodes = await new AuthService().regenerateRecoveryCodes(
    request.user.id,
    String(code),
    requestSecurityMetadata(request),
  );
  return reply.code(200).send({
    code: 200,
    success: true,
    message: "Recovery codes regenerated",
    data: { recovery_codes: recoveryCodes },
  });
};

export const verifyMfaStepUp = async (request, reply) => {
  const { code } = request.body || {};
  if (!code || !/^\d{6}$/.test(String(code))) {
    throw new ErrorClass("A valid 6-digit authenticator code is required", 400);
  }
  const result = await new AuthService().verifyMfaStepUp(
    request.user.id,
    request.authSession.id,
    String(code),
    requestSecurityMetadata(request),
  );
  return reply.code(200).send({
    code: 200,
    success: true,
    message: "MFA verification refreshed",
    data: result,
  });
};

export const getProfile = async (request, reply) => {
  const authService = new AuthService();
  const user = await authService.getProfile(request.user.id);

  return reply.code(200).send({
    code: 200,
    success: true,
    data: user,
  });
};

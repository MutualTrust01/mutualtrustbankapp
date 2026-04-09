/**
 * Password Policy Validator
 * @param {string} password
 * @param {"Weak" | "Medium" | "Strong"} policy
 * @returns {string|null} error message or null if valid
 */
const validatePassword = (password, policy = "Weak") => {
  if (!password || password.length < 6) {
    return "Password must be at least 6 characters long";
  }

  if (policy === "Weak") {
    return null;
  }

  if (policy === "Medium") {
    if (!/[A-Z]/.test(password))
      return "Password must contain at least one uppercase letter";
    if (!/[a-z]/.test(password))
      return "Password must contain at least one lowercase letter";
    if (!/[0-9]/.test(password))
      return "Password must contain at least one number";
    if (password.length < 8)
      return "Password must be at least 8 characters long";
  }

  if (policy === "Strong") {
    if (password.length < 10)
      return "Password must be at least 10 characters long";
    if (!/[A-Z]/.test(password))
      return "Password must contain at least one uppercase letter";
    if (!/[a-z]/.test(password))
      return "Password must contain at least one lowercase letter";
    if (!/[0-9]/.test(password))
      return "Password must contain at least one number";
    if (!/[^A-Za-z0-9]/.test(password))
      return "Password must contain at least one special character";
  }

  return null;
};

module.exports = validatePassword;

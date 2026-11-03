export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const EMAIL_PATTERN = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;

export const isValidEmail = (email: string) =>
  EMAIL_PATTERN.test(normalizeEmail(email));

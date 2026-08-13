import { z } from "zod";

/**
 * Zod schemas for every auth request body. Route handlers parse against these
 * and translate a failure into a 400 with a helpful `error` message.
 */

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(200, "Password must be at most 200 characters long"),
  name: z.string().trim().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("A valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;

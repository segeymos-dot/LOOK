import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z.string().min(6, "Минимум 6 символов"),
});

export const registerSchema = z.object({
  full_name: z.string().min(2, "Минимум 2 символа"),
  email: z.string().email("Введите корректный email"),
  password: z.string().min(6, "Минимум 6 символов"),
  role: z.enum(["customer", "provider", "both"]),
});

export const requestSchema = z.object({
  title: z.string().min(5, "Минимум 5 символов").max(100),
  description: z.string().min(20, "Минимум 20 символов").max(2000),
  category_id: z.string().uuid().optional(),
  budget_min: z.coerce.number().positive().optional(),
  budget_max: z.coerce.number().positive().optional(),
  location: z.string().max(200).optional(),
  deadline: z.string().optional(),
});

export const offerSchema = z.object({
  price: z.coerce.number().positive("Укажите цену"),
  message: z.string().min(10, "Минимум 10 символов").max(1000),
  estimated_days: z.coerce.number().int().positive().optional(),
});

export const messageSchema = z.object({
  content: z.string().min(1, "Сообщение не может быть пустым").max(2000),
});

export const profileSchema = z.object({
  full_name: z.string().min(2).max(100),
  bio: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  role: z.enum(["customer", "provider", "both"]),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RequestInput = z.infer<typeof requestSchema>;
export type OfferInput = z.infer<typeof offerSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;

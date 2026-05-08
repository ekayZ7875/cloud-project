import { z } from "zod";
import { SHARE_PERMISSION_VALUES } from "../constants/share.constants.js";

const emailSchema = z.string().trim().email().transform((value) => value.toLowerCase());

export const createShareSchema = z.object({
  fileId: z.string().min(1),
  recipientEmail: emailSchema,
  permission: z.enum(SHARE_PERMISSION_VALUES).default("VIEW"),
  expiresAt: z.string().datetime().optional(),
  emailNotification: z.boolean().default(true),
});

export const shareActionSchema = z.object({
  shareId: z.string().min(1),
});

export const updatePermissionSchema = z.object({
  shareId: z.string().min(1),
  permission: z.enum(SHARE_PERMISSION_VALUES),
});

export function validateCreateShare(payload) {
  return createShareSchema.parse(payload);
}

export function validateShareAction(payload) {
  return shareActionSchema.parse(payload);
}

export function validatePermissionUpdate(payload) {
  return updatePermissionSchema.parse(payload);
}

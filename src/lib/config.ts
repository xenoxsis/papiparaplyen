/**
 * App-level feature flags and configuration constants.
 *
 * AVATAR_UPLOAD_ROLES — roles that are allowed to upload a profile photo.
 * Currently limited to Vagt and Administrator. Extend to include "Medlem"
 * (and/or others) to open the feature up to all regular members.
 */
export const AVATAR_UPLOAD_ROLES: string[] = ["Vagt", "Administrator"];

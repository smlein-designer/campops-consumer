import type { Permission, PermissionCheckResult, PermissionId } from "@/lib/v3/schemas";

export type PermissionAction =
  | { type: "hold"; refundable: boolean; amountUsd: number }
  | { type: "rehold" }
  | { type: "replan" }
  | { type: "suggest" }
  | { type: "book_and_charge" };

export type PermissionDecision = { result: PermissionCheckResult; permissionId: PermissionId };

/**
 * Permission check (Build Brief §10) — runs before every hold, re-hold,
 * replan, or suggestion. Pure function of the CURRENT permissions, so a
 * change the user makes mid-task applies to the very next check without any
 * extra wiring (Build Brief §7 "A change to any permission applies to the
 * agent's next action").
 */
export function checkPermission(permissions: Permission[], action: PermissionAction): PermissionDecision {
  const byId = (id: PermissionId): Permission => {
    const permission = permissions.find((p) => p.id === id);
    if (!permission) throw new Error(`No permission "${id}" in the given permission set`);
    return permission;
  };

  if (action.type === "book_and_charge") {
    // Never allowed without explicit authorization, regardless of settings.
    return { result: "ask", permissionId: "book_and_charge" };
  }

  if (action.type === "hold") {
    const id: PermissionId = action.refundable ? "hold_refundable" : "hold_nonrefundable";
    const permission = byId(id);
    if (!permission.enabled) return { result: "ask", permissionId: id };
    if (permission.limitUsd != null && action.amountUsd > permission.limitUsd) {
      return { result: "ask", permissionId: id };
    }
    return { result: "allow", permissionId: id };
  }

  if (action.type === "rehold") {
    const permission = byId("rehold_on_expiry");
    return { result: permission.enabled ? "allow" : "ask", permissionId: "rehold_on_expiry" };
  }

  if (action.type === "replan") {
    // Always asks before applying when enabled (Build Brief §10/§11); when
    // off, no alternative is proposed at all.
    const permission = byId("replan_on_condition");
    return { result: permission.enabled ? "ask" : "deny", permissionId: "replan_on_condition" };
  }

  // suggest
  const permission = byId("suggest_extras");
  return { result: permission.enabled ? "allow" : "deny", permissionId: "suggest_extras" };
}

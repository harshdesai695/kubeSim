/**
 * RBAC evaluation (Phase 8) — resolves which rules apply to a subject and
 * whether a (verb, resource) is permitted. Simplified but faithful to the real
 * binding-resolution model.
 */

import type {
  ClusterRole,
  ClusterRoleBinding,
  PolicyRule,
  Role,
  RoleBinding,
  Subject,
} from "@/store/types";

export interface RbacTables {
  roles: Role[];
  clusterRoles: ClusterRole[];
  roleBindings: RoleBinding[];
  clusterRoleBindings: ClusterRoleBinding[];
}

/** A selected identity to evaluate permissions for. */
export interface SubjectRef {
  kind: Subject["kind"];
  name: string;
  namespace?: string;
}

export function subjectId(s: SubjectRef): string {
  return s.kind === "ServiceAccount"
    ? `ServiceAccount:${s.namespace ?? "default"}/${s.name}`
    : `${s.kind}:${s.name}`;
}

function subjectMatches(a: Subject, b: SubjectRef): boolean {
  if (a.kind !== b.kind || a.name !== b.name) return false;
  if (a.kind === "ServiceAccount") {
    return (a.namespace ?? "default") === (b.namespace ?? "default");
  }
  return true;
}

function wildcardIncludes(list: string[], value: string): boolean {
  return list.includes("*") || list.includes(value);
}

export function ruleMatches(
  rule: PolicyRule,
  verb: string,
  resource: string,
): boolean {
  return (
    wildcardIncludes(rule.verbs, verb) &&
    wildcardIncludes(rule.resources, resource)
  );
}

/** All PolicyRules that apply to `subject` in `namespace`. */
export function gatherRules(
  t: RbacTables,
  subject: SubjectRef,
  namespace: string,
): PolicyRule[] {
  const rules: PolicyRule[] = [];

  // ClusterRoleBindings apply cluster-wide.
  for (const crb of t.clusterRoleBindings) {
    if (crb.subjects.some((s) => subjectMatches(s, subject))) {
      const cr = t.clusterRoles.find((r) => r.metadata.name === crb.roleRef.name);
      if (cr) rules.push(...cr.rules);
    }
  }

  // RoleBindings apply within their namespace.
  for (const rb of t.roleBindings) {
    if (rb.metadata.namespace !== namespace) continue;
    if (!rb.subjects.some((s) => subjectMatches(s, subject))) continue;
    if (rb.roleRef.kind === "Role") {
      const role = t.roles.find(
        (r) => r.metadata.namespace === namespace && r.metadata.name === rb.roleRef.name,
      );
      if (role) rules.push(...role.rules);
    } else {
      const cr = t.clusterRoles.find((r) => r.metadata.name === rb.roleRef.name);
      if (cr) rules.push(...cr.rules);
    }
  }

  return rules;
}

export function canI(
  t: RbacTables,
  subject: SubjectRef,
  verb: string,
  resource: string,
  namespace: string,
): boolean {
  return gatherRules(t, subject, namespace).some((r) =>
    ruleMatches(r, verb, resource),
  );
}

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ["*"],
  TREASURER: ["donation:*", "contribution:*", "report:financial"],
  MATRIMONIAL_ADMIN: ["matrimonial:*"],
  SCHOLARSHIP_ADMIN: ["scholarship:*"],
  JOB_ADMIN: ["job:*"],
  DHARAMSHALA_ADMIN: ["dharamshala:*"],
  CONTENT_ADMIN: ["notice:*", "publication:*", "gallery:*", "management:*", "cms:*"],
  MODERATOR: ["community:moderate", "issue:read", "issue:moderate", "shradhanjali:review", "achievement:review"],
  MEMBER: [
    "profile:self",
    "directory:read",
    "family:create",
    "family:join",
    "job:create",
    "job:apply",
    "scholarship:apply",
    "matrimonial:create",
    "matrimonial:read",
    "matrimonial:interest",
    "matrimonial:contact",
    "matrimonial:report",
    "matrimonial:block",
    "issue:create",
    "issue:read",
    "issue:respond",
    "dharamshala:book",
    "community:create",
    "community:read",
    "community:comment",
    "community:report",
    "poll:read",
    "poll:vote",
    "achievement:create",
    "shradhanjali:create",
  ],

  // Temporary compatibility roles used by the current legacy routes.
  Admin: ["*"],
  Instructor: ["profile:self"],
  Student: ["profile:self"],
};

function hasPermission(roles = [], permission) {
  const rawRoles = Array.isArray(roles) ? roles : [roles];
  const normalizedRoles = rawRoles
    .filter(Boolean)
    .map((r) => String(r).toUpperCase().trim());

  if (normalizedRoles.length === 0) {
    normalizedRoles.push("MEMBER");
  }

  const userPermissions = normalizedRoles.flatMap((role) => {
    return (
      ROLE_PERMISSIONS[role] ||
      (role === "ADMIN" ? ROLE_PERMISSIONS["SUPER_ADMIN"] : []) ||
      (role === "MEMBER" ? ROLE_PERMISSIONS["MEMBER"] : []) ||
      []
    );
  });
  const [resource] = permission.split(":");

  return (
    userPermissions.includes("*") ||
    userPermissions.includes(permission) ||
    userPermissions.includes(`${resource}:*`)
  );
}

module.exports = {
  ROLE_PERMISSIONS,
  hasPermission,
};

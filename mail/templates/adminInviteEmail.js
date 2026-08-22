function adminInviteEmail({ email, roles, url }) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Samaj Community Platform admin invite</h2>
      <p>An admin account has been invited for <strong>${email}</strong>.</p>
      <p>Roles: <strong>${roles.join(", ")}</strong></p>
      <p>Use this secure link to set your password and activate the account:</p>
      <p><a href="${url}">${url}</a></p>
      <p>This invite expires automatically. If you did not expect this email, you can ignore it.</p>
    </div>
  `;
}

module.exports = adminInviteEmail;

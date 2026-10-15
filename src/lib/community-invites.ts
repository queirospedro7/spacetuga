import type { Community, MyProfile } from '@/types';

export function canInviteToCommunity(community: Community, profile: MyProfile): boolean {
  if (!community.members.includes(profile.id)) return false;
  const roleIds = community.memberRoles?.[profile.id] || [];
  return community.ownerId === profile.id || !!profile.globalRole || !!community.admins?.includes(profile.id) || !!community.allowMemberInvites || !!community.roles?.some((role) => roleIds.includes(role.id) && (role.permissions.administrator || role.permissions.inviteMembers));
}

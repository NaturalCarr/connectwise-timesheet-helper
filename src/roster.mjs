export function lookupServiceUser(roster, query) {
  if (!roster || roster.schemaVersion !== 1 || !Array.isArray(roster.users)) {
    throw new Error('A version 1 service roster is required.');
  }
  const key = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!key) throw new Error('A full name or email address is required.');
  const matches = roster.users.filter((user) =>
    user.email?.toLowerCase() === key || user.name?.toLowerCase() === key);
  if (matches.length === 1) return { found: true, ambiguous: false, user: matches[0] };
  if (matches.length > 1) return {
    found: true,
    ambiguous: true,
    candidates: matches.map(({ name, email, acronym, organization }) =>
      ({ name, email, acronym, organization }))
  };
  return { found: false, ambiguous: false };
}

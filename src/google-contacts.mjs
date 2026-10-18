const normalized = (value) => value.trim().replace(/\s+/g, ' ');
const plainAdminHeader = (header) => header.replace(/\s+\[[^\]]+\]$/g, '').trim();

function schoolFromOrgUnit(path) {
  const segments = (path || '').split('/').map(normalized).filter(Boolean);
  const staffIndex = segments.findIndex((segment) => /^[A-Z0-9]{2,16} - Staff$/i.test(segment));
  return staffIndex > 0 ? {
    acronym: segments[staffIndex].replace(/ - Staff$/i, '').toUpperCase(),
    organization: segments[staffIndex - 1]
  } : { acronym: null, organization: null };
}

export function parseCsv(text) {
  if (typeof text !== 'string') throw new Error('Contacts CSV must be text.');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('Contacts CSV has an unclosed quoted value.');
  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value !== '')) rows.push(row);
  }
  return rows;
}

export function inspectGoogleContactsCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('Contacts CSV needs a header and at least one contact.');
  const headers = rows[0].map(normalized);
  if (!headers.some((value) => /^(name|first name|given name|organization 1 - name)$/i.test(value))) {
    throw new Error('This does not look like a Google Contacts CSV export.');
  }
  const categories = new Map();
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    if (/^organization \d+ - (name|department)$/i.test(header)
      || /^address \d+ - (formatted|city|region)$/i.test(header)
      || /^custom field \d+ - value$/i.test(header)
      || /^labels$/i.test(header)) categories.set(index, header);
  }
  const values = new Map();
  for (const row of rows.slice(1)) {
    for (const [index, header] of categories) {
      const raw = normalized(row[index] || '');
      for (const value of header.toLowerCase() === 'labels' ? raw.split(':::').map(normalized) : [raw]) {
        if (!value) continue;
        const key = `${header}\0${value.toLowerCase()}`;
        const current = values.get(key);
        values.set(key, current ? { ...current, count: current.count + 1 }
          : { column: header, value, count: 1 });
      }
    }
  }
  return {
    source: 'Google Contacts CSV',
    contactCount: rows.length - 1,
    columns: headers,
    candidateSiteValues: [...values.values()].sort((a, b) =>
      a.column.localeCompare(b.column) || a.value.localeCompare(b.value))
  };
}

export function inspectWorkspaceUsersCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('Admin users CSV needs a header and at least one user.');
  const headers = rows[0].map(normalized);
  if (!headers.some((header) => /^(email address|primary email|email)$/i.test(plainAdminHeader(header)))) {
    throw new Error('This does not look like a Google Admin users CSV export.');
  }
  const candidateColumns = headers.map((header, index) => ({ header, index }))
    .filter(({ header }) => /org(anizational)? unit|department|building|location|organization|title|floor|office|address|custom/i.test(plainAdminHeader(header))
      && !/email|phone|manager/i.test(plainAdminHeader(header)));
  const counts = new Map();
  const schoolCounts = new Map();
  let unmappedUsers = 0;
  const orgUnitIndex = headers.findIndex((header) => /^org unit path$/i.test(plainAdminHeader(header)));
  for (const row of rows.slice(1)) {
    const { acronym, organization } = schoolFromOrgUnit(row[orgUnitIndex]);
    if (acronym) {
      const key = `${acronym}\0${organization.toLowerCase()}`;
      const current = schoolCounts.get(key);
      schoolCounts.set(key, current ? { ...current, userCount: current.userCount + 1 }
        : { acronym, organization, userCount: 1 });
    } else unmappedUsers += 1;
    for (const { header, index } of candidateColumns) {
      const value = normalized(row[index] || '');
      if (!value) continue;
      const key = `${header}\0${value.toLowerCase()}`;
      const current = counts.get(key);
      counts.set(key, current ? { ...current, count: current.count + 1 }
        : { column: header, value, count: 1 });
    }
  }
  return {
    source: 'Google Admin users CSV',
    userCount: rows.length - 1,
    columns: headers,
    schoolCandidates: [...schoolCounts.values()].sort((a, b) => a.acronym.localeCompare(b.acronym)),
    unmappedUsers,
    candidateSiteValues: [...counts.values()].sort((a, b) =>
      a.column.localeCompare(b.column) || a.value.localeCompare(b.value))
  };
}

export function buildServiceRosterCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('Admin users CSV needs a header and at least one user.');
  const headers = rows[0].map((header) => plainAdminHeader(normalized(header)).toLowerCase());
  const indexOf = (name) => {
    const index = headers.indexOf(name);
    if (index < 0) throw new Error(`Admin users CSV is missing ${name}.`);
    return index;
  };
  const first = indexOf('first name');
  const last = indexOf('last name');
  const email = indexOf('email address');
  const orgUnit = indexOf('org unit path');
  const title = headers.indexOf('employee title');
  const department = headers.indexOf('department');
  const status = headers.indexOf('status');
  const users = rows.slice(1).map((row) => {
    const address = normalized(row[email] || '').toLowerCase();
    if (!address.includes('@')) throw new Error('A user row is missing an email address.');
    const orgUnitPath = normalized(row[orgUnit] || '');
    const school = schoolFromOrgUnit(orgUnitPath);
    return {
      name: [normalized(row[first] || ''), normalized(row[last] || '')].filter(Boolean).join(' '),
      email: address,
      orgUnitPath,
      acronym: school.acronym,
      organization: school.organization,
      title: title < 0 ? '' : normalized(row[title] || ''),
      department: department < 0 ? '' : normalized(row[department] || ''),
      status: status < 0 ? '' : normalized(row[status] || '')
    };
  });
  if (new Set(users.map((user) => user.email)).size !== users.length) {
    throw new Error('Admin users CSV contains duplicate email addresses.');
  }
  return { schemaVersion: 1, source: 'Google Admin Users CSV', users };
}

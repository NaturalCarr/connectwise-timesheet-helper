export function validateSchoolMappings(value = []) {
 if(!Array.isArray(value))throw new Error('School mappings must be an array.');
 const seen=new Set();
 return value.map(row=>{
  const acronym=String(row.acronym||'').trim().toUpperCase(),company=String(row.company||'').trim(),site=String(row.site||'').trim();
  if(!/^[A-Z0-9]{2,16}$/.test(acronym))throw new Error('Each acronym must be 2-16 letters or digits.');
  if(!company || !site)throw new Error('Each acronym needs an exact Company and Site.');
  const key=company.toLowerCase()+'\0'+acronym;
  if(seen.has(key))throw new Error('Duplicate acronym for Company: '+acronym);
  seen.add(key);return {acronym,company,site};
 });
}
export function mappedSchoolSite(settings,acronym) {
 return validateSchoolMappings(settings.schoolMappings).find(row=>row.acronym===acronym && row.company.toLowerCase()===String(settings.company||'').trim().toLowerCase())?.site || null;
}

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
export function settingsWithJsonSchools(record,settings) {
 const mappings=validateSchoolMappings(settings.schoolMappings);
 const company=String(settings.company||'').trim();
 for(const row of Array.isArray(record?.items)?record.items:[record]){
  if(!row || typeof row.school!=='string' || !row.school.trim() || typeof row.site!=='string' || !row.site.trim())continue;
  const candidate=validateSchoolMappings([{acronym:row.school,company,site:row.site}])[0];
  const prior=mappings.find(m=>m.company.toLowerCase()===company.toLowerCase() && m.acronym===candidate.acronym);
  if(prior && prior.site.toLowerCase()!==candidate.site.toLowerCase())throw new Error('School mapping conflict for '+candidate.acronym+': saved Site '+prior.site+', JSON Site '+candidate.site+'. Review it in Settings.');
  if(!prior)mappings.push(candidate);
 }
 return {...settings,schoolMappings:mappings};
}

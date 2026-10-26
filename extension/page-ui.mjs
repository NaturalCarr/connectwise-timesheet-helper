const path=location.pathname.split('/').pop();
if(path==='popup.html'){document.body.classList.add('helper-popup');}else{
 document.body.classList.add('app-page');
 const nav=document.createElement('nav');nav.className='page-nav';nav.setAttribute('aria-label','Workspace navigation');
 const brand=document.createElement('a');brand.className='page-brand';brand.href='popup.html?workspace=1';brand.textContent='ConnectWise Helper';
 const links=document.createElement('div');links.className='page-nav-links';
 for(const [href,label] of [['popup.html?workspace=1','Workspace'],['history.html','History & Resume'],['settings.html','Settings']]){const a=document.createElement('a');a.href=href;a.textContent=label;if(href===path)a.setAttribute('aria-current','page');links.append(a);}
 const version=document.createElement('span');version.className='page-version';const build=globalThis.chrome?.runtime?.getManifest?.().version;if(build)version.textContent='v'+build;links.append(version);nav.append(brand,links);document.body.prepend(nav);
}

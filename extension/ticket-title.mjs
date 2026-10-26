export function normalizeTicketTitle(ticket, limit=100) {
 if(typeof ticket.summary!=='string' || ticket.summary.length<=limit)return ticket;
 const full=ticket.summary;
 const reference=String(ticket.titleContains || '').match(/\bT-\d+\b/i)?.[0];
 const suffix=reference && reference.length+3<limit?' - '+reference:'';
 let summary=full.slice(0,limit-suffix.length).trimEnd();
 if(/[\uD800-\uDBFF]$/.test(summary))summary=summary.slice(0,-1);
 summary+=suffix;
 return {...ticket,summary,description:(ticket.description || full)+(ticket.description?.includes(full)?'':'\n\nFull requested title: '+full)};
}

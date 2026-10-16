import { reviewPlan } from './workflow.mjs';
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
export function renderRunReview(container,plan){
 container.replaceChildren();container.classList.add('run-review');
 const review=reviewPlan(plan);
 const hours=minutes=>(minutes/60).toFixed(2)+' h';
 for(const [index,ticket] of review.tickets.entries()){
  const item=plan.tickets[index],card=element('article',undefined,'review-ticket');
  const header=element('header');header.append(element('span',`Ticket ${index+1} of ${review.tickets.length}`,'review-number'),element('h3',ticket.summary));card.append(header);
  const meta=element('div',undefined,'review-meta');meta.append(element('span',ticket.lookup),element('span',`Final status: ${ticket.status}`,'review-status'));card.append(meta,element('p',ticket.action,'review-action'));
  if(item.ticket.description)card.append(element('p',item.ticket.description,'review-description'));
  card.append(element('h4',`${ticket.entries} time ${ticket.entries===1?'entry':'entries'}`));
  for(const entry of item.timeEntries){
    const row=element('section',undefined,'review-entry');
    const start=entry.start.split(':').map(Number),end=entry.end.split(':').map(Number);
    row.append(element('strong',`${entry.date} · ${entry.start}–${entry.end} · ${hours(end[0]*60+end[1]-start[0]*60-start[1])}`),element('p',entry.notes,'review-notes'),element('small',`${entry.workType} · ${entry.workRole} · ${entry.billable==='AUTO'?'Billing: ConnectWise default (unconfirmed)':entry.billable==='B'?'Billable':entry.billable==='NB'?'Do not bill':'No charge'}`));
    card.append(row);
  }
  container.append(card);
 }
 if(review.days.length){
  const summary=element('section',undefined,'review-totals');summary.append(element('h3','Daily totals'));
  for(const day of review.days){summary.append(element('h4',day.date),element('p',`${hours(day.totalMinutes)} total · ${hours(day.lunchMinutes)} lunch`),element('p',`${hours(day.billableMinutes)} billable · ${hours(day.nonbillableMinutes)} nonbillable · ${hours(day.unknownBillingMinutes)} billing unconfirmed`),element('p',`${day.gaps.length} unassigned gaps · ${day.overlaps.length} overlaps · ${hours(day.shortfallMinutes)} below 8.5 h target`));}
  summary.append(element('small','Gaps apply only within entered times. No time is added automatically.'));container.append(summary);
 }
}

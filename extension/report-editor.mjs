export function attachReportEditor(reports, {select,preview,editor,copy,status,onSave=async()=>{}}) {
  select.replaceChildren();
  for(const report of reports)select.add(new Option(report.date,report.date));
  const current=()=>reports.find(report=>report.date===select.value);
  const draw=()=>{const report=current();preview.innerHTML=report.html;editor.replaceChildren();
    for(const row of report.tickets){const box=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent=row.summary;box.append(legend);
      for(const key of ['notes','nextStep']){const label=document.createElement('label');label.textContent=key==='notes'?'Email notes':'Next step';const input=document.createElement('textarea');input.value=row[key]||'';input.rows=1;input.style.width='100%';input.style.minHeight='32px';
        input.oninput=async()=>{row[key]=input.value;input.style.height='auto';input.style.height=`${input.scrollHeight}px`;try{report.html=renderReport(report);preview.innerHTML=report.html;await onSave(report);}catch(error){status.textContent=error.message;}};
        label.append(input);box.append(label);}
      editor.append(box);
    }
  };
  select.onchange=draw; draw();
  copy.onclick=async()=>{try{const report=current();report.html=renderReport(report);await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([report.html],{type:'text/html'}),'text/plain':new Blob([preview.innerText],{type:'text/plain'})})]);status.textContent='EoD copied. Email edits do not change ConnectWise records.';}catch(error){status.textContent=`Copy failed: ${error.message}`;}};
}
import { renderReport } from './workflow.mjs';

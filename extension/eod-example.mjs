import { renderEod } from './eod-model.mjs';
export const exampleEodHtml = renderEod({date:'2026-01-01',subject:'Example EoD - replace with actual work',tickets:[
  {titleContains:'T-EXAMPLE',status:'Completed',notes:'Example only: describe the work performed.',nextStep:'Replace with the actual next step, or N/A.'}
]},[{ticketId:1,summary:'T-EXAMPLE - Example ticket',status:'Completed',verified:true}]);
export const exampleEodFile = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Example EoD</title><body style="font-family:Arial,sans-serif">${exampleEodHtml}</body></html>`;

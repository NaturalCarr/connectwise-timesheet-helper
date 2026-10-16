// Legacy ticket entry point shares the durable runner and retains CLI result shape.
const params=new URLSearchParams(location.hash.slice(1));
params.set('kind','ticket');
location.replace(chrome.runtime.getURL('runner.html')+'#'+params);

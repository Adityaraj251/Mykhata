(() => {
  'use strict';
  const KEY = 'myMoneyManager_v1';
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const today = () => new Date().toISOString().slice(0,10);
  const monthNow = () => today().slice(0,7);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now()+'_'+Math.random().toString(16).slice(2));
  const money = n => '₹' + Number(n || 0).toLocaleString('en-IN',{maximumFractionDigits:2});
  const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const categories = {
    income:['Pocket Money','Business Income','Freelancing','Gift','Other'],
    expense:['Food','Shopping','Education','Travel','Entertainment','Mobile / Recharge','Bills','Health','Personal','Other']
  };
  const methods = ['Cash','UPI','Bank Transfer','Card','Other'];
  let data = loadData(), editing = null, formKind = null;
  function blank(){return {income:[],expense:[],lends:[],borrows:[],events:[]};}
  function loadData(){
    try { const x=JSON.parse(localStorage.getItem(KEY)); if(!x || typeof x!=='object') return blank();
      return { ...blank(), ...x, income:Array.isArray(x.income)?x.income:[], expense:Array.isArray(x.expense)?x.expense:[], lends:Array.isArray(x.lends)?x.lends:[], borrows:Array.isArray(x.borrows)?x.borrows:[], events:Array.isArray(x.events)?x.events:[] };
    } catch { return blank(); }
  }
  function save(){ localStorage.setItem(KEY,JSON.stringify(data)); render(); }
  function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2400);}
  function sum(arr,fn=x=>x.amount){return arr.reduce((a,x)=>a+Number(fn(x)||0),0);}
  const remaining = x => Math.max(0,Number(x.amount)-Number(x.settled||0));
  const outstanding = arr => sum(arr,remaining);
  function totals(){
    const income=sum(data.income), expense=sum(data.expense);
    const borrowed=sum(data.borrows,x=>x.settled||0) + sum(data.borrows,x=>x.amount-(x.settled||0)); // borrowed principal is tracked separately below
    const receivedReturns=sum(data.lends,x=>x.settled||0);
    const paidRepayments=sum(data.borrows,x=>x.settled||0);
    const lentOut=sum(data.lends,x=>x.settled||0)+outstanding(data.lends);
    const borrowedIn=sum(data.borrows,x=>x.amount);
    return {income,expense,balance:income-expense+borrowedIn-lentOut+receivedReturns-paidRepayments,receivable:outstanding(data.lends),payable:outstanding(data.borrows)};
  }
  // Every settlement is represented in events, while principal entries carry only the cash-flow at creation.
  function eventList(){
    const base=[];
    data.income.forEach(x=>base.push({id:x.id,title:x.from||'Income',amount:+x.amount,type:'Income',category:x.category,date:x.date,source:'income',sourceId:x.id}));
    data.expense.forEach(x=>base.push({id:x.id,title:x.title||'Expense',amount:-(+x.amount),type:'Expense',category:x.category,date:x.date,source:'expense',sourceId:x.id}));
    data.lends.forEach(x=>{
      base.push({id:'lend_'+x.id,title:'Money given to '+x.person,amount:-(+x.amount),type:'Lent',category:'Lending',date:x.date,source:'lend',sourceId:x.id});
      if(x.settled>0) base.push({id:'return_'+x.id,title:'Returned by '+x.person,amount:+x.settled,type:'Returned',category:'Loan return',date:x.lastSettlementDate||x.expected||x.date,source:'settlement',sourceId:x.id});
    });
    data.borrows.forEach(x=>{
      base.push({id:'borrow_'+x.id,title:'Borrowed from '+x.person,amount:+x.amount,type:'Borrowed',category:'Borrowing',date:x.date,source:'borrow',sourceId:x.id});
      if(x.settled>0) base.push({id:'repay_'+x.id,title:'Repaid to '+x.person,amount:-(+x.settled),type:'Repayment',category:'Loan repayment',date:x.lastSettlementDate||x.expected||x.date,source:'settlement',sourceId:x.id});
    });
    return base.sort((a,b)=>b.date.localeCompare(a.date));
  }
  function fmtDate(d){if(!d)return '—';return new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});}
  function empty(msg='No records yet. Add your first record to get started.'){return `<div class="empty-state">${escapeHTML(msg)}</div>`;}
  function actionButtons(kind,id){return `<div class="row-actions"><button class="mini-btn" data-edit="${kind}:${id}">Edit</button><button class="mini-btn" data-delete="${kind}:${id}">Delete</button></div>`;}
  function transactionTable(rows,withActions=false){
    if(!rows.length)return empty('Nothing to show here yet.');
    return `<table class="data-table"><thead><tr><th>Transaction</th><th>Type</th><th>Category</th><th>Date</th><th>Amount</th>${withActions?'<th>Actions</th>':''}</tr></thead><tbody>${rows.map(x=>`<tr><td><b>${escapeHTML(x.title)}</b></td><td><span class="type-pill type-${x.type.toLowerCase()}">${escapeHTML(x.type)}</span></td><td>${escapeHTML(x.category||'—')}</td><td>${fmtDate(x.date)}</td><td class="amount ${x.amount>=0?'positive':'negative'}">${x.amount>=0?'+':'−'}${money(Math.abs(x.amount))}</td>${withActions?`<td>${x.source==='income'||x.source==='expense'?actionButtons(x.source,x.sourceId):x.source==='lend'||x.source==='borrow'?actionButtons(x.source,x.sourceId):'—'}</td>`:''}</tr>`).join('')}</tbody></table>`;
  }
  function render(){
    const t=totals();
    $('#totalIncome').textContent=money(t.income);$('#totalExpense').textContent=money(t.expense);$('#balance').textContent=money(t.balance);$('#toReceive').textContent=money(t.receivable);$('#toPay').textContent=money(t.payable);
    const events=eventList();
    $('#recentTransactions').innerHTML=transactionTable(events.slice(0,6));
    $('#incomeTable').innerHTML=transactionTable(events.filter(x=>x.source==='income').map(x=>({...x,type:'Income',amount:Math.abs(x.amount)})),true);
    $('#expenseTable').innerHTML=transactionTable(events.filter(x=>x.source==='expense').map(x=>({...x,type:'Expense',amount:-Math.abs(x.amount)})),true);
    renderCategories('#categoryBreakdown',data.expense);
    $('#receivablesTable').innerHTML=duesTable(data.lends,'lend');
    $('#payablesTable').innerHTML=duesTable(data.borrows,'borrow');
    renderTransactions();
    renderUpcoming();
    renderReports();
  }
  function duesTable(arr,kind){
    if(!arr.length)return empty('No records added yet.');
    return `<table class="data-table"><thead><tr><th>Person</th><th>Original</th><th>Settled</th><th>Remaining</th><th>Expected date</th><th>Status</th><th>Actions</th></tr></thead><tbody>${arr.map(x=>`<tr><td><b>${escapeHTML(x.person)}</b><br><small class="muted">${escapeHTML(x.description||'')}</small></td><td>${money(x.amount)}</td><td>${money(x.settled||0)}</td><td class="amount">${money(remaining(x))}</td><td>${fmtDate(x.expected)}</td><td><span class="status-pill">${remaining(x)===0?'Completed':x.settled>0?'Partially '+(kind==='lend'?'received':'paid'):'Pending'}</span></td><td><div class="row-actions"><button class="mini-btn" data-settle="${kind}:${x.id}">${kind==='lend'?'Receive':'Repay'}</button>${actionButtons(kind,x.id)}</div></td></tr>`).join('')}</tbody></table>`;
  }
  function renderCategories(target,arr){
    const totalsBy={};arr.forEach(x=>totalsBy[x.category||'Other']=(totalsBy[x.category||'Other']||0)+Number(x.amount));
    const entries=Object.entries(totalsBy).sort((a,b)=>b[1]-a[1]), max=entries[0]?.[1]||1;
    $(target).innerHTML=entries.length?entries.map(([name,val])=>`<div class="category-row"><span>${escapeHTML(name)}</span><div class="bar-track"><div class="bar-fill" style="width:${val/max*100}%"></div></div><span class="category-value">${money(val)}</span></div>`).join(''):empty('No expense categories to display.');
  }
  function renderTransactions(){
    const q=$('#transactionSearch').value.toLowerCase(),type=$('#typeFilter').value,month=$('#dateFilter').value,sort=$('#sortFilter').value;
    let rows=eventList().filter(x=>(type==='all'||x.type===type)&&(!month||x.date?.startsWith(month))&&(!q||[x.title,x.category,x.type].join(' ').toLowerCase().includes(q)));
    if(sort==='oldest')rows.reverse();
    $('#transactionsTable').innerHTML=transactionTable(rows,true);
  }
  function renderUpcoming(){
    const items=[];
    data.lends.filter(x=>remaining(x)>0&&x.expected).forEach(x=>items.push({person:x.person,amount:remaining(x),date:x.expected,kind:'Expected to receive'}));
    data.borrows.filter(x=>remaining(x)>0&&x.expected).forEach(x=>items.push({person:x.person,amount:remaining(x),date:x.expected,kind:'Expected to pay'}));
    items.sort((a,b)=>a.date.localeCompare(b.date));
    $('#upcomingList').innerHTML=items.length?items.slice(0,7).map(x=>`<div class="upcoming-item"><div><strong>${escapeHTML(x.person)}</strong><small>${x.kind}</small></div><div class="upcoming-right"><strong>${money(x.amount)}</strong><small class="${x.date<today()?'overdue':''}">${x.date<today()?'Overdue · ':''}${fmtDate(x.date)}</small></div></div>`).join(''):empty('No upcoming dues. You are all caught up.');
  }
  function renderReports(){
    const month=$('#reportMonth').value||monthNow();
    const inc=data.income.filter(x=>x.date.startsWith(month)),exp=data.expense.filter(x=>x.date.startsWith(month));
    const i=sum(inc),e=sum(exp);
    $('#monthlyIncome').textContent=money(i);$('#monthlyExpense').textContent=money(e);$('#monthlySavings').textContent=money(i-e);
    renderCategories('#reportCategories',exp);
    const daily={};inc.forEach(x=>daily[x.date]=(daily[x.date]||{income:0,expense:0}).income+=+x.amount);exp.forEach(x=>daily[x.date]=(daily[x.date]||{income:0,expense:0}).expense+=+x.amount);
    const days=Object.entries(daily).sort((a,b)=>b[0].localeCompare(a[0]));
    $('#dailySummary').innerHTML=days.length?days.map(([d,v])=>`<div class="simple-row"><span>${fmtDate(d)}</span><span><b class="positive">+${money(v.income)}</b> &nbsp; <b class="negative">−${money(v.expense)}</b></span></div>`).join(''):empty('No activity in this month.');
    const months={};[...data.income.map(x=>({...x,kind:'income'})),...data.expense.map(x=>({...x,kind:'expense'}))].forEach(x=>{const m=x.date.slice(0,7);months[m]??={income:0,expense:0};months[m][x.kind]+=+x.amount;});
    const ms=Object.entries(months).sort((a,b)=>b[0].localeCompare(a[0]));
    $('#monthlySummary').innerHTML=ms.length?`<table class="data-table"><thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Net savings</th></tr></thead><tbody>${ms.map(([m,v])=>`<tr><td>${new Date(m+'-01T00:00:00').toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</td><td class="positive">${money(v.income)}</td><td class="negative">${money(v.expense)}</td><td>${money(v.income-v.expense)}</td></tr>`).join('')}</tbody></table>`:empty('No monthly data yet.');
  }
  const field=(name,label,type='text',opts=[],required=true,full=false,placeholder='')=>({name,label,type,opts,required,full,placeholder});
  function formSpec(kind,obj={}){
    const specs={
      income:[field('amount','Amount (₹)','number'),field('from','Received from'),field('category','Income category','select',categories.income),field('date','Date','date',[],true),field('method','Payment method','select',methods),field('description','Description / notes','textarea',[],false,true)],
      expense:[field('amount','Amount (₹)','number'),field('title','Expense title'),field('category','Expense category','select',categories.expense),field('date','Date','date'),field('method','Payment method','select',methods),field('description','Description','textarea',[],false,true)],
      lend:[field('person','Person’s name'),field('amount','Amount given (₹)','number'),field('date','Date given','date'),field('expected','Expected return date','date',[],false),field('description','Description','textarea',[],false,true)],
      borrow:[field('person','Borrowed from'),field('amount','Amount borrowed (₹)','number'),field('date','Date borrowed','date'),field('expected','Expected payment date','date',[],false),field('description','Description','textarea',[],false,true)]
    };
    return specs[kind].map(f=>({...f,value:obj[f.name]??(f.name==='date'?today():f.name==='method'?'UPI':'')}));
  }
  function openForm(kind,obj=null){
    formKind=kind;editing=obj?.id||null;$('#formTitle').textContent=(obj?'Edit ':'Add ')+({income:'income',expense:'expense',lend:'money given',borrow:'borrowed money'}[kind]);$('#formError').textContent='';
    const fields=formSpec(kind,obj||{});
    $('#formFields').innerHTML=fields.map(f=>`<div class="field ${f.full?'full':''}"><label for="f_${f.name}">${f.label}${f.required?' *':''}</label>${f.type==='select'?`<select id="f_${f.name}" name="${f.name}" ${f.required?'required':''}>${f.opts.map(o=>`<option ${f.value===o?'selected':''}>${escapeHTML(o)}</option>`).join('')}</select>`:f.type==='textarea'?`<textarea id="f_${f.name}" name="${f.name}" placeholder="${f.placeholder}" ${f.required?'required':''}>${escapeHTML(f.value)}</textarea>`:`<input id="f_${f.name}" name="${f.name}" type="${f.type}" value="${escapeHTML(f.value)}" ${f.type==='number'?'min="0.01" step="0.01"':''} ${f.required?'required':''} placeholder="${f.placeholder}">`}</div>`).join('');
    $('#recordDialog').showModal();
  }
  function saveForm(ev){
    ev.preventDefault();const fd=new FormData(ev.target),obj=Object.fromEntries(fd.entries()),amount=Number(obj.amount);
    if(!Number.isFinite(amount)||amount<=0){$('#formError').textContent='Enter an amount greater than zero.';return;}
    if(!obj.date){$('#formError').textContent='Please select a date.';return;}
    const arr=data[formKind],old=editing?arr.find(x=>x.id===editing):null;
    if(old&&['lend','borrow'].includes(formKind)&&Number(old.settled||0)>amount){$('#formError').textContent='Amount cannot be lower than the amount already settled.';return;}
    if(old){Object.assign(old,obj,{amount,id:old.id,settled:old.settled||0,lastSettlementDate:old.lastSettlementDate});}
    else arr.push({...obj,amount,id:uid(),...(formKind==='lend'||formKind==='borrow'?{settled:0}:{})});
    $('#recordDialog').close();save();toast(old?'Record updated.':'Record saved.');
  }
  function settle(kind,id){
    const item=data[kind].find(x=>x.id===id);if(!item)return;
    const rem=remaining(item);if(rem<=0){toast('This record is already settled.');return;}
    const label=kind==='lend'?'Amount received now (₹)':'Amount repaid now (₹)';
    const raw=prompt(`${label}\nRemaining: ${money(rem)}`);
    if(raw===null)return;const amt=Number(raw);
    if(!Number.isFinite(amt)||amt<=0||amt>rem){toast('Enter a valid amount up to '+money(rem)+'.');return;}
    item.settled=+(Number(item.settled||0)+amt).toFixed(2);item.lastSettlementDate=today();
    save();toast(kind==='lend'?'Return recorded as money received.':'Repayment recorded as an expense.');
  }
  function remove(kind,id){
    const arr=data[kind],idx=arr.findIndex(x=>x.id===id);if(idx<0)return;
    if(!confirm('Delete this record? Related settlement history for this record will also be removed.'))return;
    arr.splice(idx,1);save();toast('Record deleted.');
  }
  function edit(kind,id){const obj=data[kind].find(x=>x.id===id);if(obj)openForm(kind,obj);}
  function switchView(name){
    $$('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+name));
    $$('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
    const titles={dashboard:'Dashboard',income:'Income',expenses:'Expenses',receivables:'Money to receive',payables:'Money to pay',transactions:'Transaction history',reports:'Reports & analytics',settings:'Data & settings'};
    $('#pageTitle').textContent=titles[name]||'Dashboard';
    if(name==='transactions')renderTransactions();
  }
  $('#mainNav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)switchView(b.dataset.view);});
  document.addEventListener('click',e=>{
    const go=e.target.closest('[data-goto]');if(go)switchView(go.dataset.goto);
    const add=e.target.closest('[data-open-form]');if(add)openForm(add.dataset.openForm);
    const ed=e.target.closest('[data-edit]');if(ed){const [k,id]=ed.dataset.edit.split(':');edit(k,id);}
    const del=e.target.closest('[data-delete]');if(del){const [k,id]=del.dataset.delete.split(':');remove(k,id);}
    const st=e.target.closest('[data-settle]');if(st){const [k,id]=st.dataset.settle.split(':');settle(k,id);}
  });
  $('#quickAddBtn').addEventListener('click',()=>openForm('expense'));
  $('#recordForm').addEventListener('submit',saveForm);
  $('#closeDialog').onclick=$('#cancelForm').onclick=()=>$('#recordDialog').close();
  ['transactionSearch','typeFilter','dateFilter','sortFilter'].forEach(id=>$('#'+id).addEventListener('input',renderTransactions));
  $('#reportMonth').value=monthNow();$('#reportMonth').addEventListener('change',renderReports);
  $('#todayLabel').textContent=new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'}).toUpperCase();
  $('#todayChip').textContent=new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  $('#exportBtn').onclick=()=>{
    const blob=new Blob([JSON.stringify({...data,exportedAt:new Date().toISOString(),version:1},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='my-money-manager-backup-'+today()+'.json';a.click();URL.revokeObjectURL(url);toast('Backup exported.');
  };
  $('#importFile').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      const parsed=JSON.parse(await file.text());
      for(const k of ['income','expense','lends','borrows'])if(!Array.isArray(parsed[k]))throw new Error('Invalid backup format.');
      if(!confirm('Importing will replace all current records. Continue?'))return;
      data={...blank(),income:parsed.income,expense:parsed.expense,lends:parsed.lends,borrows:parsed.borrows,events:[]};
      save();toast('Backup imported successfully.');
    }catch(err){alert('Could not import this file: '+err.message);}
    finally{e.target.value='';}
  });
  $('#clearBtn').onclick=()=>{if(confirm('Are you sure? This will permanently clear all My Money Manager records from this browser.')){data=blank();save();toast('All records cleared.');}};
  render();
})();
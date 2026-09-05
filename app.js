(function(){
  'use strict';
  // W430 FIX366 CLEAN | Current formal employee portal bridge configuration.
  const CLIENT_ANY_COOLDOWN_MS=30*1000;
  const CLIENT_SAME_TYPE_COOLDOWN_MS=3*60*1000;
  const LINE_SHARE_COOLDOWN_MS=15*1000;
  const CFG=window.WTS_ATTENDANCE_CONFIG||{};
  const $=id=>document.getElementById(id);
  const state={employee:null,token:sessionStorage.getItem('wts_att_session')||'',type:'',location:null,locationLabel:'',stream:null,facing:'user',photoBlob:null,photoUrl:'',photoTakenAt:'',lineShared:false,lineShareMethod:'',busy:false,cameraStampTimer:null,shareBusy:false,lastShareAttemptAt:0,portal:null,portalBusy:false,portalView:'home',scheduleSelectedDate:'',workPlanDepartment:'',payslip:null,cameraZoomLabel:'1X'};
  const pending=new Map();
  const BRIDGE_CHANNEL='wts-attendance-bridge';
  const BRIDGE_STORAGE_KEY='wts_att_bridge_url_current';
  function normalizeBridgeUrl(raw){
    const v=String(raw||'').trim();
    if(!v)return '';
    if(/^https:\/\/[^/]*(?:github\.io|github\.com)(?:\/|$)/i.test(v))throw new Error('目前貼的是 GitHub Pages / GitHub 網址；橋接網址請改填 Google Apps Script Web App 的 /exec 網址。');
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec\/?$/i.test(v))throw new Error('請貼 Google Apps Script 正式部署後、以 /exec 結尾的完整網址。');
    return v.replace(/\/$/,'');
  }
  function bridgeFromQuery(){
    try{const u=new URL(location.href),q=u.searchParams.get('bridge')||u.searchParams.get('bridgeUrl')||'';if(!q)return '';const n=normalizeBridgeUrl(q);localStorage.setItem(BRIDGE_STORAGE_KEY,n);u.searchParams.delete('bridge');u.searchParams.delete('bridgeUrl');history.replaceState(null,'',u.pathname+(u.search||'')+u.hash);return n;}catch(_e){return '';}
  }
  function purgeRetiredBridgeStorage(){
    try{for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i)||'';if(key.startsWith('wts_att_bridge_url_')&&key!==BRIDGE_STORAGE_KEY)localStorage.removeItem(key);}}catch(_e){}
  }
  purgeRetiredBridgeStorage();
  let bridgeUrl='';
  // The checked-in config.js is authoritative on every reload. Device-local values cannot override it.
  try{bridgeUrl=normalizeBridgeUrl(CFG.bridgeUrl||'');}catch(_e){bridgeUrl='';}
  if(!bridgeUrl){
    const queryBridge=bridgeFromQuery();
    if(queryBridge)bridgeUrl=queryBridge;
  }
  if(!bridgeUrl){try{bridgeUrl=normalizeBridgeUrl(localStorage.getItem(BRIDGE_STORAGE_KEY)||'');}catch(_e){localStorage.removeItem(BRIDGE_STORAGE_KEY);bridgeUrl='';}}
  if(CFG.bridgeUrl){try{localStorage.removeItem(BRIDGE_STORAGE_KEY);}catch(_e){}}
  function bridgeConfigIssue(){
    if(!bridgeUrl)return '尚未設定 Apps Script Web App 網址。請點「橋接設定」，直接貼上正式 /exec 網址。';
    return '';
  }
  const bridgeReady=()=>!bridgeConfigIssue();
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function twParts(date=new Date()){
    const dp=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const tp=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date);
    const o={};dp.forEach(x=>o[x.type]=x.value);return{date:`${o.year}-${o.month}-${o.day}`,time:tp,dateTime:`${o.year}-${o.month}-${o.day} ${tp}`};
  }
  function tick(){const p=twParts();$('todayText').textContent=p.date+'｜台灣時間';$('clockText').textContent=p.time;}
  tick();setInterval(tick,1000);
  function status(el,msg,kind=''){el.textContent=msg||'';el.className='status'+(kind?' '+kind:'');}
  function setStep(key,mode){document.querySelectorAll('.step').forEach(x=>{if(x.dataset.step===key){x.classList.remove('active','done');if(mode)x.classList.add(mode);}});}
  function completeBefore(key){const order=['gps','photo','line','submit'];const i=order.indexOf(key);order.forEach((k,n)=>setStep(k,n<i?'done':n===i?'active':''));}
  function randomId(){return 'REQ-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);}
  function postBridge(action,data={},timeoutMs=20000){
    if(!bridgeReady())return Promise.reject(new Error(bridgeConfigIssue()));
    const requestId=randomId();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('雲端橋接逾時：Apps Script 沒有回傳結果。請確認目前正式版 Code.gs 已部署為新版本；重送同一筆不會重複記錄。'));},timeoutMs);
      pending.set(requestId,{resolve,reject,timer});
      const form=document.createElement('form');form.method='POST';form.action=bridgeUrl;form.target='bridgeFrame';form.style.display='none';
      const payload=Object.assign({},data,{action,requestId});
      Object.entries(payload).forEach(([k,v])=>{const input=document.createElement('input');input.type='hidden';input.name=k;input.value=v==null?'':(typeof v==='object'?JSON.stringify(v):String(v));form.appendChild(input);});
      document.body.appendChild(form);form.submit();setTimeout(()=>form.remove(),500);
    });
  }
  window.addEventListener('message',ev=>{
    const d=ev.data;if(!d||d.channel!==BRIDGE_CHANNEL||!d.requestId)return;
    const p=pending.get(d.requestId);if(!p)return;clearTimeout(p.timer);pending.delete(d.requestId);d.ok?p.resolve(d):p.reject(new Error(d.message||'雲端橋接失敗'));
  });
  function restoreEmployee(){
    try{const e=JSON.parse(sessionStorage.getItem('wts_att_employee')||'null');if(e&&state.token){state.employee=e;showPunch();}}
    catch(_e){}
    const remembered=localStorage.getItem('wts_att_employee_id')||'';$('employeeId').value=remembered;
  }
  function showPunch(){
    $('loginPanel').hidden=true;$('punchPanel').hidden=false;
    $('employeeName').textContent=state.employee?.name||state.employee?.employeeName||state.employee?.id||'員工';
    $('employeeMeta').textContent=`員工編號 ${state.employee?.id||state.employee?.employeeId||'—'}${state.employee?.department?'｜'+state.employee.department:''}`;
    renderToday();switchPortalView('home');loadPortalData();
  }
  async function login(){
    if(state.busy)return;const id=$('employeeId').value.trim();const pin=$('employeePin').value.trim();
    if(!id||!pin){status($('loginStatus'),'請輸入員工編號與打卡 PIN。','error');return;}
    state.busy=true;$('loginBtn').disabled=true;status($('loginStatus'),'正在驗證員工身分…');
    try{const d=await postBridge('login',{employeeId:id,pin});state.token=d.sessionToken;state.employee=d.employee;sessionStorage.setItem('wts_att_session',state.token);sessionStorage.setItem('wts_att_employee',JSON.stringify(state.employee));localStorage.setItem('wts_att_employee_id',String(d.employee?.id||id));$('employeeId').value=String(d.employee?.id||id);$('employeePin').value='';showPunch();}
    catch(e){status($('loginStatus'),e.message,'error');}
    finally{state.busy=false;$('loginBtn').disabled=false;}
  }
  function logout(){cancelFlow();state.token='';state.employee=null;state.portal=null;sessionStorage.removeItem('wts_att_session');sessionStorage.removeItem('wts_att_employee');$('punchPanel').hidden=true;$('loginPanel').hidden=false;status($('loginStatus'),'已登出。','ok');}
  function switchPortalView(view){
    const map={home:'portalHomeView',punch:'portalPunchView',attendance:'portalAttendanceView',schedule:'portalScheduleView',workplan:'portalWorkPlanView',tasks:'portalTasksView',requests:'portalRequestsView',payroll:'portalPayrollView',profile:'portalProfileView'};
    const v=map[view]?view:'home';state.portalView=v;
    Object.entries(map).forEach(([k,id])=>{const el=$(id);if(el)el.hidden=k!==v;});
    document.querySelectorAll('[data-portal-nav]').forEach(b=>b.classList.toggle('active',b.dataset.portalNav===v));
    if(v==='punch')updatePunchActionState();
    if(v==='requests')renderRequestForms();
    if(v==='schedule')renderSchedule();
    if(v==='workplan')renderWorkPlan();
    if(v==='tasks')renderTasks();
    if(v==='payroll')renderPayrollAvailability();
    else{state.payslip=null;if($('payrollPin'))$('payrollPin').value='';if($('payslipPanel'))$('payslipPanel').hidden=true;}
    scrollTo({top:0,behavior:'smooth'});
  }
  function portalDate(){return twParts().date;}
  function punchTimeMinutes(v){
    const m=/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(v||''));
    if(!m)return null;const h=Number(m[1]),n=Number(m[2]),sec=Number(m[3]||0);if(h<0||h>23||n<0||n>59||sec<0||sec>59)return null;return h*60+n+sec/60;
  }
  function durationText(minutes){
    const n=Math.max(0,Math.round(Number(minutes)||0));const h=Math.floor(n/60),m=n%60;return h?`${h} 小時${m?` ${m} 分`:''}`:`${m} 分`;
  }
  function rowEventsForSegments(row){
    const ev=Array.isArray(row?.events)?row.events.filter(x=>x&&typeof x==='object').slice():[];
    if(!ev.length&&row){
      const d=String(row.date||'');const i=String(row.in||'').trim(),o=String(row.out||'').trim();
      if(i&&i!=='—')ev.push({type:'上班',date:d,time:i,dateTime:`${d}T${i}`});
      if(o&&o!=='—')ev.push({type:'下班',date:d,time:o,dateTime:`${d}T${o}`});
    }
    return ev;
  }
  function attendanceSegments(events){
    const sorted=(Array.isArray(events)?events:[]).filter(x=>x&&['上班','下班'].includes(String(x.type||''))).slice().sort((a,b)=>String(a.dateTime||a.time||'').localeCompare(String(b.dateTime||b.time||'')));
    const segments=[];let open=null;const orphan=[];
    sorted.forEach(ev=>{
      const t=String(ev.type||'');
      if(t==='上班'){
        if(open){orphan.push(ev);return;}
        open={index:segments.length+1,in:ev,out:null,open:true,minutes:0};
      }else if(t==='下班'){
        if(!open){orphan.push(ev);return;}
        const a=punchTimeMinutes(open.in?.time),b=punchTimeMinutes(ev.time);let mins=0;if(a!==null&&b!==null){let end=b;if(end<a)end+=1440;mins=Math.max(0,end-a);}
        open.out=ev;open.open=false;open.minutes=mins;segments.push(open);open=null;
      }
    });
    const all=open?segments.concat([open]):segments.slice();
    return {segments:all,completed:segments.length,openSegment:open,lastEvent:sorted[sorted.length-1]||null,nextType:open?'下班':'上班',totalMinutes:segments.reduce((n,x)=>n+Number(x.minutes||0),0),orphanEvents:orphan};
  }
  function currentEmployeeId(){return String(state.employee?.id||state.employee?.employeeId||'').trim();}
  function localTodayPunchEvents(){
    const d=portalDate(),id=currentEmployeeId(),name=String(state.employee?.name||state.employee?.employeeName||'');
    return localRecords().filter(r=>String(r.date||'')===d&&(r.employeeId?String(r.employeeId)===id:(!name||String(r.employeeName||'')===name))).map(r=>({recordId:r.recordId||'',type:r.type||'',date:r.date||d,time:r.time||'',dateTime:r.dateTime||`${r.date||d}T${r.time||''}`,locationLabel:r.locationLabel||'',source:'本機今日紀錄'}));
  }
  function todayPunchEventsMerged(){
    const d=portalDate(),row=(state.portal?.attendanceRecent||[]).find(x=>String(x.date||'')===d);const all=rowEventsForSegments(row).concat(localTodayPunchEvents());const seen=new Set();
    return all.filter(x=>{const k=String(x.recordId||'')||`${x.type}|${x.dateTime||x.date+'T'+x.time}`;if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>String(a.dateTime||a.time||'').localeCompare(String(b.dateTime||b.time||'')));
  }
  function updatePunchActionState(){
    const info=attendanceSegments(todayPunchEventsMerged()),inBtn=$('punchInBtn'),outBtn=$('punchOutBtn'),card=$('punchStateCard');
    if(!inBtn||!outBtn)return info;
    inBtn.classList.remove('is-next');outBtn.classList.remove('is-next');card?.classList.remove('open','multi');
    if(info.openSegment){
      const n=info.openSegment.index;inBtn.disabled=true;outBtn.disabled=false;outBtn.classList.add('is-next');
      if($('punchOutEyebrow'))$('punchOutEyebrow').textContent=`第 ${n} 段`;if($('punchOutLabel'))$('punchOutLabel').textContent='下班打卡';
      if($('punchInEyebrow'))$('punchInEyebrow').textContent='上班';if($('punchInLabel'))$('punchInLabel').textContent='目前已上班';
      if($('punchStateTitle'))$('punchStateTitle').textContent=`第 ${n} 段工作中｜${info.openSegment.in?.time||''}`;
      if($('punchStateHint'))$('punchStateHint').textContent='目前有尚未結束的工作時段，下一筆應為下班打卡。';card?.classList.add('open');
      if($('todaySegmentBadge'))$('todaySegmentBadge').textContent=`今日 ${n} 段｜進行中`;
    }else{
      inBtn.disabled=false;outBtn.disabled=true;inBtn.classList.add('is-next');
      const next=info.completed+1;if($('punchOutEyebrow'))$('punchOutEyebrow').textContent='下班';if($('punchOutLabel'))$('punchOutLabel').textContent='尚未上班';
      if(info.completed===0){
        if($('punchInEyebrow'))$('punchInEyebrow').textContent='上班';if($('punchInLabel'))$('punchInLabel').textContent='上班打卡';
        if($('punchStateTitle'))$('punchStateTitle').textContent='今天尚未上班';if($('punchStateHint'))$('punchStateHint').textContent='正常情況一天一段，請先按「上班打卡」。';
        if($('todaySegmentBadge'))$('todaySegmentBadge').textContent='今日 0 段';
      }else{
        if($('punchInEyebrow'))$('punchInEyebrow').textContent=`第 ${next} 段｜特殊`;if($('punchInLabel'))$('punchInLabel').textContent='再次上班（特殊）';
        if($('punchStateTitle'))$('punchStateTitle').textContent=info.completed===1?'今天正常第 1 段已完成':`今天已完成 ${info.completed} 段`;
        if($('punchStateHint'))$('punchStateHint').textContent=`正常情況今天已可結束；只有稍後又回場工作時，才按「再次上班」建立第 ${next} 段。`;card?.classList.add('multi');
        if($('todaySegmentBadge'))$('todaySegmentBadge').textContent=`今日 ${info.completed} 段｜已完成`;
      }
    }
    return info;
  }
  function fmtNum(v,d=1){const n=Number(v);return Number.isFinite(n)?n.toFixed(d).replace(/\.0$/,''):'—';}
  function statusClass(v){const s=String(v||'');return /核准|成立|已排定|完成/.test(s)?'status-approved':/退回|駁回|失敗|取消/.test(s)?'status-rejected':'status-pending';}
  function requestKindName(k,p={}){return k==='preleave'?(p.preScheduleType||p.requestType||'預排休假'):k==='leave'?(p.leaveName||p.leaveTypeCode||'請假'):k==='roster_change'?'休假日期調整':k==='punch_correction'?'補卡申請':k==='overtime'?'加班申請':k==='work_completion'?'工作完成回報':k||'申請';}
  async function loadPortalData(){
    if(!state.token||state.portalBusy)return;state.portalBusy=true;
    if($('portalStatusBadge'))$('portalStatusBadge').textContent='同步中';
    try{
      const d=await postBridge('portalData',{sessionToken:state.token},15000);state.portal=d.portal||{};renderPortalData();
      if($('portalStatusBadge'))$('portalStatusBadge').textContent='已同步';
      if($('portalSyncText'))$('portalSyncText').textContent=`資料時間 ${state.portal.updatedAt||d.serverNow||'—'}｜若主管剛修改資料，請等主系統下一次同步。`;
    }catch(e){
      if($('portalStatusBadge'))$('portalStatusBadge').textContent='待同步';
      if($('portalSyncText'))$('portalSyncText').textContent='員工自助資料尚未同步完成：'+(e.message||e);
    }finally{state.portalBusy=false;}
  }
  function renderPortalData(){
    const p=state.portal||{},profile=p.profile||{},leave=p.leave||{},annual=leave.annualLeave||{},summary=p.summary||{};
    const today=portalDate(),todayRow=(p.attendanceRecent||[]).find(x=>String(x.date||'')===today),events=rowEventsForSegments(todayRow),todaySeg=attendanceSegments(events);
    if($('homePunchStatus')){
      if(todaySeg.openSegment)$('homePunchStatus').textContent=`第 ${todaySeg.openSegment.index} 段工作中 ${todaySeg.openSegment.in?.time||''}`;
      else if(todaySeg.completed>1)$('homePunchStatus').textContent=`已完成 ${todaySeg.completed} 段 ${todaySeg.segments[todaySeg.completed-1]?.out?.time||''}`;
      else if(todaySeg.completed===1)$('homePunchStatus').textContent=`已完成 ${todaySeg.segments[0]?.out?.time||''}`;
      else $('homePunchStatus').textContent='尚未上班';
    }
    if($('homePendingRequests'))$('homePendingRequests').textContent=String((p.requests||[]).filter(x=>!(/核准|成立|已排定|退回|駁回|取消|同步失敗/.test(String(x.status||'')))).length)+' 筆';
    if($('homeAnnualLeave'))$('homeAnnualLeave').textContent=annual.remainingDays===null||annual.remainingDays===undefined?'—':fmtNum(annual.remainingDays)+' 日';
    const todaySchedule=(p.schedule?.rows||[]).find(x=>String(x.date||'')===today);
    if($('homeScheduleStatus'))$('homeScheduleStatus').textContent=todaySchedule?(todaySchedule.shiftName||todaySchedule.dayType||todaySchedule.status||'已排班'):'未發布';
    const openTasks=summary.openWorkTasks??(p.workTasks||[]).filter(x=>!x.supervisorConfirmed&&!['submitted','confirmed'].includes(String(x.report?.reportStatus||''))).length;
    if($('homeWorkTasks'))$('homeWorkTasks').textContent=String(openTasks)+' 項';
    const payMonths=p.payroll?.availableMonths||[];if($('homePayslipMonths'))$('homePayslipMonths').textContent=payMonths.length?String(payMonths.length)+' 個月':'尚無';
    if($('homeAttendanceDays'))$('homeAttendanceDays').textContent=String(summary.attendanceDays??(p.attendanceRecent||[]).length)+' 日';
    renderAttendance();renderRequests();renderProfile();renderLeaveOptions();renderSchedule();renderWorkPlan();renderTasks();renderPayrollAvailability();updatePunchActionState();
    const home=(p.requests||[]).slice(0,4);$('homeRequestList').innerHTML=home.length?home.map(requestCard).join(''):'<p class="muted">尚無申請。</p>';
  }
  function renderAttendance(){
    const rows=state.portal?.attendanceRecent||[],el=$('attendanceList');if(!el)return;
    el.innerHTML=rows.length?rows.map(r=>{
      const info=attendanceSegments(rowEventsForSegments(r));
      const segHtml=info.segments.map(seg=>`<div class="attendance-segment ${seg.open?'open':''}"><span class="attendance-segment-no">第 ${seg.index} 段</span><b class="attendance-segment-times">${esc(seg.in?.time||'—')} → ${esc(seg.out?.time||'尚未下班')}</b><span class="attendance-segment-duration">${seg.open?'進行中':durationText(seg.minutes)}</span></div>`).join('');
      const statusText=info.openSegment?`第 ${info.openSegment.index} 段工作中`:(info.completed>1?`已完成 ${info.completed} 段`:(info.completed===1?'已完成':String(r.status||'')));
      const total=info.totalMinutes?`當日已完成工時 ${durationText(info.totalMinutes)}${info.openSegment?'（另有進行中時段）':''}`:'';
      return `<div class="attendance-day"><div class="attendance-day-head"><b>${esc(r.date||'')}</b><span>${esc(statusText)}</span></div><div class="attendance-segments">${segHtml||'<span class="muted">無明細</span>'}</div>${total?`<div class="attendance-day-total">${esc(total)}</div>`:''}</div>`;
    }).join(''):'<p class="muted">目前沒有近期出勤紀錄。</p>';
  }
  function requestCard(r){const p=(r.payload&&typeof r.payload==='object')?r.payload:r;const kind=r.requestKind||p.requestKind||p.kind||'';const dateText=kind==='roster_change'?`${p.fromDate||r.date||''} → ${p.toDate||''}`:(r.date||p.date||p.startDate||'');return `<div class="record ${statusClass(r.status)}"><b>${esc(requestKindName(kind,p))}<span class="request-status-pill">${esc(r.status||p.status||'待處理')}</span></b><span>${esc(dateText)}｜${esc(p.reason||p.note||'未填備註')}${(r.reviewNote||p.reviewNote)?'<br>主管：'+esc(r.reviewNote||p.reviewNote):''}</span></div>`;}
  function renderRequests(){const rows=state.portal?.requests||[];const el=$('requestHistory');if(el)el.innerHTML=rows.length?rows.map(requestCard).join(''):'<p class="muted">尚無申請紀錄。</p>';}
  function renderProfile(){const p=state.portal?.profile||{};const grid=$('profileGrid');if(grid){const fields=[['姓名',p.name],['員工編號',p.employeeId],['部門',p.department],['職務',p.position],['到職日',p.hireDate],['手機',p.mobile],['通訊地址',p.address],['住家電話',p.homePhone],['緊急聯絡人',p.emergencyContact],['緊急聯絡電話',p.emergencyPhone],['家庭狀況',p.familyStatus]];grid.innerHTML=fields.map(x=>`<div class="profile-item"><span>${esc(x[0])}</span><b>${esc(x[1]||'未填')}</b></div>`).join('');}
    const leave=state.portal?.leave||{},balances=leave.balances||{},annual=leave.annualLeave||{},g=$('leaveSummaryGrid');if(g)g.innerHTML=[['特別休假',annual.remainingDays===undefined?'—':fmtNum(annual.remainingDays)+' 日可用'],['事假共用',balances.personal_total?.remainingDays===undefined?'—':fmtNum(balances.personal_total.remainingDays)+' 日'],['普通病假',balances.sick_nonhospital?.usedDays===undefined?'—':fmtNum(balances.sick_nonhospital.usedDays)+' 日已用'],['家庭照顧假',balances.family_care_leave?.remainingDays===undefined?'—':fmtNum(balances.family_care_leave.remainingDays)+' 日可用']].map(x=>`<div class="portal-summary"><small>${esc(x[0])}</small><b>${esc(x[1])}</b><span>主系統試算</span></div>`).join('');}
  function renderLeaveOptions(){const select=$('leaveType');if(!select)return;const rules=state.portal?.leave?.rules||[];const old=select.value;select.innerHTML=rules.length?rules.map(r=>`<option value="${esc(r.code)}">${esc(r.name||r.code)}</option>`).join(''):'<option value="annual_leave">特別休假</option><option value="personal_leave">事假</option><option value="sick_nonhospital">普通病假</option>';if(old&&[...select.options].some(o=>o.value===old))select.value=old;renderLeaveRule();}
  function currentLeaveRule(){return (state.portal?.leave?.rules||[]).find(x=>String(x.code||'')===String($('leaveType')?.value||''))||null;}
  function renderLeaveRule(){const r=currentLeaveRule(),unit=$('leaveUnit'),endWrap=$('leaveEndWrap'),qtyWrap=$('leaveQuantityWrap'),extra=$('leaveExtraFields'),hint=$('leaveBalanceHint');if(!unit)return;const units=(r?.allowedUnits||['day']);const labels=r?.unitLabels||{day:'日',half_day:'半日',hour:'小時',calendar_range:'連續曆日',fixed_calendar_days:'法定連續曆日'};unit.innerHTML=units.map(u=>`<option value="${esc(u)}">${esc(labels[u]||u)}</option>`).join('');unit.value=r?.defaultUnit&&units.includes(r.defaultUnit)?r.defaultUnit:units[0];const b=state.portal?.leave?.balances?.[r?.code]||{};if(hint)hint.textContent=r?`${r.name||''}｜剩餘 ${b.remainingDays===null||b.remainingDays===undefined?'依個案確認':fmtNum(b.remainingDays)+' 日'}｜${r.salaryTreatment||''}`:'假別規則待主系統同步';if(extra){const code=String(r?.code||'');if(r?.relationshipRequired)extra.innerHTML='<label>親屬關係<select id="leaveRelationship"><option>父母</option><option>配偶</option><option>子女</option><option>祖父母</option><option>兄弟姊妹</option><option>其他</option></select></label>';else if(code.startsWith('parental_leave'))extra.innerHTML='<label>子女出生日期<input id="leaveChildBirth" type="date"></label>'+(code==='parental_leave_long'?'<label>育嬰留停期間保險處理<select id="leaveInsuranceChoice"><option value="">請選擇</option><option value="續保（依規定辦理）">續保（依規定辦理）</option><option value="不續保／另行投保（由人事確認）">不續保／另行投保（由人事確認）</option><option value="尚未決定（請人事聯絡確認）">尚未決定（請人事聯絡確認）</option></select></label>':'');else extra.innerHTML='';}toggleLeaveUnit();}
  function toggleLeaveUnit(){const u=$('leaveUnit')?.value||'day';if($('leaveEndWrap'))$('leaveEndWrap').hidden=!['calendar_range'].includes(u);if($('leaveQuantityWrap'))$('leaveQuantityWrap').hidden=['calendar_range','fixed_calendar_days'].includes(u);}
  function renderRequestForms(){const raw=document.querySelector('.request-kind.active')?.dataset.requestKind||'leave';const kind=raw==='punch_correction'?'correction':raw;['leave','preleave','roster_change','correction','overtime'].forEach(k=>{const id=k==='leave'?'leaveRequestForm':k==='preleave'?'preleaveRequestForm':k==='roster_change'?'rosterChangeRequestForm':k==='correction'?'correctionRequestForm':'overtimeRequestForm';if($(id))$(id).hidden=k!==kind;});if(kind==='roster_change')renderRosterChangeOptions();}
  function chooseRequestKind(kind){document.querySelectorAll('.request-kind').forEach(b=>b.classList.toggle('active',b.dataset.requestKind===kind));renderRequestForms();}
  function corrToggle(){const t=$('corrType')?.value||'上班';if($('corrInWrap'))$('corrInWrap').hidden=t==='下班';if($('corrOutWrap'))$('corrOutWrap').hidden=t==='上班';}
  function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));}
  function timeMinutes(v){const m=/^(\d{2}):(\d{2})$/.exec(String(v||''));if(!m)return null;const h=Number(m[1]),n=Number(m[2]);return h>=0&&h<24&&n>=0&&n<60?h*60+n:null;}
  function requestValidationError(payload){
    const kind=String(payload?.requestKind||'');
    if(kind==='preleave'){
      if(!validDate(payload.date))return '請選擇有效的預排休假日期。';
      if(!['預排例假日','預排休息日'].includes(String(payload.preScheduleType||payload.requestType||'')))return '請選擇預排例假日或預排休息日。';
    }
    if(kind==='leave'){
      if(!validDate(payload.startDate||payload.date))return '請選擇有效的請假開始日期。';
      if(payload.unit==='calendar_range'){
        if(!validDate(payload.endDate))return '連續請假請選擇有效的結束日期。';
        if(String(payload.endDate)<String(payload.startDate))return '請假結束日期不可早於開始日期。';
      }else if(payload.unit!=='fixed_calendar_days'){
        const q=Number(payload.quantity);if(!Number.isFinite(q)||q<=0||q>365)return '請假數量必須大於 0，且不可超過 365。';
      }
      if(!String(payload.leaveTypeCode||'').trim())return '請選擇假別。';
      if(['parental_leave_daily','parental_leave_long'].includes(String(payload.leaveTypeCode))&&!validDate(payload.childBirthDate))return '育嬰留職停薪請填寫子女出生日期。';
      if(String(payload.leaveTypeCode)==='parental_leave_long'&&!String(payload.insuranceChoice||'').trim())return '長期育嬰留職停薪請選擇保險處理方式。';
    }
    if(kind==='roster_change'){
      if(!validDate(payload.fromDate||payload.date)||!validDate(payload.toDate))return '請選擇有效的原休假日與希望調整日期。';
      if(String(payload.fromDate||payload.date)===String(payload.toDate))return '原休假日與希望調整日期不可相同。';
      if(String(payload.fromDate||payload.date).slice(0,7)!==String(payload.toDate).slice(0,7))return '目前僅支援同一月份內調整休假日期。';
      if(!String(payload.reason||'').trim())return '請填寫調整休假日期的原因。';
    }
    if(kind==='punch_correction'){
      if(!validDate(payload.date))return '請選擇有效的補卡日期。';
      const t=String(payload.missingPunchType||'');if(!['上班','下班','上下班'].includes(t))return '請選擇補卡類型。';
      const i=timeMinutes(payload.requestedInTime),o=timeMinutes(payload.requestedOutTime);
      if(t!=='下班'&&i===null)return '請輸入有效的上班補卡時間。';
      if(t!=='上班'&&o===null)return '請輸入有效的下班補卡時間。';
      if(t==='上下班'&&o<=i)return '上下班補卡時，下班時間必須晚於上班時間。';
      if(!String(payload.reason||'').trim())return '補卡請填寫原因。';
    }
    if(kind==='overtime'){
      if(!validDate(payload.date))return '請選擇有效的加班日期。';
      const s=timeMinutes(payload.startTime),e=timeMinutes(payload.endTime);if(s===null||e===null)return '請輸入有效的加班開始與結束時間。';
      let mins=e-s;if(mins<=0)mins+=24*60;const hours=mins/60;if(hours<=0||hours>12)return '單次加班時數必須大於 0 且不可超過 12 小時（可跨午夜）。';
      if(!String(payload.reason||'').trim())return '請填寫加班原因。';
    }
    if(kind==='work_completion'){
      if(!String(payload.completionRecordId||payload.workInstanceId||'').trim())return '工作任務識別資料遺失，請重新整理後再回報。';
      if(!['completed','partial','not_completed'].includes(String(payload.completionStatus||'')))return '請選擇有效的完成狀態。';
      const pct=Number(payload.completedPercent);if(!Number.isFinite(pct)||pct<0||pct>100)return '完成比例必須介於 0～100%。';
      const h=Number(payload.actualTaskHours);if(!Number.isFinite(h)||h<0||h>24)return '實際工時必須介於 0～24 小時。';
      if(['partial','not_completed'].includes(String(payload.completionStatus||''))&&!String(payload.issueReason||'').trim())return '部分完成或未完成時，請填寫原因。';
    }
    return '';
  }
  async function submitPortalRequest(payload){const err=requestValidationError(payload);if(err){status($('requestStatus'),err,'error');return;}if(state.busy)return;state.busy=true;status($('requestStatus'),'正在送出申請…');try{const d=await postBridge('portalRequest',{sessionToken:state.token,payloadJson:JSON.stringify(payload)},15000);status($('requestStatus'),d.message||'申請已送出','ok');await loadPortalData();}catch(e){status($('requestStatus'),e.message||String(e),'error');}finally{state.busy=false;}}
  function submitLeave(){const r=currentLeaveRule(),u=$('leaveUnit')?.value||r?.defaultUnit||'day';const payload={requestKind:'leave',leaveTypeCode:$('leaveType')?.value||'annual_leave',leaveName:r?.name||$('leaveType')?.selectedOptions?.[0]?.textContent||'請假',date:$('leaveStartDate').value,startDate:$('leaveStartDate').value,endDate:$('leaveEndDate').value,unit:u,quantity:$('leaveQuantity').value,reason:$('leaveReason').value,documentStatus:$('leaveDocumentStatus').value};const rel=$('leaveRelationship');if(rel)payload.relationship=rel.value;const cb=$('leaveChildBirth');if(cb)payload.childBirthDate=cb.value;const ins=$('leaveInsuranceChoice');if(ins)payload.insuranceChoice=ins.value;if(u==='fixed_calendar_days')delete payload.quantity;if(u!=='calendar_range')delete payload.endDate;submitPortalRequest(payload);}
  function submitPreleave(){submitPortalRequest({requestKind:'preleave',date:$('preleaveDate').value,requestType:$('preleaveType').value,preScheduleType:$('preleaveType').value,reason:$('preleaveReason').value});}
  function submitRosterChange(){const from=$('rosterChangeFrom')?.value||'',to=$('rosterChangeTo')?.value||'',rows=state.portal?.schedule?.rows||[],src=rows.find(x=>String(x.date||'')===from)||{};submitPortalRequest({requestKind:'roster_change',date:from,fromDate:from,toDate:to,originalDayType:String(src.dayType||src.shiftName||''),reason:$('rosterChangeReason')?.value||''});}
  function submitCorrection(){const t=$('corrType').value;submitPortalRequest({requestKind:'punch_correction',date:$('corrDate').value,missingPunchType:t,requestedInTime:t==='下班'?'':$('corrIn').value,requestedOutTime:t==='上班'?'':$('corrOut').value,reason:$('corrReason').value});}
  function submitOvertime(){submitPortalRequest({requestKind:'overtime',date:$('otDate').value,startTime:$('otStart').value,endTime:$('otEnd').value,reason:$('otReason').value});}
  function initPortalForms(){const d=portalDate();['leaveStartDate','leaveEndDate','preleaveDate','corrDate','otDate'].forEach(id=>{if($(id)&&!$(id).value)$(id).value=d;});corrToggle();renderRosterChangeOptions();}

  function rosterRowType(row){return String(row?.dayType||row?.status||row?.shiftName||'');}
  function rosterRowIsRest(row){const t=rosterRowType(row);return /例假|休息日|輪休/.test(t)&&!/特別休假|特休|請假/.test(t);}
  function rosterRowIsWork(row){const t=rosterRowType(row);return !!row&&!/例假|休息日|輪休|特別休假|特休|請假|休假|停班/.test(t);}
  function workPlanCountOn(date){return workPlanRows().filter(x=>String(x.date||'')===String(date||'')).length;}
  function renderRosterChangeOptions(preselect){const from=$('rosterChangeFrom'),to=$('rosterChangeTo'),hint=$('rosterChangeHint');if(!from||!to)return;const month=$('scheduleMonth')?.value||portalDate().slice(0,7),today=portalDate(),rows=(state.portal?.schedule?.rows||[]).filter(x=>String(x.date||'').slice(0,7)===month&&String(x.date||'')>=today);const rests=rows.filter(rosterRowIsRest),works=rows.filter(rosterRowIsWork),oldFrom=preselect||from.value,oldTo=to.value;from.innerHTML=rests.length?rests.map(r=>`<option value="${esc(r.date)}">${esc(r.date)}｜${esc(rosterRowType(r))}</option>`).join(''):'<option value="">本月沒有可調整的未來休假日</option>';if(oldFrom&&rests.some(r=>String(r.date)===String(oldFrom)))from.value=oldFrom;to.innerHTML=works.length?works.map(r=>`<option value="${esc(r.date)}">${esc(r.date)}｜${esc(rosterRowType(r)||'工作日')}${workPlanCountOn(r.date)?`｜重大工作 ${workPlanCountOn(r.date)} 項`:''}</option>`).join(''):'<option value="">本月沒有可改休的未來工作日</option>';if(oldTo&&works.some(r=>String(r.date)===String(oldTo)))to.value=oldTo;if(hint)hint.textContent=rests.length&&works.length?'只提出調整申請；主管核准前正式班表不會變更。目標日若有重大工作，請先查看「工作項目表」再選擇。':'請先確認主系統已正式發布本月班表，且月份內仍有未來的休假日與工作日。';}
  window.selectRosterChangeFrom=function(date){renderRosterChangeOptions(date);const box=$('rosterChangeBox');if(box)box.scrollIntoView({behavior:'smooth',block:'center'});}
  function monthShift(value,delta){
    const m=/^(\d{4})-(\d{2})$/.exec(String(value||''));const base=m?new Date(Number(m[1]),Number(m[2])-1,1):new Date();base.setMonth(base.getMonth()+delta);return `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}`;
  }
  function scheduleDayLabel(row){if(!row)return '';return String(row.shiftName||row.dayType||row.status||'已排班');}
  function renderSchedule(){
    const input=$('scheduleMonth'),cal=$('scheduleCalendar'),detail=$('scheduleDayDetail');if(!input||!cal)return;
    const today=portalDate();if(!input.value)input.value=today.slice(0,7);const month=input.value;
    const rows=(state.portal?.schedule?.rows||[]).filter(x=>String(x.date||'').slice(0,7)===month);const byDate=new Map(rows.map(x=>[String(x.date||''),x]));
    const [y,m]=month.split('-').map(Number);if(!y||!m)return;const first=new Date(y,m-1,1),days=new Date(y,m,0).getDate(),cells=[];
    for(let i=0;i<first.getDay();i++)cells.push('<div class="schedule-day empty" aria-hidden="true"></div>');
    for(let d=1;d<=days;d++){const ds=`${month}-${String(d).padStart(2,'0')}`,row=byDate.get(ds),type=String(row?.dayType||'').toLowerCase(),cls=/leave|請假/.test(type+String(row?.status||''))?'leave':/rest|例假|休息/.test(type+String(row?.status||''))?'rest':row?'work':'none';const selected=state.scheduleSelectedDate===ds?' selected':'';cells.push(`<button class="schedule-day ${cls}${selected}" type="button" data-schedule-date="${ds}"><b>${d}</b><span>${esc(scheduleDayLabel(row)||'—')}</span></button>`);}
    cal.innerHTML=cells.join('');cal.querySelectorAll('[data-schedule-date]').forEach(b=>b.addEventListener('click',()=>{state.scheduleSelectedDate=b.dataset.scheduleDate;renderSchedule();}));
    let selected=state.scheduleSelectedDate&&state.scheduleSelectedDate.slice(0,7)===month?state.scheduleSelectedDate:'';if(!selected){selected=byDate.has(today)?today:(rows[0]?.date||'');state.scheduleSelectedDate=selected;}
    const row=byDate.get(selected);if(detail){if(!selected)detail.innerHTML='<p class="muted">這個月份沒有主系統發布的個人班表。</p>';else if(!row)detail.innerHTML=`<b>${esc(selected)}</b><p class="muted">當日主系統沒有發布個人班表。</p>`;else{const start=row.startTime||row.start||'',end=row.endTime||row.end||'';detail.innerHTML=`<b>${esc(selected)}｜${esc(scheduleDayLabel(row))}</b><div class="schedule-detail-grid"><span>班別<strong>${esc(row.shiftName||row.shiftId||'—')}</strong></span><span>時間<strong>${esc(start||'—')} ～ ${esc(end||'—')}</strong></span><span>休息<strong>${row.breakMins===undefined?'—':esc(row.breakMins)+' 分'}</strong></span><span>狀態<strong>${esc(row.status||row.calendarWriteStatus||'已發布')}</strong></span></div>${row.note?`<p>${esc(row.note)}</p>`:''}${rosterRowIsRest(row)&&selected>=portalDate()?`<button class="ghost schedule-adjust-shortcut" type="button" onclick="selectRosterChangeFrom('${esc(selected)}')">申請調整這個休假日</button>`:''}`;}}renderRosterChangeOptions();
  }
  function workPlanOwnDepartment(){return String(state.portal?.profile?.department||state.employee?.department||'').trim();}
  function workPlanRows(){const rows=Array.isArray(state.portal?.departmentWorkPlan?.rows)?state.portal.departmentWorkPlan.rows:[];return rows.map(r=>({date:r.date??r.d??'',department:r.department??r.p??'',departmentName:r.departmentName??r.n??'',title:r.title??r.t??'',batchCode:r.batchCode??r.b??'',category:r.category??r.c??'',importance:r.importance??r.i??'major',loadLabel:r.loadLabel??r.l??''}));}
  function workPlanAvailableMonths(){const p=state.portal?.departmentWorkPlan||{},fromSummary=Array.isArray(p.months)?p.months.map(x=>String(x.month||'').slice(0,7)).filter(Boolean):[];const fromRows=workPlanRows().map(x=>String(x.date||'').slice(0,7)).filter(Boolean);return [...new Set(fromSummary.concat(fromRows))].sort();}
  function workPlanImportanceLabel(row){return String(row?.importance||'')==='critical'?'重大':'重點';}
  function workPlanImportanceClass(row){return String(row?.importance||'')==='critical'?'critical':'major';}
  function renderWorkPlan(){
    const monthInput=$('workPlanMonth'),tabs=$('workPlanTabs'),list=$('workPlanList'),sum=$('workPlanSummary'),note=$('workPlanNote');if(!monthInput||!tabs||!list)return;
    const today=portalDate(),months=workPlanAvailableMonths();if(!monthInput.value)monthInput.value=months.includes(today.slice(0,7))?today.slice(0,7):(months[0]||today.slice(0,7));const month=monthInput.value;
    const all=workPlanRows().filter(x=>String(x.date||'').slice(0,7)===month);const plan=state.portal?.departmentWorkPlan||{};const depMap=new Map();(plan.departments||[]).forEach(d=>{if(d&&d.id)depMap.set(String(d.id),{id:String(d.id),name:String(d.name||d.id),icon:String(d.icon||'')});});all.forEach(r=>{const id=String(r.department||'');if(id&&!depMap.has(id))depMap.set(id,{id,name:String(r.departmentName||id),icon:''});});
    const own=workPlanOwnDepartment();if(!state.workPlanDepartment){const ownDep=[...depMap.values()].find(d=>d.name===own||own.includes(d.name)||d.name.includes(own));state.workPlanDepartment=ownDep?.id||'all';}
    if(state.workPlanDepartment!=='all'&&!depMap.has(state.workPlanDepartment))state.workPlanDepartment='all';
    const deps=[{id:'all',name:'總覽',icon:'◎'},...[...depMap.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'))];tabs.innerHTML=deps.map(d=>`<button type="button" class="work-plan-tab ${state.workPlanDepartment===d.id?'active':''}" data-work-plan-dept="${esc(d.id)}">${esc(d.icon||'')} ${esc(d.name)}</button>`).join('');tabs.querySelectorAll('[data-work-plan-dept]').forEach(b=>b.addEventListener('click',()=>{state.workPlanDepartment=b.dataset.workPlanDept||'all';renderWorkPlan();}));
    const rows=(state.workPlanDepartment==='all'?all:all.filter(x=>String(x.department||'')===state.workPlanDepartment)).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.departmentName||'').localeCompare(String(b.departmentName||''),'zh-Hant'));
    const critical=rows.filter(x=>String(x.importance||'')==='critical').length,ownCount=all.filter(x=>String(x.departmentName||'')===own).length;
    if(sum)sum.innerHTML=`<div><small>${esc(month)} 重大工作</small><b>${rows.length} 項</b></div><div><small>其中重大</small><b>${critical} 項</b></div><div><small>我的部門</small><b>${ownCount} 項</b></div>`;
    if(note)note.textContent=plan.planningReady===false?'批次月曆尚未建立可用批次工作事項；請主管先在主系統設定正式批次或第一批日期。':`${plan.note||'資料由主系統批次月曆同步。'}｜資料時間 ${plan.generatedAt||state.portal?.updatedAt||'—'}`;
    if(!rows.length){list.innerHTML=`<p class="muted">${esc(month)} ${state.workPlanDepartment==='all'?'目前沒有批次月曆重大工作事項。':'這個部門目前沒有重大工作事項。'}</p>`;return;}
    const grouped=new Map();rows.forEach(r=>{const d=String(r.date||'');if(!grouped.has(d))grouped.set(d,[]);grouped.get(d).push(r);});
    list.innerHTML=[...grouped.entries()].map(([date,items])=>{const isToday=date===today,isPast=date<today;return `<section class="work-plan-day ${isToday?'today':''} ${isPast?'past':''}"><div class="work-plan-day-head"><div><small>${isToday?'今天｜':''}${esc(date)}</small><b>${items.length} 項重大工作</b></div>${isToday?'<span class="work-plan-today-badge">TODAY</span>':''}</div><div class="work-plan-items">${items.map(r=>`<article class="work-plan-item ${workPlanImportanceClass(r)} ${String(r.departmentName||'')===own?'own-department':''}"><div class="work-plan-item-head"><span>${esc(r.departmentName||r.department||'未分類')}</span><b>${esc(workPlanImportanceLabel(r))}</b></div><h3>${esc(r.title||'重大工作')}</h3><div class="work-plan-meta">${r.batchCode?`<span>批次 ${esc(r.batchCode)}</span>`:''}${r.category?`<span>${esc(r.category)}</span>`:''}${r.loadLabel?`<span>${esc(r.loadLabel)}</span>`:''}</div></article>`).join('')}</div></section>`}).join('');
  }

  function taskReportState(t){const r=t.report||{};return t.supervisorConfirmed?'confirmed':(['submitted','confirmed'].includes(String(r.reportStatus||''))?'submitted':'open');}
  function taskOutcomeLabel(v){return v==='completed'?'已完成':v==='partial'?'部分完成':v==='not_completed'?'未完成':'尚未回報';}
  function renderTasks(){
    const el=$('workTaskList');if(!el)return;const filter=$('taskFilter')?.value||'open';let rows=[...(state.portal?.workTasks||[])];rows.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(a.plannedStartTime||'').localeCompare(String(b.plannedStartTime||'')));
    if(filter==='open')rows=rows.filter(x=>taskReportState(x)==='open');else if(filter==='submitted')rows=rows.filter(x=>taskReportState(x)==='submitted');else if(filter==='confirmed')rows=rows.filter(x=>taskReportState(x)==='confirmed');
    if(!rows.length){el.innerHTML='<p class="muted">目前沒有符合條件的工作任務。</p>';return;}
    el.innerHTML=rows.map((t,i)=>{const r=t.report||{},st=taskReportState(t),disabled=st==='confirmed'?'disabled':'',key=esc(t.completionRecordId||t.workInstanceId||String(i));return `<article class="work-task-card ${st}" data-task-key="${key}"><div class="work-task-head"><div><small>${esc(t.date||'')}｜${esc(t.departmentName||t.department||'')}</small><h3>${esc(t.title||'工作任務')}</h3></div><span class="task-state">${st==='confirmed'?'主管已確認':st==='submitted'?'已回報待主管':'待回報'}</span></div><div class="task-meta"><span>預定 ${esc(t.plannedStartTime||'—')}～${esc(t.plannedEndTime||'—')}</span><span>預估 ${fmtNum(t.plannedHours??t.systemEstimatedHours)} 小時</span>${t.batchCode?`<span>批次 ${esc(t.batchCode)}</span>`:''}</div><div class="task-report-form"><label>完成狀態<select data-task-field="completionStatus" ${disabled}><option value="completed" ${r.completionStatus==='completed'?'selected':''}>已完成</option><option value="partial" ${r.completionStatus==='partial'?'selected':''}>部分完成</option><option value="not_completed" ${r.completionStatus==='not_completed'?'selected':''}>未完成</option></select></label><label>完成比例 %<input data-task-field="completedPercent" type="number" min="0" max="100" step="5" value="${esc(r.completedPercent??(r.completionStatus==='completed'?100:''))}" ${disabled}></label><div class="task-time-grid"><label>實際開始<input data-task-field="actualStartTime" type="time" value="${esc(r.actualStartTime||t.plannedStartTime||'')}" ${disabled}></label><label>實際結束<input data-task-field="actualEndTime" type="time" value="${esc(r.actualEndTime||t.plannedEndTime||'')}" ${disabled}></label><label>實際工時<input data-task-field="actualTaskHours" type="number" min="0" max="24" step="0.25" value="${esc(r.actualTaskHours??'')}" ${disabled}></label></div><label>未完成／部分完成原因<input data-task-field="issueReason" value="${esc(r.issueReason||'')}" placeholder="完成則可留空" ${disabled}></label><label>工作備註<textarea data-task-field="note" rows="2" ${disabled}>${esc(r.note||'')}</textarea></label>${st==='confirmed'?`<div class="task-confirmed-note">主管已確認：${esc(taskOutcomeLabel(r.completionStatus))}｜實際 ${fmtNum(r.actualTaskHours)} 小時</div>`:`<button class="primary task-submit" type="button" data-task-submit="${key}">${st==='submitted'?'更新回報':'送出完成回報'}</button>`}</div></article>`}).join('');
    el.querySelectorAll('[data-task-submit]').forEach(b=>b.addEventListener('click',()=>submitWorkTask(b.closest('[data-task-key]'))));
  }
  async function submitWorkTask(card){
    if(!card||state.busy)return;const key=card.dataset.taskKey,t=(state.portal?.workTasks||[]).find(x=>String(x.completionRecordId||x.workInstanceId||'')===key);if(!t){status($('taskStatus'),'找不到工作任務資料，請重新整理。','error');return;}
    const val=name=>card.querySelector(`[data-task-field="${name}"]`)?.value||'';const completionStatus=val('completionStatus'),percent=val('completedPercent');
    const payload={requestKind:'work_completion',date:t.date,month:String(t.date||'').slice(0,7),completionRecordId:t.completionRecordId||'',workInstanceId:t.workInstanceId||'',completionStatus,completedPercent:percent,actualStartTime:val('actualStartTime'),actualEndTime:val('actualEndTime'),actualTaskHours:val('actualTaskHours'),issueReason:val('issueReason'),note:val('note')};
    const err=requestValidationError(payload);if(err){status($('taskStatus'),err,'error');return;}
    state.busy=true;status($('taskStatus'),'正在送出工作完成回報…');try{const d=await postBridge('portalRequest',{sessionToken:state.token,payloadJson:JSON.stringify(payload)},15000);if($('taskFilter'))$('taskFilter').value='submitted';status($('taskStatus'),d.message||'工作回報已送出，等待單機主系統同步與主管確認。','ok');await loadPortalData();}catch(e){status($('taskStatus'),e.message||String(e),'error');}finally{state.busy=false;}
  }
  function renderPayrollAvailability(){
    const sel=$('payrollMonth');if(!sel)return;const rows=state.portal?.payroll?.availableMonths||[],old=sel.value;sel.innerHTML=rows.length?rows.map(x=>`<option value="${esc(x.month)}">${esc(x.month)}${x.lockedAt?'｜已鎖定':''}</option>`).join(''):'<option value="">目前沒有已發布薪資單</option>';if(old&&rows.some(x=>x.month===old))sel.value=old;if($('loadPayslipBtn'))$('loadPayslipBtn').disabled=!rows.length;if($('homePayslipMonths'))$('homePayslipMonths').textContent=rows.length?`${rows.length} 個月`:'尚無';
  }
  function money(v){const n=Number(v);return Number.isFinite(n)?`NT$ ${Math.round(n).toLocaleString('zh-TW')}`:'—';}
  function renderPayslip(s){
    state.payslip=s;const panel=$('payslipPanel');if(!panel)return;panel.hidden=false;$('payslipTitle').textContent=`${s.month||''} 正式薪資單`;$('payslipMeta').textContent=`${s.employeeName||s.empName||state.employee?.name||''}｜${s.dept||state.employee?.department||''}｜月結鎖定 ${s.lockedAt||'—'}`;$('payslipNet').innerHTML=`<small>實發薪資</small><b>${money(s.net)}</b>`;
    const fields=[['本薪',money(s.basePay)],['正常工時',`${fmtNum(s.normalHours)} 小時`],['加班工時',`${fmtNum(s.overtimeHours)} 小時`],['加班費',money(s.overtimePay)],['津貼',money(s.allowance)],['全勤／獎金',money(s.fullBonus)],['請假時數',`${fmtNum(s.leaveHours)} 小時`],['請假扣款',money(s.leaveDeduction)],['保險／提繳扣款',money(s.insuranceDeduction)],['其他調整',money(s.correctionTotal)],['應發合計',money(s.gross)],['扣款合計',money(s.deductions)]];$('payslipGrid').innerHTML=fields.map(([k,v])=>`<div class="payslip-item"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function loadPayslip(){
    const month=$('payrollMonth')?.value||'',pin=$('payrollPin')?.value.trim()||'';if(!month){status($('payrollStatus'),'目前沒有可查詢的正式薪資單。','error');return;}if(!/^\d{6}$/.test(pin)){status($('payrollStatus'),'請再次輸入本人 6 位 PIN。','error');return;}
    $('loadPayslipBtn').disabled=true;status($('payrollStatus'),'正在進行二次身分驗證…');try{const d=await postBridge('portalPayslip',{sessionToken:state.token,month,pin},15000);$('payrollPin').value='';if(!d.payslip)throw new Error(d.message||'查無已發布薪資單');renderPayslip(d.payslip);status($('payrollStatus'),'身分驗證完成，只顯示本人這個月份的正式薪資單。','ok');}catch(e){$('payrollPin').value='';state.payslip=null;$('payslipPanel').hidden=true;status($('payrollStatus'),e.message||String(e),'error');}finally{$('loadPayslipBtn').disabled=!(state.portal?.payroll?.availableMonths||[]).length;}
  }

  function updateCameraStamp(){const now=twParts();if($('cameraStampFarm'))$('cameraStampFarm').textContent=CFG.farmName||'王泰山畜牧場';if($('cameraStampLocation'))$('cameraStampLocation').textContent=state.locationLabel||'等待定位地址';if($('cameraStampTime'))$('cameraStampTime').textContent=`台灣時間 ${now.date} ${now.time}`;}
  function startCameraStamp(){updateCameraStamp();if(state.cameraStampTimer)clearInterval(state.cameraStampTimer);state.cameraStampTimer=setInterval(updateCameraStamp,1000);if($('cameraStamp'))$('cameraStamp').hidden=false;}
  function enterCameraFullscreen(){const wrap=$('cameraWrap');if(wrap){wrap.classList.add('camera-fullscreen');document.body.classList.add('camera-live');}if($('cameraZoomBadge'))$('cameraZoomBadge').textContent=state.cameraZoomLabel||'1X';}
  function exitCameraFullscreen(){const wrap=$('cameraWrap');if(wrap)wrap.classList.remove('camera-fullscreen');document.body.classList.remove('camera-live');}
  async function forceOneXZoom(){const track=state.stream?.getVideoTracks?.()[0];state.cameraZoomLabel='1X';if(!track)return;try{const caps=track.getCapabilities?.()||{};if(caps.zoom!==undefined){let target=1;if(typeof caps.zoom==='object'){const min=Number(caps.zoom.min),max=Number(caps.zoom.max);if(Number.isFinite(min))target=Math.max(min,target);if(Number.isFinite(max))target=Math.min(max,target);}await track.applyConstraints({advanced:[{zoom:target}]});state.cameraZoomLabel='1X';}}catch(_e){state.cameraZoomLabel='1X';}if($('cameraZoomBadge'))$('cameraZoomBadge').textContent=state.cameraZoomLabel;}
  function stopCamera(){if(state.cameraStampTimer){clearInterval(state.cameraStampTimer);state.cameraStampTimer=null;}if(state.stream){state.stream.getTracks().forEach(t=>{try{t.stop()}catch(_e){}});}state.stream=null;const v=$('cameraVideo');if(v){v.pause?.();v.srcObject=null;}exitCameraFullscreen();}
  function clearPhoto(){if(state.photoUrl)URL.revokeObjectURL(state.photoUrl);state.photoUrl='';state.photoBlob=null;state.photoTakenAt='';state.lineShared=false;state.lineShareMethod='';state.shareBusy=false;state.lastShareAttemptAt=0;closeConfirm('photoReviewOverlay');closeConfirm('photoConfirmOverlay');closeConfirm('lineResultOverlay');$('photoPreview').hidden=true;$('photoCanvas').hidden=true;$('cameraVideo').hidden=false;$('faceGuide').hidden=false;if($('cameraStamp'))$('cameraStamp').hidden=false;$('photoActions').hidden=true;if($('photoReviewBox'))$('photoReviewBox').hidden=true;$('lineConfirm').hidden=true;$('submitPunchBtn').hidden=true;$('downloadPhotoLink').hidden=true;if($('openLineBtn'))$('openLineBtn').hidden=true;if($('manualLineBtn'))$('manualLineBtn').hidden=true;}
  function cancelFlow(){stopCamera();clearPhoto();state.type='';state.location=null;state.locationLabel='';$('flowPanel').hidden=true;status($('flowStatus'),'');}
  function beginFlow(type){const seq=updatePunchActionState();if(type!==seq.nextType){const msg=seq.openSegment?'目前已有尚未下班的工作時段，請先完成下班打卡。':'目前沒有進行中的上班時段，請先上班打卡。';status($('punchGuardStatus'),msg,'error');return;}if(type==='上班'&&seq.completed>0&&!seq.openSegment){const next=seq.completed+1;const ok=window.confirm(`今天第 ${seq.completed} 段已完成。\n只有確定再次回場工作，才建立第 ${next} 段上班。\n\n確定要「再次上班」嗎？`);if(!ok){status($('punchGuardStatus'),'已取消再次上班；正常一天一段不需要再打卡。','');return;}}const g=clientPunchGuard(type);if(g.blocked){status($('punchGuardStatus'),g.message,'error');return;}status($('punchGuardStatus'),'','');cancelFlow();state.type=type;$('flowPanel').hidden=false;$('flowTitle').textContent=type+'打卡';$('locationBox').innerHTML='<b>尚未定位</b><span>點「開始定位」取得現在位置與地名。</span>';$('locateBtn').hidden=false;$('cameraWrap').hidden=true;$('cameraActions').hidden=true;completeBefore('gps');$('flowPanel').scrollIntoView({behavior:'smooth',block:'start'});}
  function geoDistanceM(lat1,lon1,lat2,lon2){const R=6371000,r=Math.PI/180,dLat=(lat2-lat1)*r,dLon=(lon2-lon1)*r;const a=Math.sin(dLat/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
  async function reverseGeo(lat,lng){
    const fallback=`緯度 ${lat.toFixed(6)}、經度 ${lng.toFixed(6)}`;
    const gf=CFG.geofence||{};
    if(Number.isFinite(Number(gf.latitude))&&Number.isFinite(Number(gf.longitude))&&gf.latitude!==null&&gf.longitude!==null){const d=geoDistanceM(lat,lng,Number(gf.latitude),Number(gf.longitude));if(d<=Number(gf.radiusM||250))return `${CFG.farmName||'牧場'}（場內，距設定中心約 ${Math.round(d)} 公尺）`;}
    if(CFG.reverseGeocode===false)return fallback;
    try{const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),6000);const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1&accept-language=zh-TW`,{signal:ctl.signal,headers:{Accept:'application/json'}});clearTimeout(tm);if(!r.ok)return fallback;const d=await r.json();return String(d.display_name||fallback);}catch(_e){return fallback;}
  }
  function getPosition(opts){return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,opts));}
  async function locate(){
    if(!navigator.geolocation){status($('flowStatus'),'此瀏覽器不支援 GPS 定位。','error');return;}
    $('locateBtn').disabled=true;status($('flowStatus'),'正在取得 GPS 與定位地名…');
    try{let p;try{p=await getPosition({enableHighAccuracy:true,timeout:12000,maximumAge:0});}catch(_e){p=await getPosition({enableHighAccuracy:false,timeout:12000,maximumAge:0});}
      state.location={latitude:p.coords.latitude,longitude:p.coords.longitude,accuracyM:p.coords.accuracy};state.locationLabel=await reverseGeo(p.coords.latitude,p.coords.longitude);
      $('locationBox').innerHTML=`<b>${esc(state.locationLabel)}</b><span>${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}｜誤差約 ${Math.round(p.coords.accuracy||0)} 公尺</span>`;
      setStep('gps','done');setStep('photo','active');$('locateBtn').hidden=true;await startCamera();status($('flowStatus'),'定位完成，請拍攝本人與現場背景。','ok');
    }catch(e){const text=e&&e.code===1?'定位權限被拒絕，請到瀏覽器網站權限允許「位置」。':e&&e.code===3?'定位逾時，請移到較容易收到 GPS 的位置再試。':'暫時無法取得位置，請確認手機定位已開啟。';status($('flowStatus'),text,'error');}
    finally{$('locateBtn').disabled=false;}
  }
  async function startCamera(){
    stopCamera();clearPhoto();if(!navigator.mediaDevices?.getUserMedia){status($('flowStatus'),'瀏覽器不支援即時相機。請使用 Safari 或 Chrome 並以 HTTPS 開啟。','error');return;}
    try{state.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:state.facing},width:{ideal:1280},height:{ideal:1600}}});const v=$('cameraVideo');v.srcObject=state.stream;v.classList.toggle('mirror',state.facing==='user');v.hidden=false;$('photoCanvas').hidden=true;$('cameraWrap').hidden=false;$('cameraActions').hidden=false;await v.play();await forceOneXZoom();startCameraStamp();enterCameraFullscreen();status($('flowStatus'),'相機已全螢幕開啟｜鏡頭倍率 1X。請確認本人與現場背景後拍照。','ok');}
    catch(_e){status($('flowStatus'),'無法開啟相機，請確認瀏覽器已允許相機權限。','error');}
  }
  async function switchCamera(){state.facing=state.facing==='user'?'environment':'user';await startCamera();}
  function wrapText(ctx,text,maxWidth){const chars=Array.from(String(text||'')),lines=[];let line='';chars.forEach(ch=>{const test=line+ch;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=ch;}else line=test;});if(line)lines.push(line);return lines.slice(0,3);}
  async function waitForVideoFrame(v){
    if(v.readyState<2||!v.videoWidth||!v.videoHeight){await new Promise((resolve,reject)=>{let done=false;const ok=()=>{if(done)return;done=true;cleanup();resolve();},bad=()=>{if(done)return;done=true;cleanup();reject(new Error('相機影像尚未準備完成'));},cleanup=()=>{v.removeEventListener('loadeddata',ok);v.removeEventListener('error',bad);clearTimeout(tm);};v.addEventListener('loadeddata',ok,{once:true});v.addEventListener('error',bad,{once:true});const tm=setTimeout(bad,2500);});}
    if(typeof v.requestVideoFrameCallback==='function')await new Promise(resolve=>{let settled=false;const tm=setTimeout(()=>{if(!settled){settled=true;resolve();}},350);v.requestVideoFrameCallback(()=>{if(!settled){settled=true;clearTimeout(tm);resolve();}});});else await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  }
  function drawVideoFrame(ctx,v,w,h){ctx.save();if(state.facing==='user'){ctx.translate(w,0);ctx.scale(-1,1);}ctx.drawImage(v,0,0,w,h);ctx.restore();}
  function canvasLooksBlank(ctx,w,h){try{const pts=[[.2,.2],[.5,.2],[.8,.2],[.2,.5],[.5,.5],[.8,.5],[.2,.8],[.5,.8],[.8,.8]];let total=0,max=0;for(const [px,py] of pts){const d=ctx.getImageData(Math.max(0,Math.min(w-1,Math.floor(w*px))),Math.max(0,Math.min(h-1,Math.floor(h*py))),1,1).data;const v=d[0]+d[1]+d[2];total+=v;if(v>max)max=v;}return max<12&&total<50;}catch(_e){return false;}}
  function openConfirm(id){const el=$(id);if(el){el.hidden=false;document.body.classList.add('modal-open');const b=el.querySelector('button[data-autofocus]');if(b)setTimeout(()=>b.focus(),20);}}
  function closeConfirm(id){const el=$(id);if(el)el.hidden=true;if(!document.querySelector('.confirm-overlay:not([hidden])'))document.body.classList.remove('modal-open');}
  function showPhotoReviewOverlay(){
    const src=$('photoCanvas'),dst=$('photoReviewCanvas');
    if(!src||!dst||!src.width||!src.height)return;
    dst.width=src.width;dst.height=src.height;
    const dctx=dst.getContext('2d',{alpha:false});
    dctx.drawImage(src,0,0,dst.width,dst.height);
    openConfirm('photoReviewOverlay');
    requestAnimationFrame(()=>{try{$('photoReviewTitle').scrollIntoView({block:'start',behavior:'auto'});}catch(_e){}});
  }
  function cooldownKey(kind,type=''){return `wts_att_cd_${kind}_${state.employee?.id||'EMP'}${type?'_'+type:''}`;}
  function readTs(k){const n=Number(localStorage.getItem(k)||0);return Number.isFinite(n)?n:0;}
  function secondsLeft(ms){return Math.max(1,Math.ceil(ms/1000));}
  function clientPunchGuard(type){
    const now=Date.now(),anyTs=readTs(cooldownKey('any')),sameTs=readTs(cooldownKey('same',type));
    const anyLeft=CLIENT_ANY_COOLDOWN_MS-(now-anyTs),sameLeft=CLIENT_SAME_TYPE_COOLDOWN_MS-(now-sameTs);
    if(anyTs&&anyLeft>0)return {blocked:true,message:`剛完成一筆打卡，請 ${secondsLeft(anyLeft)} 秒後再操作，避免連續重送。`};
    if(sameTs&&sameLeft>0)return {blocked:true,message:`${type}打卡剛完成過，請 ${secondsLeft(sameLeft)} 秒後再操作，避免重複打卡。`};
    return {blocked:false,message:''};
  }
  function markClientPunch(type){const now=String(Date.now());localStorage.setItem(cooldownKey('any'),now);localStorage.setItem(cooldownKey('same',type),now);}
  function beginPhotoConfirmation(){
    $('photoConfirmSummary').innerHTML=`<b>${esc(CFG.farmName||'王泰山畜牧場')}｜${esc(state.type)}打卡</b><span>${esc(state.employee?.name||state.employee?.id||'員工')}</span><span>${esc(state.photoTakenAt)} 台灣時間</span><span>${esc(state.locationLabel||'未取得定位地址')}</span>`;
    status($('photoConfirmStatus'),'確認後會開啟手機分享面板。照片只傳到 LINE；回傳主系統的是時間、GPS、定位地址等文字資料，不含照片。','');
    openConfirm('photoConfirmOverlay');
  }
  async function takePhoto(){
    const btn=$('takePhotoBtn'),v=$('cameraVideo');if(btn)btn.disabled=true;
    try{
      await waitForVideoFrame(v);if(!v.videoWidth||!v.videoHeight)throw new Error('相機尚未準備完成，請再試一次。');
      const c=$('photoCanvas'),max=1440,scale=Math.min(1,max/v.videoWidth),w=Math.round(v.videoWidth*scale),h=Math.round(v.videoHeight*scale);c.width=w;c.height=h;const ctx=c.getContext('2d',{alpha:false});
      let blank=true;for(let attempt=0;attempt<3;attempt++){ctx.fillStyle='#111';ctx.fillRect(0,0,w,h);drawVideoFrame(ctx,v,w,h);blank=canvasLooksBlank(ctx,w,h);if(!blank)break;await new Promise(r=>setTimeout(r,140));await waitForVideoFrame(v);}
      if(blank)throw new Error('相機這一格沒有取得影像，已保留鏡頭畫面；請再按一次「拍攝自拍」。');
      const now=twParts();state.photoTakenAt=now.dateTime;const bandH=Math.max(170,Math.round(h*.21));ctx.fillStyle='rgba(10,24,15,.78)';ctx.fillRect(0,h-bandH,w,bandH);ctx.fillStyle='#fff';ctx.font=`700 ${Math.max(24,Math.round(w*.035))}px sans-serif`;ctx.fillText(`${CFG.farmName||'王泰山畜牧場'}｜${state.type}打卡`,24,h-bandH+42);ctx.font=`600 ${Math.max(20,Math.round(w*.028))}px sans-serif`;ctx.fillText(`${state.employee?.name||state.employee?.id||'員工'}｜${now.dateTime} 台灣時間`,24,h-bandH+82);ctx.font=`500 ${Math.max(17,Math.round(w*.023))}px sans-serif`;let y=h-bandH+118;wrapText(ctx,state.locationLabel,w-48).forEach(line=>{ctx.fillText(line,24,y);y+=Math.max(24,Math.round(w*.03));});
      const blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',0.88));if(!blob)throw new Error('照片建立失敗，請重新拍照。');
      state.photoBlob=blob;state.photoUrl=URL.createObjectURL(blob);$('photoPreview').hidden=true;c.hidden=false;v.hidden=true;$('faceGuide').hidden=true;if($('cameraStamp'))$('cameraStamp').hidden=true;$('cameraActions').hidden=true;$('photoActions').hidden=false;if($('photoReviewBox'))$('photoReviewBox').hidden=false;const dl=$('downloadPhotoLink');dl.href=state.photoUrl;dl.download=`WTS_${state.employee?.id||'EMP'}_${state.type}_${now.date.replaceAll('-','')}_${Date.now()}.jpg`;dl.hidden=true;if($('openLineBtn'))$('openLineBtn').hidden=true;if($('manualLineBtn'))$('manualLineBtn').hidden=true;stopCamera();setStep('photo','active');setStep('line','');status($('flowStatus'),'自拍完成，尚未傳送。系統已開啟照片預覽；請先確認照片，再決定重拍或使用這張。','ok');showPhotoReviewOverlay();
    }catch(e){status($('flowStatus'),e.message||String(e),'error');}
    finally{if(btn)btn.disabled=false;}
  }
  function reviewPhotoAndAskLineShare(){
    if(!state.photoBlob){status($('flowStatus'),'目前沒有可用的自拍照片，請重新拍攝。','error');return;}
    setStep('photo','done');setStep('line','active');
    status($('flowStatus'),'已選用這張照片。請再次確認是否傳到 LINE 群組並完成打卡。','ok');
    beginPhotoConfirmation();
  }
  function acceptPhotoFromReview(){
    if(!state.photoBlob){closeConfirm('photoReviewOverlay');status($('flowStatus'),'目前沒有可用的自拍照片，請重新拍攝。','error');return;}
    closeConfirm('photoReviewOverlay');
    reviewPhotoAndAskLineShare();
  }
  function retakeFromReview(){closeConfirm('photoReviewOverlay');startCamera();}
  function lineShareText(){return `${CFG.farmName||'王泰山畜牧場'}｜${state.type}打卡\n${state.employee?.name||state.employee?.id||'員工'}\n${state.photoTakenAt} 台灣時間\n${state.locationLabel}`;}
  function revealManualLine(){if($('openLineBtn'))$('openLineBtn').hidden=false;if($('manualLineBtn'))$('manualLineBtn').hidden=false;}
  function lineShareGuard(){const left=LINE_SHARE_COOLDOWN_MS-(Date.now()-state.lastShareAttemptAt);return state.lastShareAttemptAt&&left>0?left:0;}
  async function shareLineNow(){
    if(!state.photoBlob)return false;
    if(state.shareBusy)return false;
    const guard=lineShareGuard();if(guard>0){status($('photoConfirmStatus'),`為避免連續叫出分享視窗，請 ${secondsLeft(guard)} 秒後再試。`,'error');return false;}
    state.shareBusy=true;state.lastShareAttemptAt=Date.now();
    const filename=`WTS_${state.employee?.id||'EMP'}_${state.type}_${twParts().date.replaceAll('-','')}_${Date.now()}.jpg`;
    const file=new File([state.photoBlob],filename,{type:'image/jpeg'});const dl=$('downloadPhotoLink');dl.href=state.photoUrl;dl.download=filename;dl.hidden=false;
    const canFileShare=!!(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]}));
    try{
      if(canFileShare){
        status($('flowStatus'),'正在開啟手機分享面板。請選 LINE，再選指定群組。','ok');
        await navigator.share({files:[file]});state.lineShareMethod='web-share';return true;
      }
      revealManualLine();status($('flowStatus'),'此瀏覽器無法直接分享 JPG。請先儲存照片，再按「開啟 LINE 分享畫面」。','error');return false;
    }catch(e){
      if(e&&e.name!=='AbortError')status($('flowStatus'),'系統圖片分享失敗。可先儲存照片，再開啟 LINE 手動傳送。','error');
      else status($('flowStatus'),'已取消分享；尚未完成打卡。','');return false;
    }finally{state.shareBusy=false;}
  }
  async function startConfirmedLineShare(){
    closeConfirm('photoConfirmOverlay');
    const opened=await shareLineNow();
    if(opened){$('lineResultText').textContent='系統分享面板已返回。請確認剛才是否真的選擇 LINE，並已傳到指定工作群組。';openConfirm('lineResultOverlay');}
    else{revealManualLine();$('photoActions').hidden=false;status($('flowStatus'),'照片尚未確認傳到 LINE；可重試分享或使用手動 LINE 流程。','error');}
  }
  async function confirmLineShared(){
    if(state.busy)return;closeConfirm('lineResultOverlay');state.lineShared=true;if(!state.lineShareMethod)state.lineShareMethod='manual-confirm';$('lineConfirm').hidden=false;$('submitPunchBtn').hidden=false;setStep('line','done');setStep('submit','active');status($('flowStatus'),'已確認照片傳到 LINE 群組。現在只回傳時間、GPS、定位地址等打卡資料；不回傳照片。','ok');await submitPunch();
  }
  async function shareLine(){
    if(!state.photoBlob)return;const guard=lineShareGuard();if(guard>0){status($('flowStatus'),`請 ${secondsLeft(guard)} 秒後再重試分享，避免短時間連續開啟 LINE。`,'error');return;}
    const opened=await shareLineNow();if(opened){$('lineResultText').textContent='系統分享面板已返回。請確認照片是否已傳到指定 LINE 群組。';openConfirm('lineResultOverlay');}
  }
  function openLineShare(){state.lineShareMethod='line-url-manual';const text=lineShareText()+`\n（請在 LINE 群組內附上剛才的自拍照片）`;window.location.href='https://line.me/R/share?text='+encodeURIComponent(text);}
  function localRecords(){try{return JSON.parse(localStorage.getItem('wts_att_local_records')||'[]')||[]}catch(_e){return[]}}
  function saveLocal(r){const a=localRecords();a.unshift(r);localStorage.setItem('wts_att_local_records',JSON.stringify(a.slice(0,80)));renderToday();}
  function renderToday(){
    const events=localTodayPunchEvents(),info=attendanceSegments(events),el=$('todayRecords');if(!el)return;
    el.innerHTML=info.segments.length?info.segments.map(seg=>{const inLoc=seg.in?.locationLabel||'未取得地名',outLoc=seg.out?.locationLabel||'';return `<div class="local-segment ${seg.open?'open':''}"><b>第 ${seg.index} 段｜${esc(seg.in?.time||'—')} → ${esc(seg.out?.time||'尚未下班')}</b><span>${seg.open?'目前工作中':`本段 ${durationText(seg.minutes)}`}<br>上班：${esc(inLoc)}${outLoc?`<br>下班：${esc(outLoc)}`:''}</span></div>`;}).join(''):'<p class="muted">今天尚無本機打卡紀錄。</p>';
    updatePunchActionState();
  }
  function mergePunchIntoPortal(record){
    if(!record||!record.date||!record.type)return;
    if(!state.portal||typeof state.portal!=='object')state.portal={};
    if(!Array.isArray(state.portal.attendanceRecent))state.portal.attendanceRecent=[];
    let row=state.portal.attendanceRecent.find(x=>String(x.date||'')===String(record.date||''));
    if(!row){row={date:String(record.date||''),in:'',out:'',status:'雲端即時打卡',events:[]};state.portal.attendanceRecent.push(row);}
    if(!Array.isArray(row.events))row.events=[];
    const rid=String(record.recordId||''),sig=`${record.type}|${record.dateTime||record.date+'T'+record.time}`;
    const exists=row.events.some(x=>{const xid=String(x.recordId||''),xsig=`${x.type}|${x.dateTime||x.date+'T'+x.time}`;return (rid&&xid===rid)||(sig&&xsig===sig);});
    if(!exists)row.events.push({recordId:rid,type:String(record.type||''),date:String(record.date||''),time:String(record.time||''),dateTime:String(record.dateTime||''),locationLabel:String(record.locationLabel||''),source:'Apps Script 即時打卡'});
    row.events.sort((a,b)=>String(a.dateTime||a.time||'').localeCompare(String(b.dateTime||b.time||'')));
    const ins=row.events.filter(x=>x.type==='上班'&&x.time).map(x=>String(x.time));
    const outs=row.events.filter(x=>x.type==='下班'&&x.time).map(x=>String(x.time));
    if(ins.length)row.in=ins.sort()[0];if(outs.length)row.out=outs.sort().slice(-1)[0];
    const segInfo=attendanceSegments(row.events);row.segmentCount=segInfo.segments.length;row.openSegment=!!segInfo.openSegment;if(!row.status||['雲端即時打卡','已完成','已上班'].includes(row.status))row.status=segInfo.openSegment?`第 ${segInfo.openSegment.index} 段工作中`:(segInfo.completed>1?`已完成 ${segInfo.completed} 段`:(segInfo.completed===1?'已完成':'尚未上班'));
    state.portal.attendanceRecent.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    state.portal.attendanceRecent=state.portal.attendanceRecent.slice(0,31);
    state.portal.summary=state.portal.summary||{};state.portal.summary.attendanceDays=state.portal.attendanceRecent.length;
    renderPortalData();
  }
  async function submitPunch(){
    if(state.busy)return;const seq=updatePunchActionState();if(state.type!==seq.nextType){status($('flowStatus'),seq.openSegment?'目前已有尚未下班的工作時段，請先下班。':'目前應先上班打卡。','error');return;}const guard=clientPunchGuard(state.type);if(guard.blocked){status($('flowStatus'),guard.message,'error');return;}if(CFG.requireGps!==false&&!state.location){status($('flowStatus'),'尚未取得 GPS，不能送出。','error');return;}if(CFG.requireLineShare!==false&&!state.lineShared){status($('flowStatus'),'請先確認自拍照片已傳到 LINE 群組。','error');return;}
    state.busy=true;$('submitPunchBtn').disabled=true;const recordId=`GH-${state.employee?.id||'EMP'}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;status($('flowStatus'),'正在回傳打卡資料，以雲端台灣時間作為正式時間…');
    try{const d=await postBridge('punch',{sessionToken:state.token,recordId,type:state.type,latitude:state.location?.latitude,longitude:state.location?.longitude,accuracyM:state.location?.accuracyM,locationLabel:state.locationLabel,photoConfirmed:'1',photoTakenAtClient:state.photoTakenAt,lineShared:'1',lineShareMethod:state.lineShareMethod||'manual-confirm'});const r=d.record||{};if(d.duplicate)localStorage.setItem(cooldownKey('any'),String(Date.now()));else markClientPunch(state.type);saveLocal({recordId:r.recordId||recordId,employeeId:currentEmployeeId(),type:r.type||state.type,date:r.date||twParts().date,time:r.time||twParts().time,dateTime:r.dateTime||'',employeeName:state.employee?.name||'',locationLabel:r.locationLabel||state.locationLabel,lineShared:true});mergePunchIntoPortal({recordId:r.recordId||recordId,type:r.type||state.type,date:r.date||twParts().date,time:r.time||twParts().time,dateTime:r.dateTime||'',locationLabel:r.locationLabel||state.locationLabel});loadPortalData();setStep('submit','done');status($('flowStatus'),d.duplicate?`短時間內已有打卡紀錄，系統未重複新增｜${r.date||''} ${r.time||''}`:`${r.type||state.type}打卡成功｜${r.date||''} ${r.time||''}（台灣伺服器時間；主系統不含照片）`,'ok');$('submitPunchBtn').hidden=true;setTimeout(()=>cancelFlow(),1700);}
    catch(e){status($('flowStatus'),e.message,'error');}
    finally{state.busy=false;$('submitPunchBtn').disabled=false;}
  }
  function refreshBridgeSetup(){const issue=bridgeConfigIssue();const panel=$('setupPanel');const input=$('bridgeUrlInput');if(input&&!input.matches(':focus'))input.value=bridgeUrl||'';if(issue){panel.hidden=false;const el=$('setupMessage');if(el)el.textContent=issue;status($('loginStatus'),issue,'error');}else{const src=$('bridgeSourceText');if(src)src.textContent='橋接網址已設定在這台裝置。若主系統內附 config.js 也有預設網址，這台裝置的設定會優先使用。';if($('loginStatus').textContent.includes('尚未設定'))status($('loginStatus'),'','');}}

  async function testBridge(){
    if(!bridgeReady()){status($('setupStatus'),bridgeConfigIssue(),'error');return;}
    const btn=$('testBridgeBtn');if(btn)btn.disabled=true;status($('setupStatus'),'正在測試 Apps Script 回傳…');
    try{const d=await postBridge('health',{},10000);status($('setupStatus'),`雲端橋接正常｜${d.version||'版本未知'}｜${d.now||'已收到 Apps Script 回傳'}`,'ok');}
    catch(e){status($('setupStatus'),e.message||String(e),'error');}
    finally{if(btn)btn.disabled=false;}
  }
  function saveBridgeSetup(){try{const n=normalizeBridgeUrl($('bridgeUrlInput').value);localStorage.setItem(BRIDGE_STORAGE_KEY,n);bridgeUrl=n;status($('setupStatus'),'橋接網址已儲存。現在可以直接登入打卡。','ok');refreshBridgeSetup();setTimeout(()=>{$('setupPanel').hidden=true;},700);}catch(e){status($('setupStatus'),e.message||String(e),'error');}}
  function clearBridgeSetup(){localStorage.removeItem(BRIDGE_STORAGE_KEY);bridgeUrl='';try{bridgeUrl=normalizeBridgeUrl(CFG.bridgeUrl||'');}catch(_e){bridgeUrl='';}status($('setupStatus'),bridgeUrl?'已清除這台裝置的自訂網址，改用 GitHub config.js 預設網址。':'已清除這台裝置的橋接網址。','ok');refreshBridgeSetup();}
  refreshBridgeSetup();
  $('setupToggleBtn').addEventListener('click',()=>{$('setupPanel').hidden=!$('setupPanel').hidden;if(!$('setupPanel').hidden){$('bridgeUrlInput').value=bridgeUrl||'';setTimeout(()=>$('bridgeUrlInput').focus(),50);}});
  $('saveBridgeBtn').addEventListener('click',saveBridgeSetup);$('testBridgeBtn').addEventListener('click',testBridge);$('clearBridgeBtn').addEventListener('click',clearBridgeSetup);$('bridgeUrlInput').addEventListener('keydown',e=>{if(e.key==='Enter')saveBridgeSetup();});
  $('loginBtn').addEventListener('click',login);$('employeeId').addEventListener('keydown',e=>{if(e.key==='Enter')$('employeePin').focus();});$('employeePin').addEventListener('keydown',e=>{if(e.key==='Enter')login();});if($('cameraCancelBtn'))$('cameraCancelBtn').addEventListener('click',cancelFlow);$('logoutBtn').addEventListener('click',logout);$('refreshPortalBtn').addEventListener('click',loadPortalData);$('cancelBtn').addEventListener('click',cancelFlow);$('locateBtn').addEventListener('click',locate);$('switchCameraBtn').addEventListener('click',switchCamera);$('takePhotoBtn').addEventListener('click',takePhoto);$('retakeBtn').addEventListener('click',()=>startCamera());$('shareLineBtn').addEventListener('click',reviewPhotoAndAskLineShare);$('openLineBtn').addEventListener('click',openLineShare);$('manualLineBtn').addEventListener('click',confirmLineShared);$('submitPunchBtn').addEventListener('click',submitPunch);$('photoConfirmYesBtn').addEventListener('click',startConfirmedLineShare);$('photoReviewRetakeBtn').addEventListener('click',retakeFromReview);$('photoReviewUseBtn').addEventListener('click',acceptPhotoFromReview);$('photoConfirmRetakeBtn').addEventListener('click',()=>{closeConfirm('photoConfirmOverlay');startCamera();});$('photoConfirmCancelBtn').addEventListener('click',()=>{closeConfirm('photoConfirmOverlay');showPhotoReviewOverlay();});$('lineResultYesBtn').addEventListener('click',confirmLineShared);$('lineResultRetryBtn').addEventListener('click',()=>{closeConfirm('lineResultOverlay');shareLine();});$('lineResultNoBtn').addEventListener('click',()=>{closeConfirm('lineResultOverlay');status($('flowStatus'),'尚未確認 LINE 分享；本次打卡不會回傳。','');});document.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click',()=>beginFlow(b.dataset.type)));
  document.querySelectorAll('[data-portal-nav]').forEach(b=>b.addEventListener('click',()=>switchPortalView(b.dataset.portalNav)));document.querySelectorAll('[data-open-view]').forEach(b=>b.addEventListener('click',()=>switchPortalView(b.dataset.openView)));document.querySelectorAll('.request-kind').forEach(b=>b.addEventListener('click',()=>chooseRequestKind(b.dataset.requestKind)));$('leaveType').addEventListener('change',renderLeaveRule);$('leaveUnit').addEventListener('change',toggleLeaveUnit);$('corrType').addEventListener('change',corrToggle);$('submitLeaveBtn').addEventListener('click',submitLeave);$('submitPreleaveBtn').addEventListener('click',submitPreleave);$('submitRosterChangeBtn').addEventListener('click',submitRosterChange);$('submitCorrBtn').addEventListener('click',submitCorrection);$('submitOtBtn').addEventListener('click',submitOvertime);$('scheduleMonth').addEventListener('change',()=>{state.scheduleSelectedDate='';renderSchedule();});$('schedulePrevBtn').addEventListener('click',()=>{$('scheduleMonth').value=monthShift($('scheduleMonth').value,-1);state.scheduleSelectedDate='';renderSchedule();});$('scheduleNextBtn').addEventListener('click',()=>{$('scheduleMonth').value=monthShift($('scheduleMonth').value,1);state.scheduleSelectedDate='';renderSchedule();});$('workPlanMonth').addEventListener('change',renderWorkPlan);$('workPlanPrevBtn').addEventListener('click',()=>{$('workPlanMonth').value=monthShift($('workPlanMonth').value,-1);renderWorkPlan();});$('workPlanNextBtn').addEventListener('click',()=>{$('workPlanMonth').value=monthShift($('workPlanMonth').value,1);renderWorkPlan();});$('taskFilter').addEventListener('change',renderTasks);$('loadPayslipBtn').addEventListener('click',loadPayslip);$('payrollPin').addEventListener('keydown',e=>{if(e.key==='Enter')loadPayslip();});$('printPayslipBtn').addEventListener('click',()=>window.print());initPortalForms();
  window.addEventListener('pagehide',stopCamera);if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).catch(()=>{});restoreEmployee();
})();

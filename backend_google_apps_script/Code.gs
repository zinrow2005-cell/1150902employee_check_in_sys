/**
 * W427 FIX363 CLEAN｜王泰山畜牧場員工自助中心｜部門＋批次月曆導向排班整合
 *
 * 第一次設定只需要：
 * 1. 將本檔完整貼到 Apps Script 的 Code.gs
 * 2. Ctrl+S / Cmd+S 儲存
 * 3. 上方函式選單執行 SETUP_ATTENDANCE_BRIDGE
 * 4. 再執行 SHOW_SYNC_KEY 查看同步金鑰
 */

const BRIDGE_VERSION = 'W427_FIX363_CLEAN';
const PUNCH_ANY_COOLDOWN_SECONDS = 30;
const PUNCH_SAME_TYPE_COOLDOWN_SECONDS = 180;
const ATTENDANCE_SHEET = 'Attendance';
const TAIPEI_TZ = 'Asia/Taipei';
const SESSION_SECONDS = 60 * 60 * 12;
const HEADERS = [
  'recordId','employeeId','employeeName','type','date','time','dateTime',
  'latitude','longitude','accuracyM','locationLabel','photoConfirmed',
  'photoTakenAtClient','lineShared','lineShareMethod','serverCreatedAt'
];

const PORTAL_SHEET = 'EmployeePortal';
const PORTAL_HEADERS = ['employeeId','payloadJson','updatedAt'];
const PORTAL_REQUEST_SHEET = 'EmployeeRequests';
const PORTAL_REQUEST_HEADERS = ['requestId','employeeId','employeeName','requestKind','date','payloadJson','status','reviewNote','createdAt','updatedAt','serverCreatedAt'];
const PORTAL_REQUEST_COOLDOWN_SECONDS = 20;
const PORTAL_PAYSLIP_SHEET = 'EmployeePayslips';
const PORTAL_PAYSLIP_HEADERS = ['employeeId','month','payloadJson','updatedAt'];

/**
 * 【第一次請執行這個】
 * 建立 Google Sheet、SHEET_ID、SYNC_KEY、EMPLOYEES_JSON。
 */
function SETUP_ATTENDANCE_BRIDGE() {
  return setupAttendanceBridge();
}

/**
 * 【查看同步金鑰】
 * 在 Apps Script 下方「執行記錄」顯示 SYNC_KEY。
 * 若尚未初始化，會先自動初始化。
 */
function SHOW_SYNC_KEY() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SHEET_ID') || !props.getProperty('SYNC_KEY')) {
    setupAttendanceBridge();
  }
  const key = String(props.getProperty('SYNC_KEY') || '');
  console.log('==============================');
  console.log('SYNC_KEY = ' + key);
  console.log('請只複製等號後面的完整字串到單機主系統「同步金鑰」。');
  console.log('==============================');
  return key;
}

/**
 * 【檢查目前設定】不會顯示員工 PIN。
 */
function CHECK_BRIDGE_SETUP() {
  const props = PropertiesService.getScriptProperties();
  const info = {
    version: BRIDGE_VERSION,
    sheetIdConfigured: !!props.getProperty('SHEET_ID'),
    syncKeyConfigured: !!props.getProperty('SYNC_KEY'),
    employeeCount: employees_().length,
    timezone: TAIPEI_TZ
  };
  console.log(JSON.stringify(info, null, 2));
  if (info.syncKeyConfigured) {
    console.log('SYNC_KEY 已建立。若要查看完整值，請執行 SHOW_SYNC_KEY。');
  } else {
    console.log('SYNC_KEY 尚未建立，請執行 SETUP_ATTENDANCE_BRIDGE。');
  }
  return info;
}

/**
 * 【僅在懷疑金鑰外洩時使用】
 * 會產生新 SYNC_KEY；主系統舊金鑰會立即失效。
 */
function REGENERATE_SYNC_KEY() {
  const props = PropertiesService.getScriptProperties();
  const key = makeSyncKey_();
  props.setProperty('SYNC_KEY', key);
  props.setProperty('BRIDGE_VERSION', BRIDGE_VERSION);
  console.log('新的 SYNC_KEY = ' + key);
  console.log('請立刻把新金鑰更新到單機主系統。');
  return key;
}

/** Compatibility alias retained for existing callers. */
function setupAttendanceBridge() {
  const props = PropertiesService.getScriptProperties();
  let sheetId = String(props.getProperty('SHEET_ID') || '').trim();
  let ss = null;

  if (sheetId) {
    try {
      ss = SpreadsheetApp.openById(sheetId);
    } catch (err) {
      console.log('原 SHEET_ID 無法開啟，將建立新的橋接試算表：' + String(err && err.message || err));
      sheetId = '';
    }
  }

  if (!sheetId || !ss) {
    ss = SpreadsheetApp.create('王泰山畜牧場_員工打卡雲端橋接');
    props.setProperty('SHEET_ID', ss.getId());
  }

  ensureSheet_(ss);
  ensureNamedSheet_(ss, PORTAL_SHEET, PORTAL_HEADERS);
  ensureNamedSheet_(ss, PORTAL_REQUEST_SHEET, PORTAL_REQUEST_HEADERS);
  ensureNamedSheet_(ss, PORTAL_PAYSLIP_SHEET, PORTAL_PAYSLIP_HEADERS);

  if (!props.getProperty('SYNC_KEY')) {
    props.setProperty('SYNC_KEY', makeSyncKey_());
  }
  if (!props.getProperty('EMPLOYEES_JSON')) {
    props.setProperty('EMPLOYEES_JSON', '[]');
  }
  props.setProperty('BRIDGE_VERSION', BRIDGE_VERSION);

  const result = {
    ok: true,
    version: BRIDGE_VERSION,
    spreadsheetUrl: ss.getUrl(),
    syncKeyConfigured: true,
    employeeCount: employees_().length
  };

  console.log('初始化完成：' + BRIDGE_VERSION);
  console.log('Spreadsheet: ' + ss.getUrl());
  console.log('SYNC_KEY 已設定。若要查看完整值，請另行執行 SHOW_SYNC_KEY。');
  console.log('正式員工帳號請由單機主系統「員工管理中心」同步。');
  return result;
}

function SHOW_EMPLOYEE_ACCOUNTS() {
  const rows = employees_().map(function(x){
    return {id:String(x.id||''), name:String(x.name||''), department:String(x.department||''), active:x.active!==false};
  });
  console.log('EMPLOYEE_COUNT = ' + rows.length);
  console.log(JSON.stringify(rows, null, 2));
  return rows;
}

function makeSyncKey_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || 'health');
  if (action === 'health') {
    return json_({
      ok:true,
      service:'WTS attendance bridge',
      version:BRIDGE_VERSION,
      timezone:TAIPEI_TZ,
      initialized:isInitialized_(),
      now:isoNow_()
    });
  }
  if (action === 'export') {
    const props = PropertiesService.getScriptProperties();
    const supplied = String((e && e.parameter && e.parameter.syncKey) || '');
    if (!supplied || supplied !== String(props.getProperty('SYNC_KEY') || '')) {
      return json_({ok:false, message:'syncKey 不正確'});
    }
    const since = String((e && e.parameter && e.parameter.since) || '');
    return json_(exportRecords_(since));
  }
  return json_({ok:false, message:'未知 action'});
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  const action = String(p.action || '');
  const requestId = String(p.requestId || '');
  try {
    if (action === 'health') {
      return bridgeHtml_({ok:true, requestId:requestId, service:'WTS attendance bridge', version:BRIDGE_VERSION, initialized:isInitialized_(), timezone:TAIPEI_TZ, now:isoNow_()});
    }
    if (action === 'export') {
      const props = PropertiesService.getScriptProperties();
      if (String(p.syncKey || '') !== String(props.getProperty('SYNC_KEY') || '')) {
        return json_({ok:false, message:'syncKey 不正確'});
      }
      return json_(exportRecords_(String(p.since || '')));
    }
    if (action === 'syncEmployees') {
      const props = PropertiesService.getScriptProperties();
      if (String(p.syncKey || '') !== String(props.getProperty('SYNC_KEY') || '')) {
        return json_({ok:false, message:'syncKey 不正確'});
      }
      return json_(syncEmployees_(String(p.employeesJson || '[]')));
    }
    if (action === 'syncPortalData') {
      if (!managerSyncKeyOk_(p.syncKey)) return json_({ok:false, message:'syncKey 不正確'});
      return json_(syncPortalData_(String(p.portalDataJson || '[]')));
    }
    if (action === 'exportPortalRequests') {
      if (!managerSyncKeyOk_(p.syncKey)) return json_({ok:false, message:'syncKey 不正確'});
      return json_(exportPortalRequests_(String(p.since || '')));
    }
    if (action === 'syncPortalRequestStatuses') {
      if (!managerSyncKeyOk_(p.syncKey)) return json_({ok:false, message:'syncKey 不正確'});
      return json_(syncPortalRequestStatuses_(String(p.statusesJson || '[]')));
    }
    if (action === 'syncPortalPayslips') {
      if (!managerSyncKeyOk_(p.syncKey)) return json_({ok:false, message:'syncKey 不正確'});
      return json_(syncPortalPayslips_(String(p.payslipsJson || '[]')));
    }
    if (action === 'login') return bridgeHtml_(Object.assign({requestId:requestId}, login_(p)));
    if (action === 'portalData') return bridgeHtml_(Object.assign({requestId:requestId}, portalData_(p)));
    if (action === 'portalPayslip') return bridgeHtml_(Object.assign({requestId:requestId}, portalPayslip_(p)));
    if (action === 'portalRequest') return bridgeHtml_(Object.assign({requestId:requestId}, portalRequest_(p)));
    if (action === 'punch') return bridgeHtml_(Object.assign({requestId:requestId}, punch_(p)));
    return bridgeHtml_({ok:false, requestId:requestId, message:'未知 action'});
  } catch (err) {
    return bridgeHtml_({ok:false, requestId:requestId, message:String(err && err.message || err || '伺服器錯誤')});
  }
}

function managerSyncKeyOk_(value) {
  return String(value || '') === String(PropertiesService.getScriptProperties().getProperty('SYNC_KEY') || '');
}

function employeeIdKey_(value) {
  return String(value || '').trim().toUpperCase();
}

function employeeIdEqual_(a, b) {
  const ak = employeeIdKey_(a), bk = employeeIdKey_(b);
  return !!ak && ak === bk;
}

function sessionEmployee_(token) {
  const key = String(token || '').trim();
  if (!key) return null;
  const cache = CacheService.getScriptCache();
  const cached = cache.get('session:' + key);
  if (!cached) return null;
  let session;
  try { session = JSON.parse(cached); } catch (_e) { return null; }
  // Every session use rechecks that the employee still exists and is active.
  const current = employees_().find(function(x){return employeeIdEqual_(x.id, session.id) && x.active!==false;});
  if (!current) { cache.remove('session:' + key); return null; }
  return {id:current.id,name:current.name||current.id,department:current.department||''};
}

function login_(p) {
  const employeeId = String(p.employeeId || '').trim();
  const pin = String(p.pin || '').trim();
  if (!employeeId || !pin) return {ok:false, message:'請輸入員工編號與 PIN'};
  const employee = employees_().find(function(x){return employeeIdEqual_(x.id, employeeId) && x.active!==false;});
  if (!employee || String(employee.pin || '') !== pin) return {ok:false, message:'員工編號或 PIN 不正確'};
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('session:' + token, JSON.stringify({id:employee.id,name:employee.name||employee.id,department:employee.department||''}), SESSION_SECONDS);
  return {ok:true, sessionToken:token, employee:{id:employee.id,name:employee.name||employee.id,department:employee.department||''}};
}

function syncPortalData_(rawJson) {
  let rows=[];
  try { rows=JSON.parse(rawJson || '[]'); } catch (_e) { return {ok:false,message:'portalDataJson 不是有效 JSON'}; }
  if (!Array.isArray(rows)) return {ok:false,message:'portalDataJson 必須是陣列'};
  const sheet=ensureNamedSheet_(spreadsheet_(),PORTAL_SHEET,PORTAL_HEADERS);
  if (sheet.getLastRow()>1) sheet.getRange(2,1,sheet.getLastRow()-1,PORTAL_HEADERS.length).clearContent();
  const values=[];
  const now=isoNow_();
  rows.forEach(function(x){
    if(!x||typeof x!=='object')return;
    const id=String(x.employeeId||'').trim();if(!id)return;
    let payload=JSON.stringify(x);
    if(payload.length>48000){
      const slim=Object.assign({},x);
      if(Array.isArray(slim.attendanceRecent))slim.attendanceRecent=slim.attendanceRecent.slice(0,14);
      if(slim.leave&&slim.leave.ledger&&Array.isArray(slim.leave.ledger.history))slim.leave.ledger.history=slim.leave.ledger.history.slice(0,20);
      if(Array.isArray(slim.requests))slim.requests=slim.requests.slice(0,40);
      if(slim.schedule&&Array.isArray(slim.schedule.rows))slim.schedule.rows=slim.schedule.rows.slice(-62);
      if(Array.isArray(slim.workTasks))slim.workTasks=slim.workTasks.slice(0,30);
      payload=JSON.stringify(slim);
    }
    values.push([id,payload,String(x.updatedAt||now)]);
  });
  if(values.length)sheet.getRange(2,1,values.length,PORTAL_HEADERS.length).setValues(values);
  return {ok:true,count:values.length,updatedAt:now};
}

function portalSnapshot_(employeeId) {
  const sheet=ensureNamedSheet_(spreadsheet_(),PORTAL_SHEET,PORTAL_HEADERS);
  const last=sheet.getLastRow();if(last<2)return null;
  const values=sheet.getRange(2,1,last-1,2).getValues();
  for(let i=values.length-1;i>=0;i--){
    if(!employeeIdEqual_(values[i][0], employeeId))continue;
    try{return JSON.parse(String(values[i][1]||''));}catch(_e){return null;}
  }
  return null;
}

function portalRequestRows_() {
  const sheet=ensureNamedSheet_(spreadsheet_(),PORTAL_REQUEST_SHEET,PORTAL_REQUEST_HEADERS);
  const values=sheet.getDataRange().getValues();
  if(values.length<=1)return [];
  const headers=values[0].map(String);
  return values.slice(1).map(function(row,index){const o={_row:index+2};headers.forEach(function(h,i){o[h]=row[i];});try{o.payload=JSON.parse(String(o.payloadJson||'{}'));}catch(_e){o.payload={};}return o;});
}

function portalRequestsForEmployee_(employeeId) {
  return portalRequestRows_().filter(function(x){return employeeIdEqual_(x.employeeId, employeeId);}).sort(function(a,b){return String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''));}).slice(0,80).map(function(x){return {requestId:String(x.requestId||''),requestKind:String(x.requestKind||''),date:String(x.date||''),payload:x.payload||{},status:String(x.status||''),reviewNote:String(x.reviewNote||''),createdAt:String(x.createdAt||''),updatedAt:String(x.updatedAt||'')};});
}

function punchTimeMinutes_(value) {
  const m=/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value||''));
  if(!m)return null;
  const h=Number(m[1]),n=Number(m[2]),sec=Number(m[3]||0);
  if(h<0||h>23||n<0||n>59||sec<0||sec>59)return null;
  return h*60+n+sec/60;
}

function attendanceSegmentInfo_(events) {
  const sorted=(Array.isArray(events)?events:[]).filter(function(x){return x&&['上班','下班'].indexOf(String(x.type||''))>=0;}).slice().sort(function(a,b){return String(a.dateTime||a.time||'').localeCompare(String(b.dateTime||b.time||''));});
  const segments=[];let open=null;const orphan=[];
  sorted.forEach(function(ev){
    const type=String(ev.type||'');
    if(type==='上班'){
      if(open){orphan.push(ev);return;}
      open={index:segments.length+1,in:ev,out:null,open:true,minutes:0};
    }else if(type==='下班'){
      if(!open){orphan.push(ev);return;}
      const a=punchTimeMinutes_(open.in&&open.in.time),b=punchTimeMinutes_(ev.time);let mins=0;
      if(a!==null&&b!==null){let end=b;if(end<a)end+=1440;mins=Math.max(0,end-a);}
      open.out=ev;open.open=false;open.minutes=mins;segments.push(open);open=null;
    }
  });
  return {segments:open?segments.concat([open]):segments.slice(),completed:segments.length,openSegment:open,nextType:open?'下班':'上班',totalMinutes:segments.reduce(function(n,x){return n+Number(x.minutes||0);},0),orphanEvents:orphan};
}

function todayEmployeePunchEvents_(sheet, employeeId, today) {
  const last=sheet.getLastRow();if(last<2)return [];
  const target=String(today||Utilities.formatDate(new Date(),TAIPEI_TZ,'yyyy-MM-dd'));
  const start=Math.max(2,last-4999),values=sheet.getRange(start,1,last-start+1,HEADERS.length).getValues(),headers=HEADERS.slice(),events=[];
  for(let i=values.length-1;i>=0;i--){
    const row=values[i],obj={};headers.forEach(function(h,j){obj[h]=row[j];});
    const date=String(obj.date||'').slice(0,10);if(date&&date<target)break;
    if(date!==target||!employeeIdEqual_(obj.employeeId,employeeId))continue;
    events.push({recordId:String(obj.recordId||''),employeeId:String(obj.employeeId||''),employeeName:String(obj.employeeName||''),type:String(obj.type||''),date:target,time:String(obj.time||''),dateTime:String(obj.dateTime||obj.serverCreatedAt||''),latitude:numberOrBlank_(obj.latitude),longitude:numberOrBlank_(obj.longitude),accuracyM:numberOrBlank_(obj.accuracyM),locationLabel:String(obj.locationLabel||''),photoConfirmed:String(obj.photoConfirmed).toLowerCase()==='true'||obj.photoConfirmed===true,lineShared:String(obj.lineShared).toLowerCase()==='true'||obj.lineShared===true,source:'Apps Script 即時打卡'});
  }
  events.sort(function(a,b){return String(a.dateTime||a.time||'').localeCompare(String(b.dateTime||b.time||''));});
  return events;
}

function cloudTodayAttendance_(employeeId) {
  const sheet=ensureSheet_(spreadsheet_());
  const today=Utilities.formatDate(new Date(),TAIPEI_TZ,'yyyy-MM-dd');
  const events=todayEmployeePunchEvents_(sheet,employeeId,today);if(!events.length)return null;
  const info=attendanceSegmentInfo_(events);
  const inTimes=events.filter(function(x){return x.type==='上班'&&x.time;}).map(function(x){return x.time;}).sort();
  const outTimes=events.filter(function(x){return x.type==='下班'&&x.time;}).map(function(x){return x.time;}).sort();
  const status=info.openSegment?('第 '+info.openSegment.index+' 段工作中'):(info.completed>1?('已完成 '+info.completed+' 段'):(info.completed===1?'已完成':'尚未上班'));
  return {date:today,in:inTimes.length?inTimes[0]:'',out:outTimes.length?outTimes[outTimes.length-1]:'',status:status,events:events,segmentCount:info.segments.length,completedSegments:info.completed,openSegment:!!info.openSegment,workMinutes:info.totalMinutes,live:true};
}

function mergeCloudTodayAttendance_(snapshot, employeeId) {
  const cloud=cloudTodayAttendance_(employeeId);if(!cloud)return snapshot;
  const rows=Array.isArray(snapshot.attendanceRecent)?snapshot.attendanceRecent.slice():[];
  let row=rows.find(function(x){return String(x.date||'')===cloud.date;});
  if(!row){row={date:cloud.date,in:'',out:'',status:'',events:[]};rows.unshift(row);}
  if(!Array.isArray(row.events))row.events=[];
  const seenIds={},seenSig={};row.events.forEach(function(x){const rid=String(x.recordId||''),sig=[x.type,x.dateTime||x.time].join('|');if(rid)seenIds[rid]=true;if(sig)seenSig[sig]=true;});
  cloud.events.forEach(function(x){const rid=String(x.recordId||''),sig=[x.type,x.dateTime||x.time].join('|');if((rid&&seenIds[rid])||(sig&&seenSig[sig]))return;row.events.push(x);if(rid)seenIds[rid]=true;if(sig)seenSig[sig]=true;});
  row.events.sort(function(a,b){return String(a.dateTime||a.time||'').localeCompare(String(b.dateTime||b.time||''));});
  const inTimes=row.events.filter(function(x){return x.type==='上班'&&x.time;}).map(function(x){return String(x.time);}).sort();
  const outTimes=row.events.filter(function(x){return x.type==='下班'&&x.time;}).map(function(x){return String(x.time);}).sort();
  if(inTimes.length)row.in=inTimes[0];if(outTimes.length)row.out=outTimes[outTimes.length-1];
  const info=attendanceSegmentInfo_(row.events);row.segmentCount=info.segments.length;row.completedSegments=info.completed;row.openSegment=!!info.openSegment;row.workMinutes=info.totalMinutes;
  if(!row.status||row.status==='雲端即時打卡'||row.status==='已上班'||row.status==='已完成'||/^已完成 \d+ 段$/.test(String(row.status||''))||/^第 \d+ 段工作中$/.test(String(row.status||'')))row.status=info.openSegment?('第 '+info.openSegment.index+' 段工作中'):(info.completed>1?('已完成 '+info.completed+' 段'):(info.completed===1?'已完成':'尚未上班'));
  row.live=true;
  rows.sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''));});
  snapshot.attendanceRecent=rows.slice(0,31);snapshot.summary=snapshot.summary||{};snapshot.summary.attendanceDays=snapshot.attendanceRecent.length;snapshot.liveAttendanceMergedAt=isoNow_();
  return snapshot;
}

function portalData_(p) {
  const employee=sessionEmployee_(p.sessionToken);
  if(!employee)return {ok:false,message:'登入已逾時，請重新登入'};
  const snapshot=portalSnapshot_(employee.id)||{employeeId:employee.id,profile:{employeeId:employee.id,name:employee.name||employee.id,department:employee.department||''},attendanceRecent:[],leave:{rules:[],balances:{},annualLeave:{}},requests:[],summary:{}};
  const merged={},base=Array.isArray(snapshot.requests)?snapshot.requests:[],cloud=portalRequestsForEmployee_(employee.id);
  base.concat(cloud).forEach(function(x){if(!x||typeof x!=='object')return;const id=String(x.requestId||'');if(!id)return;merged[id]=Object.assign({},merged[id]||{},x);});
  snapshot.requests=Object.keys(merged).map(function(k){return merged[k];}).sort(function(a,b){return String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''));}).slice(0,80);
  mergeCloudTodayAttendance_(snapshot, employee.id);
  return {ok:true,version:BRIDGE_VERSION,employee:{id:employee.id,name:employee.name||employee.id,department:employee.department||''},portal:snapshot,serverNow:isoNow_()};
}

function validDate_(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));}
function timeMinutes_(v){const m=/^(\d{2}):(\d{2})$/.exec(String(v||''));if(!m)return null;const h=Number(m[1]),n=Number(m[2]);return h>=0&&h<24&&n>=0&&n<60?h*60+n:null;}
function validatePortalPayload_(payload){
  const kind=String(payload&&payload.requestKind||'').trim();
  const date=String(payload&& (payload.date||payload.startDate) ||'').trim();
  if(['preleave','leave','punch_correction','overtime','work_completion'].indexOf(kind)<0)return '目前員工自助中心只接受預排休假、請假、補卡、加班與工作完成回報';
  if(!validDate_(date))return '請填寫有效日期';
  if(kind==='preleave'){
    if(['預排例假日','預排休息日'].indexOf(String(payload.preScheduleType||payload.requestType||''))<0)return '預排類型必須為預排例假日或預排休息日';
  }
  if(kind==='leave'){
    const unit=String(payload.unit||'day');
    if(!String(payload.leaveTypeCode||'').trim())return '請選擇假別';
    if(['parental_leave_daily','parental_leave_long'].indexOf(String(payload.leaveTypeCode||''))>=0&&!validDate_(payload.childBirthDate))return '育嬰留職停薪請填寫子女出生日期';
    if(String(payload.leaveTypeCode||'')==='parental_leave_long'&&!String(payload.insuranceChoice||'').trim())return '長期育嬰留職停薪請選擇保險處理方式';
    if(unit==='calendar_range'){
      if(!validDate_(payload.endDate))return '請填寫有效的請假結束日期';
      if(String(payload.endDate)<String(payload.startDate||payload.date||''))return '請假結束日期不可早於開始日期';
    }else if(unit!=='fixed_calendar_days'){
      const q=Number(payload.quantity);if(!isFinite(q)||q<=0||q>365)return '請假數量必須大於 0 且不可超過 365';
    }
  }
  if(kind==='punch_correction'){
    const t=String(payload.missingPunchType||'');if(['上班','下班','上下班'].indexOf(t)<0)return '補卡類型不正確';
    const i=timeMinutes_(payload.requestedInTime),o=timeMinutes_(payload.requestedOutTime);
    if(t!=='下班'&&i===null)return '請填寫有效的上班補卡時間';
    if(t!=='上班'&&o===null)return '請填寫有效的下班補卡時間';
    if(t==='上下班'&&o<=i)return '上下班補卡時，下班時間必須晚於上班時間';
    if(!String(payload.reason||'').trim())return '補卡請填寫原因';
  }
  if(kind==='overtime'){
    const s=timeMinutes_(payload.startTime),e=timeMinutes_(payload.endTime);if(s===null||e===null)return '請填寫有效的加班開始與結束時間';
    let mins=e-s;if(mins<=0)mins+=24*60;const hours=mins/60;if(hours<=0||hours>12)return '單次加班不可超過 12 小時（可跨午夜）';
    if(!String(payload.reason||'').trim())return '請填寫加班原因';
  }
  if(kind==='work_completion'){
    if(!String(payload.completionRecordId||payload.workInstanceId||'').trim())return '工作任務識別資料遺失';
    if(['completed','partial','not_completed'].indexOf(String(payload.completionStatus||''))<0)return '工作完成狀態不正確';
    const pct=Number(payload.completedPercent),hours=Number(payload.actualTaskHours);
    if(!isFinite(pct)||pct<0||pct>100)return '完成比例必須介於 0 到 100';
    if(!isFinite(hours)||hours<0||hours>24)return '實際工時必須介於 0 到 24 小時';
    if(['partial','not_completed'].indexOf(String(payload.completionStatus||''))>=0&&!String(payload.issueReason||'').trim())return '部分完成或未完成請填寫原因';
  }
  return '';
}

function portalRequest_(p) {
  const employee=sessionEmployee_(p.sessionToken);
  if(!employee)return {ok:false,message:'登入已逾時，請重新登入'};
  let payload={};try{payload=JSON.parse(String(p.payloadJson||'{}'));}catch(_e){return {ok:false,message:'申請資料格式不正確'};}
  const kind=String(payload.requestKind||'').trim();
  const validationError=validatePortalPayload_(payload);if(validationError)return {ok:false,message:validationError};
  const date=String(payload.date||payload.startDate||'').trim();
  const lock=LockService.getScriptLock();if(!lock.tryLock(8000))return {ok:false,message:'目前多人同時送申請，請稍後再試'};
  try{
    const now=new Date(),nowIso=isoNow_();
    const rows=portalRequestRows_();
    for(let i=rows.length-1;i>=0;i--){const x=rows[i];if(String(x.employeeId||'')!==String(employee.id||''))continue;const t=Date.parse(String(x.serverCreatedAt||x.createdAt||''));if(isFinite(t)&&(now.getTime()-t)/1000<PORTAL_REQUEST_COOLDOWN_SECONDS)return {ok:false,message:'剛剛已送出一筆申請，請稍候再送，避免重複資料'};break;}
    const requestId='PORTAL-'+kind.toUpperCase()+'-'+String(employee.id||'EMP')+'-'+Utilities.getUuid().replace(/-/g,'').slice(0,16);
    payload.requestId=requestId;
    const sheet=ensureNamedSheet_(spreadsheet_(),PORTAL_REQUEST_SHEET,PORTAL_REQUEST_HEADERS);
    const row={requestId:requestId,employeeId:String(employee.id||''),employeeName:String(employee.name||employee.id||''),requestKind:kind,date:date,payloadJson:JSON.stringify(payload),status:'待同步至主系統',reviewNote:'',createdAt:nowIso,updatedAt:nowIso,serverCreatedAt:nowIso};
    sheet.appendRow(PORTAL_REQUEST_HEADERS.map(function(h){return row[h]===undefined?'':row[h];}));
    return {ok:true,message:'申請已送出，等待單機主系統同步與主管審核',request:{requestId:requestId,requestKind:kind,date:date,payload:payload,status:row.status,createdAt:nowIso,updatedAt:nowIso}};
  }finally{lock.releaseLock();}
}

function exportPortalRequests_(since) {
  const rows=portalRequestRows_().filter(function(x){const st=String(x.status||'');return st==='待同步至主系統'||!since||String(x.updatedAt||x.createdAt||'')>since;}).map(function(x){return {requestId:String(x.requestId||''),employeeId:String(x.employeeId||''),employeeName:String(x.employeeName||''),requestKind:String(x.requestKind||''),date:String(x.date||''),payload:x.payload||{},status:String(x.status||''),reviewNote:String(x.reviewNote||''),createdAt:String(x.createdAt||''),updatedAt:String(x.updatedAt||''),serverCreatedAt:String(x.serverCreatedAt||'')};});
  return {ok:true,requests:rows,count:rows.length,generatedAt:isoNow_()};
}

function syncPortalRequestStatuses_(rawJson) {
  let statuses=[];try{statuses=JSON.parse(rawJson||'[]');}catch(_e){return {ok:false,message:'statusesJson 不是有效 JSON'};}
  if(!Array.isArray(statuses))return {ok:false,message:'statusesJson 必須是陣列'};
  const sheet=ensureNamedSheet_(spreadsheet_(),PORTAL_REQUEST_SHEET,PORTAL_REQUEST_HEADERS);
  const rows=portalRequestRows_();const byId={};rows.forEach(function(x){byId[String(x.requestId||'')]=x;});let updated=0;
  statuses.forEach(function(s){if(!s||typeof s!=='object')return;const row=byId[String(s.requestId||'')];if(!row)return;sheet.getRange(row._row,7).setValue(String(s.status||row.status||''));sheet.getRange(row._row,8).setValue(String(s.reviewNote||''));sheet.getRange(row._row,10).setValue(String(s.updatedAt||s.reviewedAt||isoNow_()));updated++;});
  return {ok:true,updated:updated,received:statuses.length,updatedAt:isoNow_()};
}


function syncPortalPayslips_(rawJson) {
  let rows=[];try{rows=JSON.parse(rawJson||'[]');}catch(_e){return {ok:false,message:'payslipsJson 不是有效 JSON'};}
  if(!Array.isArray(rows))return {ok:false,message:'payslipsJson 必須是陣列'};
  const sheet=ensureNamedSheet_(spreadsheet_(),PORTAL_PAYSLIP_SHEET,PORTAL_PAYSLIP_HEADERS);
  if(sheet.getLastRow()>1)sheet.getRange(2,1,sheet.getLastRow()-1,PORTAL_PAYSLIP_HEADERS.length).clearContent();
  const values=[],now=isoNow_(),seen={};
  rows.forEach(function(x){
    if(!x||typeof x!=='object')return;
    const employeeId=String(x.employeeId||x.empId||'').trim(),month=String(x.month||'').slice(0,7);
    if(!employeeId||!/^[0-9]{4}-[0-9]{2}$/.test(month))return;
    const key=employeeId+'__'+month;if(seen[key])return;seen[key]=true;
    const safe={
      employeeId:employeeId,month:month,empName:String(x.empName||x.employeeName||''),dept:String(x.dept||''),shiftName:String(x.shiftName||''),payType:String(x.payType||''),
      basePay:Number(x.basePay||0),normalHours:Number(x.normalHours||0),overtimeHours:Number(x.overtimeHours||0),overtimePay:Number(x.overtimePay||0),allowance:Number(x.allowance||0),fullBonus:Number(x.fullBonus||0),
      leaveHours:Number(x.leaveHours||0),leaveDeduction:Number(x.leaveDeduction||0),laborInsuranceEmployee:Number(x.laborInsuranceEmployee||0),nhiEmployee:Number(x.nhiEmployee||0),pensionEmployee:Number(x.pensionEmployee||0),insuranceDeduction:Number(x.insuranceDeduction||0),
      correctionTotal:Number(x.correctionTotal||0),gross:Number(x.gross||0),deductions:Number(x.deductions||0),net:Number(x.net||0),warnings:Array.isArray(x.warnings)?x.warnings.slice(0,20):[],generatedAt:String(x.generatedAt||''),lockedAt:String(x.lockedAt||''),source:'locked-payroll'
    };
    values.push([employeeId,month,JSON.stringify(safe),String(x.lockedAt||x.generatedAt||now)]);
  });
  if(values.length)sheet.getRange(2,1,values.length,PORTAL_PAYSLIP_HEADERS.length).setValues(values);
  return {ok:true,count:values.length,updatedAt:now};
}

function portalPayslip_(p) {
  const employee=sessionEmployee_(p.sessionToken);
  if(!employee)return {ok:false,message:'登入已逾時，請重新登入'};
  const pin=String(p.pin||'').trim();
  const current=employees_().find(function(x){return employeeIdEqual_(x.id, employee.id)&&x.active!==false;});
  const guardCache=CacheService.getScriptCache(),guardKey='paypin:'+String(employee.id||'')+':'+String(p.sessionToken||'').slice(0,24),failed=Number(guardCache.get(guardKey)||0);
  if(failed>=5)return {ok:false,message:'薪資查詢 PIN 連續錯誤次數過多，請 10 分鐘後再試或重新登入'};
  if(!current||!/^[0-9]{6}$/.test(pin)||String(current.pin||'')!==pin){guardCache.put(guardKey,String(failed+1),600);return {ok:false,message:'薪資查詢 PIN 不正確；請重新輸入本人 6 位 PIN'};}
  guardCache.remove(guardKey);
  const month=String(p.month||'').slice(0,7);if(!/^[0-9]{4}-[0-9]{2}$/.test(month))return {ok:false,message:'請選擇有效薪資月份'};
  const sheet=ensureNamedSheet_(spreadsheet_(),PORTAL_PAYSLIP_SHEET,PORTAL_PAYSLIP_HEADERS);
  const last=sheet.getLastRow();if(last<2)return {ok:false,message:'目前沒有已發布的正式薪資單'};
  const values=sheet.getRange(2,1,last-1,PORTAL_PAYSLIP_HEADERS.length).getValues();
  for(let i=values.length-1;i>=0;i--){
    if(!employeeIdEqual_(values[i][0],employee.id)||String(values[i][1]||'')!==month)continue;
    let slip={};try{slip=JSON.parse(String(values[i][2]||'{}'));}catch(_e){return {ok:false,message:'薪資單資料格式錯誤，請通知主管重新同步'};}
    return {ok:true,employeeId:String(employee.id||''),month:month,payslip:slip,serverNow:isoNow_(),security:'本人有效 Session＋再次輸入 6 位 PIN'};
  }
  return {ok:false,message:'這個月份尚未發布正式薪資單；請等待主管完成月結鎖定與同步'};
}

function punch_(p) {
  const employee = sessionEmployee_(p.sessionToken);
  if (!employee) return {ok:false, message:'登入已逾時，請重新登入'};
  const type = String(p.type || '');
  if (type !== '上班' && type !== '下班') return {ok:false, message:'打卡類型不正確'};
  if (String(p.photoConfirmed || '') !== '1') return {ok:false, message:'必須先完成即時自拍'};
  if (String(p.lineShared || '') !== '1') return {ok:false, message:'必須先確認照片已傳到 LINE 群組'};
  const recordId = String(p.recordId || '').trim();
  if (!recordId) return {ok:false, message:'recordId 不可空白'};

  // 注意：本 API 不接受／不保存自拍照片內容，只保存打卡文字欄位與照片完成狀態。
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return {ok:false, message:'目前多人同時打卡，請稍後再試'};
  try {
    const ss = spreadsheet_();
    const sheet = ensureSheet_(ss);
    const existing = findRecord_(sheet, recordId);
    if (existing) return {ok:true, duplicate:true, message:'此筆打卡已存在，未重複新增', record:existing};

    const now = new Date();
    const recent = findRecentPunch_(sheet, String(employee.id || ''), type, now);
    if (recent) return {ok:true, duplicate:true, rateLimited:true, message:recent.message, record:recent.record};

    const date = Utilities.formatDate(now, TAIPEI_TZ, 'yyyy-MM-dd');
    const todayEvents=todayEmployeePunchEvents_(sheet,String(employee.id||''),date),sequence=attendanceSegmentInfo_(todayEvents);
    if(type!==sequence.nextType){
      if(sequence.openSegment)return {ok:false,message:'目前第 '+sequence.openSegment.index+' 段已上班但尚未下班，請先完成下班打卡'};
      return {ok:false,message:sequence.completed?'今天上一段已完成；若再次回場請先按「再次上班」，不能直接下班':'今天尚未上班，請先完成上班打卡'};
    }
    const segmentNo=sequence.openSegment?sequence.openSegment.index:(sequence.completed+1);
    const time = Utilities.formatDate(now, TAIPEI_TZ, 'HH:mm:ss');
    const dateTime = Utilities.formatDate(now, TAIPEI_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
    const locationLabel = String(p.locationLabel || '').slice(0, 500);
    const record = {
      recordId:recordId,
      employeeId:String(employee.id||''),
      employeeName:String(employee.name||employee.id||''),
      type:type,
      date:date,
      time:time,
      dateTime:dateTime,
      latitude:numberOrBlank_(p.latitude),
      longitude:numberOrBlank_(p.longitude),
      accuracyM:numberOrBlank_(p.accuracyM),
      locationLabel:locationLabel,
      photoConfirmed:true,
      photoTakenAtClient:String(p.photoTakenAtClient||''),
      lineShared:true,
      lineShareMethod:String(p.lineShareMethod||''),
      serverCreatedAt:dateTime,
      segmentNo:segmentNo
    };
    sheet.appendRow(HEADERS.map(function(h){return record[h] === undefined ? '' : record[h];}));
    return {ok:true, duplicate:false, message:'第 '+segmentNo+' 段'+type+'打卡成功', segmentNo:segmentNo, record:record};
  } finally {
    lock.releaseLock();
  }
}

function findRecentPunch_(sheet, employeeId, type, now) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const headers = sheet.getRange(1,1,1,HEADERS.length).getValues()[0].map(String);
  const start = Math.max(2, last - 199);
  const values = sheet.getRange(start,1,last-start+1,HEADERS.length).getValues();
  for (let i=values.length-1;i>=0;i--) {
    const row=values[i], obj={};headers.forEach(function(h,j){obj[h]=row[j];});
    if (!employeeIdEqual_(obj.employeeId, employeeId)) continue;
    const stamp = String(obj.serverCreatedAt || obj.dateTime || '');
    const ms = Date.parse(stamp);
    if (!isFinite(ms)) continue;
    const diff = (now.getTime()-ms)/1000;
    if (diff < 0) continue;
    if (String(obj.type||'') === type && diff < PUNCH_SAME_TYPE_COOLDOWN_SECONDS) {
      obj.photoConfirmed = String(obj.photoConfirmed).toLowerCase()==='true' || obj.photoConfirmed===true;
      obj.lineShared = String(obj.lineShared).toLowerCase()==='true' || obj.lineShared===true;
      return {message:'相同類型打卡在 3 分鐘內已存在，系統未重複新增',record:obj};
    }
    if (diff < PUNCH_ANY_COOLDOWN_SECONDS) {
      obj.photoConfirmed = String(obj.photoConfirmed).toLowerCase()==='true' || obj.photoConfirmed===true;
      obj.lineShared = String(obj.lineShared).toLowerCase()==='true' || obj.lineShared===true;
      return {message:'30 秒內已有打卡紀錄，系統未重複新增',record:obj};
    }
    if (diff >= PUNCH_SAME_TYPE_COOLDOWN_SECONDS) break;
  }
  return null;
}

function exportRecords_(since) {
  const sheet = ensureSheet_(spreadsheet_());
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return {ok:true, records:[], count:0, generatedAt:isoNow_()};
  const headers = values[0].map(String);
  const rows = values.slice(1).map(function(row){
    const obj={};headers.forEach(function(h,i){obj[h]=row[i];});
    obj.photoConfirmed = String(obj.photoConfirmed).toLowerCase()==='true' || obj.photoConfirmed===true;
    obj.lineShared = String(obj.lineShared).toLowerCase()==='true' || obj.lineShared===true;
    return obj;
  }).filter(function(r){return !since || String(r.serverCreatedAt||r.dateTime||'') > since;});
  return {ok:true, records:rows, count:rows.length, generatedAt:isoNow_()};
}

function findRecord_(sheet, recordId) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const match = sheet.getRange(2,1,last-1,1).createTextFinder(recordId).matchEntireCell(true).findNext();
  if (!match) return null;
  const row = sheet.getRange(match.getRow(),1,1,HEADERS.length).getValues()[0];
  const out={};HEADERS.forEach(function(h,i){out[h]=row[i];});
  out.photoConfirmed = String(out.photoConfirmed).toLowerCase()==='true' || out.photoConfirmed===true;
  out.lineShared = String(out.lineShared).toLowerCase()==='true' || out.lineShared===true;
  return out;
}

function syncEmployees_(rawJson) {
  let rows = [];
  try { rows = JSON.parse(rawJson || '[]'); } catch (_e) { return {ok:false, message:'employeesJson 不是有效 JSON'}; }
  if (!Array.isArray(rows)) return {ok:false, message:'employeesJson 必須是陣列'};
  if (rows.length > 300) return {ok:false, message:'員工筆數超過 300，請檢查資料'};
  const seen = {};
  const cleaned = [];
  for (let i=0;i<rows.length;i++) {
    const x = rows[i] || {};
    const id = String(x.id || '').trim();
    const pin = String(x.pin || '').trim();
    const idKey = employeeIdKey_(id);
    if (!id) return {ok:false, message:'第 '+(i+1)+' 筆缺少員工編號'};
    if (seen[idKey]) return {ok:false, message:'員工編號重複（英文大小寫視為相同）：'+id};
    if (!/^\d{6}$/.test(pin)) return {ok:false, message:'員工 '+id+' 的 PIN 必須是 6 位數字'};
    seen[idKey] = true;
    cleaned.push({
      id:id,
      name:String(x.name || id).slice(0,100),
      department:String(x.department || '').slice(0,100),
      pin:pin,
      active:x.active !== false
    });
  }
  PropertiesService.getScriptProperties().setProperty('EMPLOYEES_JSON', JSON.stringify(cleaned));
  return {ok:true, count:cleaned.length, updatedAt:isoNow_()};
}

function employees_() {
  const raw = PropertiesService.getScriptProperties().getProperty('EMPLOYEES_JSON') || '[]';
  let rows=[];try{rows=JSON.parse(raw);}catch(_e){}
  return Array.isArray(rows)?rows:[];
}

function isInitialized_() {
  const props = PropertiesService.getScriptProperties();
  return !!(props.getProperty('SHEET_ID') && props.getProperty('SYNC_KEY'));
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('尚未初始化；請在 Apps Script 編輯器先執行 SETUP_ATTENDANCE_BRIDGE');
  return SpreadsheetApp.openById(id);
}

function ensureSheet_(ss) {
  let sheet = ss.getSheetByName(ATTENDANCE_SHEET);
  if (!sheet) sheet = ss.insertSheet(ATTENDANCE_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureNamedSheet_(ss,name,headers) {
  let sheet=ss.getSheetByName(name);
  if(!sheet)sheet=ss.insertSheet(name);
  if(sheet.getLastRow()===0){sheet.appendRow(headers);sheet.setFrozenRows(1);}
  return sheet;
}

function numberOrBlank_(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = Number(value);return isFinite(n)?n:'';
}

function isoNow_() {
  return Utilities.formatDate(new Date(), TAIPEI_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function bridgeHtml_(payload) {
  payload.channel = 'wts-attendance-bridge';
  const json = JSON.stringify(payload).replace(/</g,'\\u003c');
  const script = '<!doctype html><meta charset="utf-8"><script>' +
    'var m=' + json + ';' +
    'try{window.top.postMessage(m,"*");}catch(e){}' +
    'try{if(window.parent&&window.parent!==window.top){window.parent.postMessage(m,"*");}}catch(e){}' +
    '</scr' + 'ipt>';
  return HtmlService.createHtmlOutput(script)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

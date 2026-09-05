/**
 * W433 FIX369 CLEAN｜王泰山畜牧場員工自助中心｜15 天登入 Session＋WebAuthn＋班表／工作項目
 *
 * 第一次設定只需要：
 * 1. 將本檔完整貼到 Apps Script 的 Code.gs
 * 2. Ctrl+S / Cmd+S 儲存
 * 3. 上方函式選單執行 SETUP_ATTENDANCE_BRIDGE
 * 4. 再執行 SHOW_SYNC_KEY 查看同步金鑰
 */

const BRIDGE_VERSION = 'W433_FIX369_CLEAN';
const PUNCH_ANY_COOLDOWN_SECONDS = 30;
const PUNCH_SAME_TYPE_COOLDOWN_SECONDS = 180;
const ATTENDANCE_SHEET = 'Attendance';
const TAIPEI_TZ = 'Asia/Taipei';
// FIX369｜登入後固定保留 15 天；不能只用 CacheService，因其不適合長天期登入。
const SESSION_DAYS = 15;
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const SESSION_SHEET = 'EmployeeSessions';
const SESSION_HEADERS = ['tokenHash','employeeId','pinHash','issuedAt','expiresAt','lastUsedAt','revokedAt','loginMethod','deviceName'];
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
const PORTAL_WORK_PLAN_SHEET = 'EmployeeWorkPlan';
const PORTAL_WORK_PLAN_HEADERS = ['month','payloadJson','updatedAt'];

// FIX369｜快速登入：真正 WebAuthn 驗簽 + 選用手勢登入。
const BIOMETRIC_DEVICE_SHEET = 'EmployeeBiometricDevices';
const BIOMETRIC_DEVICE_HEADERS = ['credentialId','employeeId','deviceName','publicKeySpki','signCount','active','createdAt','lastUsedAt','revokedAt','origin','rpId','transports'];
const GESTURE_DEVICE_SHEET = 'EmployeeGestureDevices';
const GESTURE_DEVICE_HEADERS = ['deviceId','employeeId','deviceName','salt','gestureHash','active','createdAt','lastUsedAt','revokedAt'];
const WEBAUTHN_RP_ID = 'zinrow2005-cell.github.io';
const WEBAUTHN_ALLOWED_ORIGINS = ['https://zinrow2005-cell.github.io'];
const WEBAUTHN_CHALLENGE_SECONDS = 300;
const LOGIN_DEVICE_LIMIT_PER_EMPLOYEE = 5;

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
    timezone: TAIPEI_TZ,
    sessionDays: SESSION_DAYS
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
  ensureNamedSheet_(ss, BIOMETRIC_DEVICE_SHEET, BIOMETRIC_DEVICE_HEADERS);
  ensureNamedSheet_(ss, GESTURE_DEVICE_SHEET, GESTURE_DEVICE_HEADERS);
  ensureNamedSheet_(ss, SESSION_SHEET, SESSION_HEADERS);

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
      sessionDays:SESSION_DAYS,
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
      return bridgeHtml_({ok:true, requestId:requestId, service:'WTS attendance bridge', version:BRIDGE_VERSION, initialized:isInitialized_(), timezone:TAIPEI_TZ, sessionDays:SESSION_DAYS, now:isoNow_()});
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
    if (action === 'syncPortalWorkPlan') {
      if (!managerSyncKeyOk_(p.syncKey)) return json_({ok:false, message:'syncKey 不正確'});
      return json_(syncPortalWorkPlan_(String(p.workPlanJson || '{}')));
    }
    if (action === 'managerListLoginDevices') {
      if (!managerSyncKeyOk_(p.syncKey)) return json_({ok:false, message:'syncKey 不正確'});
      return json_(managerListLoginDevices_());
    }
    if (action === 'managerRevokeLoginDevice') {
      if (!managerSyncKeyOk_(p.syncKey)) return json_({ok:false, message:'syncKey 不正確'});
      return json_(managerRevokeLoginDevice_(p));
    }
    if (action === 'biometricRegisterBegin') return bridgeHtml_(Object.assign({requestId:requestId}, biometricRegisterBegin_(p)));
    if (action === 'biometricRegisterFinish') return bridgeHtml_(Object.assign({requestId:requestId}, biometricRegisterFinish_(p)));
    if (action === 'biometricLoginBegin') return bridgeHtml_(Object.assign({requestId:requestId}, biometricLoginBegin_(p)));
    if (action === 'biometricLoginFinish') return bridgeHtml_(Object.assign({requestId:requestId}, biometricLoginFinish_(p)));
    if (action === 'gestureRegister') return bridgeHtml_(Object.assign({requestId:requestId}, gestureRegister_(p)));
    if (action === 'gestureLogin') return bridgeHtml_(Object.assign({requestId:requestId}, gestureLogin_(p)));
    if (action === 'loginDevices') return bridgeHtml_(Object.assign({requestId:requestId}, loginDevices_(p)));
    if (action === 'loginDeviceRevoke') return bridgeHtml_(Object.assign({requestId:requestId}, loginDeviceRevoke_(p)));
    if (action === 'sessionCheck') return bridgeHtml_(Object.assign({requestId:requestId}, sessionCheck_(p)));
    if (action === 'logout') return bridgeHtml_(Object.assign({requestId:requestId}, logout_(p)));
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

function employeePinHash_(employee) {
  return sha256Hex_('employee-pin|'+employeeIdKey_(employee && employee.id)+'|'+String(employee && employee.pin || ''));
}

function sessionTokenHash_(token) {
  const key=String(token||'').trim();
  return key ? sha256Hex_('employee-session|'+key) : '';
}

function sessionStore_() {
  return sheetRowsObjects_(SESSION_SHEET, SESSION_HEADERS);
}

function sessionRowByToken_(token) {
  const hash=sessionTokenHash_(token);
  if(!hash)return null;
  const store=sessionStore_();
  return store.rows.find(function(x){return String(x.tokenHash||'')===hash;})||null;
}

function revokeSessionToken_(token, reason) {
  const row=sessionRowByToken_(token);
  if(!row || String(row.revokedAt||''))return false;
  const store=ensureNamedSheet_(spreadsheet_(),SESSION_SHEET,SESSION_HEADERS);
  const col=SESSION_HEADERS.indexOf('revokedAt')+1;
  store.getRange(row._row,col).setValue(isoNow_()+(reason?' | '+String(reason).slice(0,100):''));
  return true;
}

function revokeEmployeeSessions_(employeeId, reason) {
  const store=sessionStore_(), col=SESSION_HEADERS.indexOf('revokedAt')+1, now=isoNow_();
  let count=0;
  store.rows.forEach(function(row){
    if(employeeIdEqual_(row.employeeId,employeeId) && !String(row.revokedAt||'')){
      store.sheet.getRange(row._row,col).setValue(now+(reason?' | '+String(reason).slice(0,100):''));
      count++;
    }
  });
  return count;
}

function cleanupExpiredSessions_() {
  const store=sessionStore_(), nowMs=Date.now(), revCol=SESSION_HEADERS.indexOf('revokedAt')+1;
  let count=0;
  store.rows.forEach(function(row){
    if(String(row.revokedAt||''))return;
    const exp=Date.parse(String(row.expiresAt||''));
    if(!Number.isFinite(exp) || exp<=nowMs){
      store.sheet.getRange(row._row,revCol).setValue(isoNow_()+' | expired');
      count++;
    }
  });
  return count;
}

function sessionEmployee_(token) {
  const row=sessionRowByToken_(token);
  if(!row || String(row.revokedAt||''))return null;
  const exp=Date.parse(String(row.expiresAt||''));
  if(!Number.isFinite(exp) || exp<=Date.now()){revokeSessionToken_(token,'expired');return null;}
  // Every session use rechecks that the employee still exists, is active, and still has the same PIN generation.
  const current=employees_().find(function(x){return employeeIdEqual_(x.id,row.employeeId)&&x.active!==false;});
  if(!current){revokeSessionToken_(token,'employee inactive or missing');return null;}
  if(String(row.pinHash||'')!==employeePinHash_(current)){revokeSessionToken_(token,'PIN changed');return null;}
  return {id:current.id,name:current.name||current.id,department:current.department||'',sessionExpiresAt:String(row.expiresAt||'')};
}

function login_(p) {
  const employeeId = String(p.employeeId || '').trim();
  const pin = String(p.pin || '').trim();
  if (!employeeId || !pin) return {ok:false, message:'請輸入員工編號與 PIN'};
  const employee = employees_().find(function(x){return employeeIdEqual_(x.id, employeeId) && x.active!==false;});
  if (!employee || String(employee.pin || '') !== pin) return {ok:false, message:'員工編號或 PIN 不正確'};
  return Object.assign(newSessionForEmployee_(employee,'pin',String(p.deviceName||'')), {loginMethod:'pin'});
}


// ---------- FIX369 Login devices / WebAuthn ----------
function newSessionForEmployee_(employee, loginMethod, deviceName) {
  cleanupExpiredSessions_();
  const token=Utilities.getUuid()+Utilities.getUuid();
  const issued=new Date(), expires=new Date(issued.getTime()+SESSION_SECONDS*1000);
  const row=[
    sessionTokenHash_(token),
    String(employee.id||''),
    employeePinHash_(employee),
    issued.toISOString(),
    expires.toISOString(),
    issued.toISOString(),
    '',
    String(loginMethod||'pin').slice(0,30),
    String(deviceName||'').slice(0,80)
  ];
  ensureNamedSheet_(spreadsheet_(),SESSION_SHEET,SESSION_HEADERS).appendRow(row);
  return {
    ok:true,
    sessionToken:token,
    sessionExpiresAt:expires.toISOString(),
    sessionDays:SESSION_DAYS,
    employee:{id:employee.id,name:employee.name||employee.id,department:employee.department||''}
  };
}

function sessionCheck_(p) {
  const employee=sessionEmployee_(p.sessionToken);
  if(!employee)return {ok:false,message:'登入已逾時或已失效，請重新登入'};
  const row=sessionRowByToken_(p.sessionToken);
  return {
    ok:true,
    employee:{id:employee.id,name:employee.name||employee.id,department:employee.department||''},
    sessionExpiresAt:String(row&&row.expiresAt||employee.sessionExpiresAt||''),
    sessionDays:SESSION_DAYS
  };
}

function logout_(p) {
  const token=String(p.sessionToken||'').trim();
  if(token)revokeSessionToken_(token,'employee logout');
  return {ok:true,message:'已登出'};
}

function base64UrlEncodeBytes_(bytes) {
  return Utilities.base64EncodeWebSafe((bytes||[]).map(function(x){x=Number(x)&255;return x>127?x-256:x;})).replace(/=+$/,'');
}
function base64UrlDecodeBytes_(text) {
  let s=String(text||'').replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4)s+='=';
  return Utilities.base64Decode(s).map(function(x){return Number(x)&255;});
}
function sha256Bytes_(value) {
  const bytes=Array.isArray(value)?value.map(function(x){x=Number(x)&255;return x>127?x-256:x;}):Utilities.newBlob(String(value||'')).getBytes();
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(function(x){return Number(x)&255;});
}
function sha256Hex_(text) { return sha256Bytes_(String(text||'')).map(function(x){return ('0'+x.toString(16)).slice(-2);}).join(''); }
function randomChallenge_() { return base64UrlEncodeBytes_(sha256Bytes_(Utilities.getUuid()+'|'+Utilities.getUuid()+'|'+new Date().getTime()+'|'+Math.random())); }
function challengePut_(kind, data) { const id=Utilities.getUuid().replace(/-/g,''); CacheService.getScriptCache().put('wa:'+kind+':'+id,JSON.stringify(data),WEBAUTHN_CHALLENGE_SECONDS); return id; }
function challengeTake_(kind,id) { const cache=CacheService.getScriptCache(),key='wa:'+kind+':'+String(id||''); const raw=cache.get(key); if(!raw)return null; cache.remove(key); try{return JSON.parse(raw);}catch(_e){return null;} }
function allowedWebAuthnOrigin_(origin) { return WEBAUTHN_ALLOWED_ORIGINS.indexOf(String(origin||''))>=0; }
function byteArraysEqual_(a,b){if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=((a[i]&255)^(b[i]&255));return d===0;}
function parseClientData_(b64){const bytes=base64UrlDecodeBytes_(b64);let text='';try{text=Utilities.newBlob(bytes.map(function(x){return x>127?x-256:x;})).getDataAsString('UTF-8');}catch(_e){throw new Error('clientDataJSON 無法解析');}let obj;try{obj=JSON.parse(text);}catch(_e){throw new Error('clientDataJSON 不是有效 JSON');}return {bytes:bytes,obj:obj};}
function authDataCheck_(b64,rpId){const bytes=base64UrlDecodeBytes_(b64);if(bytes.length<37)throw new Error('authenticatorData 長度不足');const expected=sha256Bytes_(rpId),actual=bytes.slice(0,32);if(!byteArraysEqual_(expected,actual))throw new Error('快速登入網站識別不一致');const flags=bytes[32]&255;if((flags&0x01)===0)throw new Error('未確認使用者存在');if((flags&0x04)===0)throw new Error('未完成裝置生物辨識／螢幕鎖驗證');const signCount=((bytes[33]&255)*16777216)+((bytes[34]&255)<<16)+((bytes[35]&255)<<8)+(bytes[36]&255);return {bytes:bytes,flags:flags,signCount:signCount};}
function employeeById_(employeeId){return employees_().find(function(x){return employeeIdEqual_(x.id,employeeId)&&x.active!==false;})||null;}
function sheetRowsObjects_(name,headers){const sh=ensureNamedSheet_(spreadsheet_(),name,headers),last=sh.getLastRow();if(last<2)return {sheet:sh,rows:[]};const vals=sh.getRange(2,1,last-1,headers.length).getValues();return {sheet:sh,rows:vals.map(function(v,i){const o={_row:i+2};headers.forEach(function(h,j){o[h]=v[j];});return o;})};}
function activeBiometricDevices_(employeeId){return sheetRowsObjects_(BIOMETRIC_DEVICE_SHEET,BIOMETRIC_DEVICE_HEADERS).rows.filter(function(x){return employeeIdEqual_(x.employeeId,employeeId)&&String(x.active).toLowerCase()!=='false'&&x.active!==false&&!String(x.revokedAt||'');});}
function activeGestureDevices_(employeeId){return sheetRowsObjects_(GESTURE_DEVICE_SHEET,GESTURE_DEVICE_HEADERS).rows.filter(function(x){return employeeIdEqual_(x.employeeId,employeeId)&&String(x.active).toLowerCase()!=='false'&&x.active!==false&&!String(x.revokedAt||'');});}
function normalizeDeviceName_(v){const s=String(v||'這台裝置').replace(/[<>]/g,'').trim().slice(0,60);return s||'這台裝置';}
function safeTransports_(value){let a=[];try{a=Array.isArray(value)?value:JSON.parse(String(value||'[]'));}catch(_e){}return (Array.isArray(a)?a:[]).map(function(x){return String(x||'').slice(0,20);}).filter(Boolean).slice(0,8);}

function biometricRegisterBegin_(p){
  const employee=sessionEmployee_(p.sessionToken);if(!employee)return {ok:false,message:'登入已逾時，請先用員工編號＋PIN 重新登入'};
  if(typeof BigInt!=='function')return {ok:false,message:'目前 Apps Script 執行環境不支援 WebAuthn 驗簽，請確認 appsscript.json 使用 V8 runtime'};
  const current=activeBiometricDevices_(employee.id);if(current.length>=LOGIN_DEVICE_LIMIT_PER_EMPLOYEE)return {ok:false,message:'此員工已綁定 '+current.length+' 個生物辨識裝置；請先撤銷不用的裝置'};
  const challenge=randomChallenge_(),challengeId=challengePut_('reg',{employeeId:employee.id,challenge:challenge,rpId:WEBAUTHN_RP_ID,origin:WEBAUTHN_ALLOWED_ORIGINS[0]});
  const userId=base64UrlEncodeBytes_(sha256Bytes_('WTS-EMP|'+employeeIdKey_(employee.id)).slice(0,24));
  return {ok:true,challengeId:challengeId,challenge:challenge,rpId:WEBAUTHN_RP_ID,rpName:'王泰山畜牧場',userId:userId,userName:String(employee.id||''),displayName:String(employee.name||employee.id||''),excludeCredentials:current.map(function(x){return {id:String(x.credentialId||''),transports:safeTransports_(x.transports)};})};
}

function biometricRegisterFinish_(p){
  const employee=sessionEmployee_(p.sessionToken);if(!employee)return {ok:false,message:'登入已逾時，請重新登入'};
  const ch=challengeTake_('reg',p.challengeId);if(!ch||!employeeIdEqual_(ch.employeeId,employee.id))return {ok:false,message:'生物辨識註冊已逾時，請重新開始'};
  const client=parseClientData_(p.clientDataJSON),cd=client.obj;if(String(cd.type||'')!=='webauthn.create'||String(cd.challenge||'')!==String(ch.challenge||''))return {ok:false,message:'生物辨識註冊 challenge 驗證失敗'};
  if(!allowedWebAuthnOrigin_(cd.origin))return {ok:false,message:'此生物辨識憑證不是從正式 GitHub 員工端建立'};
  const ad=authDataCheck_(p.authenticatorData,WEBAUTHN_RP_ID),credentialId=String(p.credentialId||'').trim(),spki=String(p.publicKeySpki||'').trim();
  if(!credentialId||credentialId.length>1500||!spki||spki.length>3000)return {ok:false,message:'生物辨識公開金鑰資料不完整'};
  try{const q=extractP256PublicKey_(base64UrlDecodeBytes_(spki));if(!p256PointOnCurve_(q.x,q.y))throw new Error('curve');}catch(_e){return {ok:false,message:'只支援手機／電腦平台驗證器的 P-256 生物辨識憑證'};}
  const store=sheetRowsObjects_(BIOMETRIC_DEVICE_SHEET,BIOMETRIC_DEVICE_HEADERS),now=isoNow_(),transports=JSON.stringify(safeTransports_(p.transports));
  let existing=store.rows.find(function(x){return String(x.credentialId||'')===credentialId;});
  const values=[credentialId,String(employee.id||''),normalizeDeviceName_(p.deviceName),spki,Number(ad.signCount||0),true,existing?String(existing.createdAt||now):now,now,'',String(cd.origin||''),WEBAUTHN_RP_ID,transports];
  if(existing)store.sheet.getRange(existing._row,1,1,BIOMETRIC_DEVICE_HEADERS.length).setValues([values]);else store.sheet.appendRow(values);
  return {ok:true,message:'已在這台裝置啟用 Face ID／Touch ID／指紋快速登入',device:{authType:'biometric',deviceId:credentialId,deviceName:normalizeDeviceName_(p.deviceName),createdAt:existing?String(existing.createdAt||now):now,lastUsedAt:now}};
}

function biometricLoginBegin_(p){
  const employee=employeeById_(p.employeeId);if(!employee)return {ok:false,message:'員工編號不存在或目前已停用'};
  const devices=activeBiometricDevices_(employee.id);if(!devices.length)return {ok:false,message:'這個員工尚未啟用生物辨識快速登入；請先用 6 位 PIN 登入後到「登入安全」啟用'};
  const challenge=randomChallenge_(),challengeId=challengePut_('login',{employeeId:employee.id,challenge:challenge,rpId:WEBAUTHN_RP_ID});
  return {ok:true,challengeId:challengeId,challenge:challenge,rpId:WEBAUTHN_RP_ID,allowCredentials:devices.map(function(x){return {id:String(x.credentialId||''),transports:safeTransports_(x.transports)};})};
}

function biometricLoginFinish_(p){
  const ch=challengeTake_('login',p.challengeId);if(!ch)return {ok:false,message:'生物辨識登入已逾時，請重新操作'};
  const employee=employeeById_(ch.employeeId);if(!employee)return {ok:false,message:'員工帳號目前不可登入'};
  const credentialId=String(p.credentialId||'').trim(),store=sheetRowsObjects_(BIOMETRIC_DEVICE_SHEET,BIOMETRIC_DEVICE_HEADERS),device=store.rows.find(function(x){return String(x.credentialId||'')===credentialId&&employeeIdEqual_(x.employeeId,employee.id)&&String(x.active).toLowerCase()!=='false'&&!String(x.revokedAt||'');});
  if(!device)return {ok:false,message:'此快速登入裝置已撤銷或不屬於這位員工'};
  const client=parseClientData_(p.clientDataJSON),cd=client.obj;if(String(cd.type||'')!=='webauthn.get'||String(cd.challenge||'')!==String(ch.challenge||''))return {ok:false,message:'生物辨識登入 challenge 驗證失敗'};
  if(!allowedWebAuthnOrigin_(cd.origin))return {ok:false,message:'生物辨識登入來源不是正式 GitHub 員工端'};
  const ad=authDataCheck_(p.authenticatorData,WEBAUTHN_RP_ID),clientHash=sha256Bytes_(client.bytes),signedBytes=ad.bytes.concat(clientHash),messageHash=sha256Bytes_(signedBytes);
  let verified=false;try{verified=verifyP256Ecdsa_(base64UrlDecodeBytes_(String(device.publicKeySpki||'')),base64UrlDecodeBytes_(String(p.signature||'')),messageHash);}catch(_e){verified=false;}
  if(!verified)return {ok:false,message:'生物辨識簽章驗證失敗，請改用 PIN 登入或重新綁定此裝置'};
  const oldCount=Number(device.signCount||0),newCount=Number(ad.signCount||0);if(oldCount>0&&newCount>0&&newCount<=oldCount)return {ok:false,message:'生物辨識計數器異常，為安全起見已拒絕登入；請用 PIN 重新綁定'};
  store.sheet.getRange(device._row,5,1,4).setValues([[Math.max(oldCount,newCount),true,String(device.createdAt||isoNow_()),isoNow_()]]);
  return Object.assign(newSessionForEmployee_(employee,'biometric',String(device.deviceName||'這台裝置')),{loginMethod:'biometric',deviceName:String(device.deviceName||'這台裝置')});
}

function gesturePatternValid_(pattern){const parts=String(pattern||'').split('-').filter(Boolean);if(parts.length<5||parts.length>9)return false;const seen={};for(let i=0;i<parts.length;i++){if(!/^[0-8]$/.test(parts[i])||seen[parts[i]])return false;seen[parts[i]]=true;}return true;}
function gestureDigest_(employeeId,deviceId,salt,pattern){return sha256Hex_(String(salt||'')+'|'+employeeIdKey_(employeeId)+'|'+String(deviceId||'')+'|'+String(pattern||''));}
function gestureRegister_(p){
  const employee=sessionEmployee_(p.sessionToken);if(!employee)return {ok:false,message:'登入已逾時，請先用 PIN 重新登入'};
  const pattern=String(p.pattern||''),deviceId=String(p.deviceId||'').trim();if(!gesturePatternValid_(pattern))return {ok:false,message:'手勢至少連續 5 個不同圓點，且不可重複'};if(!/^[A-Za-z0-9_-]{12,120}$/.test(deviceId))return {ok:false,message:'手勢裝置識別不正確'};
  const store=sheetRowsObjects_(GESTURE_DEVICE_SHEET,GESTURE_DEVICE_HEADERS),active=activeGestureDevices_(employee.id);let existing=store.rows.find(function(x){return String(x.deviceId||'')===deviceId&&employeeIdEqual_(x.employeeId,employee.id);});if(!existing&&active.length>=LOGIN_DEVICE_LIMIT_PER_EMPLOYEE)return {ok:false,message:'此員工已設定太多手勢登入裝置，請先撤銷不用的裝置'};
  const salt=makeSyncKey_().slice(0,64),now=isoNow_(),values=[deviceId,String(employee.id||''),normalizeDeviceName_(p.deviceName),salt,gestureDigest_(employee.id,deviceId,salt,pattern),true,existing?String(existing.createdAt||now):now,now,''];
  if(existing)store.sheet.getRange(existing._row,1,1,GESTURE_DEVICE_HEADERS.length).setValues([values]);else store.sheet.appendRow(values);
  return {ok:true,message:'已在這台裝置啟用手勢快速登入',device:{authType:'gesture',deviceId:deviceId,deviceName:normalizeDeviceName_(p.deviceName),createdAt:existing?String(existing.createdAt||now):now,lastUsedAt:now}};
}
function constantTimeTextEqual_(a,b){a=String(a||'');b=String(b||'');if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
function gestureLogin_(p){
  const employee=employeeById_(p.employeeId),deviceId=String(p.deviceId||'').trim(),pattern=String(p.pattern||'');if(!employee||!deviceId)return {ok:false,message:'這台裝置尚未設定手勢登入'};
  const cache=CacheService.getScriptCache(),guardKey='gesturefail:'+employeeIdKey_(employee.id)+':'+deviceId.slice(0,32),failed=Number(cache.get(guardKey)||0);if(failed>=5)return {ok:false,message:'手勢連續錯誤次數過多，請 10 分鐘後再試或改用 PIN'};
  const store=sheetRowsObjects_(GESTURE_DEVICE_SHEET,GESTURE_DEVICE_HEADERS),device=store.rows.find(function(x){return String(x.deviceId||'')===deviceId&&employeeIdEqual_(x.employeeId,employee.id)&&String(x.active).toLowerCase()!=='false'&&!String(x.revokedAt||'');});
  if(!device||!gesturePatternValid_(pattern)||!constantTimeTextEqual_(gestureDigest_(employee.id,deviceId,device.salt,pattern),device.gestureHash)){cache.put(guardKey,String(failed+1),600);return {ok:false,message:'手勢不正確；可改用 6 位 PIN 登入'};}
  cache.remove(guardKey);store.sheet.getRange(device._row,8).setValue(isoNow_());return Object.assign(newSessionForEmployee_(employee,'gesture',String(device.deviceName||'這台裝置')),{loginMethod:'gesture',deviceName:String(device.deviceName||'這台裝置')});
}

function loginDeviceObjectsForEmployee_(employeeId){
  const bio=sheetRowsObjects_(BIOMETRIC_DEVICE_SHEET,BIOMETRIC_DEVICE_HEADERS).rows.filter(function(x){return employeeIdEqual_(x.employeeId,employeeId);}).map(function(x){return {authType:'biometric',deviceId:String(x.credentialId||''),employeeId:String(x.employeeId||''),deviceName:String(x.deviceName||''),active:String(x.active).toLowerCase()!=='false'&&x.active!==false&&!String(x.revokedAt||''),createdAt:String(x.createdAt||''),lastUsedAt:String(x.lastUsedAt||''),revokedAt:String(x.revokedAt||'')};});
  const ges=sheetRowsObjects_(GESTURE_DEVICE_SHEET,GESTURE_DEVICE_HEADERS).rows.filter(function(x){return employeeIdEqual_(x.employeeId,employeeId);}).map(function(x){return {authType:'gesture',deviceId:String(x.deviceId||''),employeeId:String(x.employeeId||''),deviceName:String(x.deviceName||''),active:String(x.active).toLowerCase()!=='false'&&x.active!==false&&!String(x.revokedAt||''),createdAt:String(x.createdAt||''),lastUsedAt:String(x.lastUsedAt||''),revokedAt:String(x.revokedAt||'')};});
  return bio.concat(ges).sort(function(a,b){return String(b.lastUsedAt||b.createdAt||'').localeCompare(String(a.lastUsedAt||a.createdAt||''));});
}
function loginDevices_(p){const employee=sessionEmployee_(p.sessionToken);if(!employee)return {ok:false,message:'登入已逾時，請重新登入'};return {ok:true,devices:loginDeviceObjectsForEmployee_(employee.id),webauthnRpId:WEBAUTHN_RP_ID};}
function revokeDeviceRecord_(authType,deviceId,employeeId){const isBio=authType==='biometric',name=isBio?BIOMETRIC_DEVICE_SHEET:GESTURE_DEVICE_SHEET,headers=isBio?BIOMETRIC_DEVICE_HEADERS:GESTURE_DEVICE_HEADERS,key=isBio?'credentialId':'deviceId',store=sheetRowsObjects_(name,headers),row=store.rows.find(function(x){return String(x[key]||'')===String(deviceId||'')&&(!employeeId||employeeIdEqual_(x.employeeId,employeeId));});if(!row)return false;const activeCol=headers.indexOf('active')+1,revCol=headers.indexOf('revokedAt')+1;store.sheet.getRange(row._row,activeCol).setValue(false);store.sheet.getRange(row._row,revCol).setValue(isoNow_());return true;}
function loginDeviceRevoke_(p){const employee=sessionEmployee_(p.sessionToken);if(!employee)return {ok:false,message:'登入已逾時，請重新登入'};const type=String(p.authType||''),id=String(p.deviceId||'');if(['biometric','gesture'].indexOf(type)<0||!id)return {ok:false,message:'裝置資料不完整'};const ok=revokeDeviceRecord_(type,id,employee.id);if(ok){revokeEmployeeSessions_(employee.id,'login device revoked');return {ok:true,message:'已撤銷這個快速登入裝置；目前 15 天登入狀態也已失效',sessionRevoked:true};}return {ok:false,message:'找不到這個裝置或已撤銷'};}
function managerListLoginDevices_(){const emps=employees_(),names={};emps.forEach(function(e){names[employeeIdKey_(e.id)]=String(e.name||e.id||'');});const rows=[];sheetRowsObjects_(BIOMETRIC_DEVICE_SHEET,BIOMETRIC_DEVICE_HEADERS).rows.forEach(function(x){rows.push({authType:'biometric',deviceId:String(x.credentialId||''),employeeId:String(x.employeeId||''),employeeName:names[employeeIdKey_(x.employeeId)]||String(x.employeeId||''),deviceName:String(x.deviceName||''),active:String(x.active).toLowerCase()!=='false'&&x.active!==false&&!String(x.revokedAt||''),createdAt:String(x.createdAt||''),lastUsedAt:String(x.lastUsedAt||''),revokedAt:String(x.revokedAt||'')});});sheetRowsObjects_(GESTURE_DEVICE_SHEET,GESTURE_DEVICE_HEADERS).rows.forEach(function(x){rows.push({authType:'gesture',deviceId:String(x.deviceId||''),employeeId:String(x.employeeId||''),employeeName:names[employeeIdKey_(x.employeeId)]||String(x.employeeId||''),deviceName:String(x.deviceName||''),active:String(x.active).toLowerCase()!=='false'&&x.active!==false&&!String(x.revokedAt||''),createdAt:String(x.createdAt||''),lastUsedAt:String(x.lastUsedAt||''),revokedAt:String(x.revokedAt||'')});});rows.sort(function(a,b){return String(b.lastUsedAt||b.createdAt||'').localeCompare(String(a.lastUsedAt||a.createdAt||''));});return {ok:true,devices:rows,count:rows.length,generatedAt:isoNow_()};}
function managerRevokeLoginDevice_(p){const type=String(p.authType||''),id=String(p.deviceId||''),employeeId=String(p.employeeId||'');if(['biometric','gesture'].indexOf(type)<0||!id)return {ok:false,message:'裝置資料不完整'};const ok=revokeDeviceRecord_(type,id,employeeId);if(ok){const sessions=revokeEmployeeSessions_(employeeId,'manager revoked login device');return {ok:true,message:'快速登入裝置已由主系統撤銷',revokedSessions:sessions};}return {ok:false,message:'找不到裝置或已撤銷'};}
function revokeEmployeeLoginDevices_(employeeId,reason){const list=loginDeviceObjectsForEmployee_(employeeId);let n=0;list.forEach(function(d){if(d.active&&revokeDeviceRecord_(d.authType,d.deviceId,employeeId))n++;});return n;}

// --- P-256 ECDSA verifier for Apps Script V8 (no WebCrypto / SubtleCrypto needed) ---
const P256_P_=BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
const P256_A_=((BigInt(-3)%P256_P_)+P256_P_)%P256_P_;
const P256_B_=BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b');
const P256_N_=BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const P256_GX_=BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296');
const P256_GY_=BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5');
const P256_INF_={X:BigInt(0),Y:BigInt(1),Z:BigInt(0)};
function p256Mod_(x,m){x=x%m;return x>=BigInt(0)?x:x+m;}
function p256Inv_(a,m){a=p256Mod_(a,m);if(a===BigInt(0))throw new Error('inverse zero');let t=BigInt(0),nt=BigInt(1),r=m,nr=a;while(nr!==BigInt(0)){const q=r/nr,tmpT=t-q*nt,tmpR=r-q*nr;t=nt;nt=tmpT;r=nr;nr=tmpR;}if(r!==BigInt(1))throw new Error('not invertible');return p256Mod_(t,m);}
function p256Inf_(P){return P.Z===BigInt(0);}
function p256Double_(P){if(p256Inf_(P)||P.Y===BigInt(0))return P256_INF_;const X=P.X,Y=P.Y,Z=P.Z,XX=p256Mod_(X*X,P256_P_),YY=p256Mod_(Y*Y,P256_P_),YYYY=p256Mod_(YY*YY,P256_P_),ZZ=p256Mod_(Z*Z,P256_P_),S=p256Mod_(BigInt(2)*(p256Mod_((X+YY)*(X+YY),P256_P_)-XX-YYYY),P256_P_),M=p256Mod_(BigInt(3)*XX+P256_A_*p256Mod_(ZZ*ZZ,P256_P_),P256_P_),T=p256Mod_(M*M-BigInt(2)*S,P256_P_),X3=T,Y3=p256Mod_(M*(S-T)-BigInt(8)*YYYY,P256_P_),Z3=p256Mod_((Y+Z)*(Y+Z)-YY-ZZ,P256_P_);return {X:X3,Y:Y3,Z:Z3};}
function p256Add_(P1,P2){if(p256Inf_(P1))return P2;if(p256Inf_(P2))return P1;const X1=P1.X,Y1=P1.Y,Z1=P1.Z,X2=P2.X,Y2=P2.Y,Z2=P2.Z,Z1Z1=p256Mod_(Z1*Z1,P256_P_),Z2Z2=p256Mod_(Z2*Z2,P256_P_),U1=p256Mod_(X1*Z2Z2,P256_P_),U2=p256Mod_(X2*Z1Z1,P256_P_),S1=p256Mod_(Y1*Z2*Z2Z2,P256_P_),S2=p256Mod_(Y2*Z1*Z1Z1,P256_P_);if(U1===U2){if(S1!==S2)return P256_INF_;return p256Double_(P1);}const H=p256Mod_(U2-U1,P256_P_),I=p256Mod_((BigInt(2)*H)*(BigInt(2)*H),P256_P_),J=p256Mod_(H*I,P256_P_),r=p256Mod_(BigInt(2)*(S2-S1),P256_P_),V=p256Mod_(U1*I,P256_P_),X3=p256Mod_(r*r-J-BigInt(2)*V,P256_P_),Y3=p256Mod_(r*(V-X3)-BigInt(2)*S1*J,P256_P_),Z3=p256Mod_(((Z1+Z2)*(Z1+Z2)-Z1Z1-Z2Z2)*H,P256_P_);return {X:X3,Y:Y3,Z:Z3};}
function p256Mul_(P,k){let n=p256Mod_(k,P256_N_),R=P256_INF_,Q=P;while(n>BigInt(0)){if((n&BigInt(1))===BigInt(1))R=p256Add_(R,Q);Q=p256Double_(Q);n=n>>BigInt(1);}return R;}
function p256AffineX_(P){if(p256Inf_(P))return null;const zi=p256Inv_(P.Z,P256_P_),z2=p256Mod_(zi*zi,P256_P_);return p256Mod_(P.X*z2,P256_P_);}
function bytesBigInt_(bytes){let x=BigInt(0);(bytes||[]).forEach(function(v){x=(x<<BigInt(8))+BigInt(Number(v)&255);});return x;}
function derReadLen_(b,o){let n=b[o++];if((n&128)===0)return {len:n,off:o};const c=n&127;if(c<1||c>4)throw new Error('DER length');n=0;for(let i=0;i<c;i++)n=(n<<8)|(b[o++]&255);return {len:n,off:o};}
function parseDerSignature_(bytes){const b=bytes.map(function(x){return x&255;});let o=0;if(b[o++]!==48)throw new Error('DER sequence');let L=derReadLen_(b,o);o=L.off;if(b[o++]!==2)throw new Error('DER r');L=derReadLen_(b,o);o=L.off;let rb=b.slice(o,o+L.len);o+=L.len;if(b[o++]!==2)throw new Error('DER s');L=derReadLen_(b,o);o=L.off;let sb=b.slice(o,o+L.len);while(rb.length&&rb[0]===0)rb.shift();while(sb.length&&sb[0]===0)sb.shift();return {r:bytesBigInt_(rb),s:bytesBigInt_(sb)};}
function extractP256PublicKey_(spki){const b=spki.map(function(x){return x&255;});for(let i=Math.max(0,b.length-80);i<=b.length-65;i++){if(b[i]===4&&i+65<=b.length){const x=bytesBigInt_(b.slice(i+1,i+33)),y=bytesBigInt_(b.slice(i+33,i+65));if(p256PointOnCurve_(x,y))return {x:x,y:y};}}throw new Error('P-256 SPKI');}
function p256PointOnCurve_(x,y){return x>=BigInt(0)&&x<P256_P_&&y>=BigInt(0)&&y<P256_P_&&p256Mod_(y*y-(x*x*x+P256_A_*x+P256_B_),P256_P_)===BigInt(0);}
function verifyP256Ecdsa_(spki,signature,messageHash){const sig=parseDerSignature_(signature),r=sig.r,s=sig.s;if(r<=BigInt(0)||r>=P256_N_||s<=BigInt(0)||s>=P256_N_)return false;const q=extractP256PublicKey_(spki),z=bytesBigInt_(messageHash),w=p256Inv_(s,P256_N_),u1=p256Mod_(z*w,P256_N_),u2=p256Mod_(r*w,P256_N_),G={X:P256_GX_,Y:P256_GY_,Z:BigInt(1)},Q={X:q.x,Y:q.y,Z:BigInt(1)},R=p256Add_(p256Mul_(G,u1),p256Mul_(Q,u2)),x=p256AffineX_(R);return x!==null&&p256Mod_(x,P256_N_)===r;}

function syncPortalData_(rawJson) {
  let rows=[];
  try { rows=JSON.parse(rawJson || '[]'); } catch (_e) { return {ok:false,message:'portalDataJson 不是有效 JSON'}; }
  if (!Array.isArray(rows)) return {ok:false,message:'portalDataJson 必須是陣列'};
  const sheet=ensureNamedSheet_(spreadsheet_(),PORTAL_SHEET,PORTAL_HEADERS);
  if (sheet.getLastRow()>1) sheet.getRange(2,1,sheet.getLastRow()-1,PORTAL_HEADERS.length).clearContent();
  const values=[];
  const now=isoNow_();
  let scheduleRowsTotal=0;
  const scheduleMonthCounts={};
  const scheduleRowsByEmployee={};
  rows.forEach(function(x){
    if(!x||typeof x!=='object')return;
    const id=String(x.employeeId||'').trim();if(!id)return;
    let stored=x;
    let payload=JSON.stringify(stored);
    if(payload.length>48000){
      const slim=Object.assign({},x);
      if(Array.isArray(slim.attendanceRecent))slim.attendanceRecent=slim.attendanceRecent.slice(0,14);
      if(slim.leave&&slim.leave.ledger&&Array.isArray(slim.leave.ledger.history))slim.leave.ledger.history=slim.leave.ledger.history.slice(0,20);
      if(Array.isArray(slim.requests))slim.requests=slim.requests.slice(0,40);
      if(slim.schedule&&Array.isArray(slim.schedule.rows)){
        const forced=(Array.isArray(slim.schedule.forcedMonths)?slim.schedule.forcedMonths:[]).map(String);
        const must=slim.schedule.rows.filter(function(r){return forced.indexOf(String((r&&r.date)||'').slice(0,7))>=0;});
        const other=slim.schedule.rows.filter(function(r){return forced.indexOf(String((r&&r.date)||'').slice(0,7))<0;}).slice(-62);
        const by={};must.concat(other).forEach(function(r){const k=String((r&&r.employeeId)||id)+'__'+String((r&&r.date)||'').slice(0,10);by[k]=r;});
        slim.schedule=Object.assign({},slim.schedule,{rows:Object.keys(by).map(function(k){return by[k];}).sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));})});
      }
      if(Array.isArray(slim.workTasks))slim.workTasks=slim.workTasks.slice(0,30);
      stored=slim;payload=JSON.stringify(stored);
    }
    const scheduleRows=(stored&&stored.schedule&&Array.isArray(stored.schedule.rows))?stored.schedule.rows:[];
    scheduleRows.forEach(function(r){const m=String((r&&r.date)||'').slice(0,7);if(m)scheduleMonthCounts[m]=(scheduleMonthCounts[m]||0)+1;});
    scheduleRowsByEmployee[id]=scheduleRows.length;
    scheduleRowsTotal+=scheduleRows.length;
    values.push([id,payload,String(x.updatedAt||now)]);
  });
  if(values.length)sheet.getRange(2,1,values.length,PORTAL_HEADERS.length).setValues(values);
  return {ok:true,count:values.length,updatedAt:now,scheduleRows:scheduleRowsTotal,scheduleMonthCounts:scheduleMonthCounts,scheduleRowsByEmployee:scheduleRowsByEmployee};
}

function syncPortalWorkPlan_(rawJson) {
  let plan={};
  try { plan=JSON.parse(rawJson || '{}'); } catch (_e) { return {ok:false,message:'workPlanJson 不是有效 JSON'}; }
  if (!plan || typeof plan!=='object') return {ok:false,message:'workPlanJson 必須是物件'};
  const rows=Array.isArray(plan.rows)?plan.rows:[];
  const months={};
  (Array.isArray(plan.months)?plan.months:[]).forEach(function(x){const m=String((x&&x.month)||'').slice(0,7);if(m)months[m]=true;});
  rows.forEach(function(r){const m=String((r&&(r.date||r.d))||'').slice(0,7);if(m)months[m]=true;});
  const monthList=Object.keys(months).sort();
  const sheet=ensureNamedSheet_(spreadsheet_(),PORTAL_WORK_PLAN_SHEET,PORTAL_WORK_PLAN_HEADERS);
  if (sheet.getLastRow()>1) sheet.getRange(2,1,sheet.getLastRow()-1,PORTAL_WORK_PLAN_HEADERS.length).clearContent();
  const now=isoNow_(),values=[],monthCounts={},tooLarge=[];
  monthList.forEach(function(month){
    const monthRows=rows.filter(function(r){return String((r&&(r.date||r.d))||'').slice(0,7)===month;});
    const payload={version:String(plan.version||'W433_WORK_PLAN_V1'),generatedAt:String(plan.generatedAt||now),timezone:String(plan.timezone||TAIPEI_TZ),month:month,departments:Array.isArray(plan.departments)?plan.departments:[],rows:monthRows,sourceMode:String(plan.sourceMode||''),planningReady:plan.planningReady!==false,note:String(plan.note||'')};
    const text=JSON.stringify(payload);
    if(text.length>48000){tooLarge.push(month);return;}
    values.push([month,text,now]);monthCounts[month]=monthRows.length;
  });
  if(values.length)sheet.getRange(2,1,values.length,PORTAL_WORK_PLAN_HEADERS.length).setValues(values);
  const itemCount=values.reduce(function(n,x){try{return n+(JSON.parse(String(x[1]||'{}')).rows||[]).length;}catch(_e){return n;}},0);
  if(tooLarge.length)return {ok:false,message:'工作項目表月份資料過大，未完整保存：'+tooLarge.join('、'),months:values.map(function(x){return x[0];}),monthCounts:monthCounts,itemCount:itemCount,tooLargeMonths:tooLarge,updatedAt:now};
  return {ok:true,months:values.map(function(x){return x[0];}),monthCounts:monthCounts,itemCount:itemCount,updatedAt:now};
}

function portalWorkPlan_() {
  const sheet=ensureNamedSheet_(spreadsheet_(),PORTAL_WORK_PLAN_SHEET,PORTAL_WORK_PLAN_HEADERS);
  const last=sheet.getLastRow();
  if(last<2)return {version:'W433_WORK_PLAN_V1',generatedAt:'',timezone:TAIPEI_TZ,months:[],departments:[],rows:[],sourceMode:'尚未同步',planningReady:false,note:'主系統尚未同步批次月曆重大工作事項。'};
  const values=sheet.getRange(2,1,last-1,3).getValues(),rows=[],monthMeta=[],depMap={};let generatedAt='',sourceMode='',note='',planningReady=false;
  values.forEach(function(row){
    let p={};try{p=JSON.parse(String(row[1]||'{}'));}catch(_e){p={};}
    const month=String(row[0]||p.month||'').slice(0,7),items=Array.isArray(p.rows)?p.rows:[];
    if(month)monthMeta.push({month:month,itemCount:items.length,criticalCount:items.filter(function(x){return String((x&&(x.importance||x.i))||'')==='critical';}).length});
    items.forEach(function(x){rows.push(x);});
    (Array.isArray(p.departments)?p.departments:[]).forEach(function(d){const id=String((d&&d.id)||'');if(id)depMap[id]=d;});
    if(p.generatedAt)generatedAt=String(p.generatedAt);if(p.sourceMode)sourceMode=String(p.sourceMode);if(p.note)note=String(p.note);if(p.planningReady!==false&&items.length)planningReady=true;
  });
  rows.sort(function(a,b){return String((a&&(a.date||a.d))||'').localeCompare(String((b&&(b.date||b.d))||''));});
  return {version:'W433_WORK_PLAN_V1',generatedAt:generatedAt,timezone:TAIPEI_TZ,months:monthMeta.sort(function(a,b){return a.month.localeCompare(b.month);}),departments:Object.keys(depMap).map(function(k){return depMap[k];}),rows:rows,sourceMode:sourceMode,planningReady:planningReady,note:note};
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
  snapshot.departmentWorkPlan=portalWorkPlan_();
  snapshot.summary=snapshot.summary||{};snapshot.summary.majorWorkItems=(snapshot.departmentWorkPlan.rows||[]).length;
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
  if(['preleave','leave','roster_change','punch_correction','overtime','work_completion'].indexOf(kind)<0)return '目前員工自助中心只接受休假調整、預排休假、請假、補卡、加班與工作完成回報';
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
  if(kind==='roster_change'){
    const fromDate=String(payload.fromDate||payload.date||''),toDate=String(payload.toDate||'');
    if(!validDate_(fromDate)||!validDate_(toDate))return '請選擇有效的原休假日與希望調整日期';
    if(fromDate===toDate)return '原休假日與希望調整日期不可相同';
    if(fromDate.slice(0,7)!==toDate.slice(0,7))return '休假日期調整目前僅支援同一月份內交換';
    if(!String(payload.reason||'').trim())return '請填寫調整休假日期的原因';
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
  const previous=employees_(),prevBy={};previous.forEach(function(x){prevBy[employeeIdKey_(x.id)]=x;});
  let revokedDevices=0,revokedSessions=0;
  cleaned.forEach(function(x){
    const old=prevBy[employeeIdKey_(x.id)];
    if(old&&(String(old.pin||'')!==String(x.pin||'')||(old.active!==false&&x.active===false))){
      revokedDevices+=revokeEmployeeLoginDevices_(x.id,'PIN/status changed');
      revokedSessions+=revokeEmployeeSessions_(x.id,'PIN/status changed');
    }
  });
  const newKeys={};cleaned.forEach(function(x){newKeys[employeeIdKey_(x.id)]=true;});
  previous.forEach(function(old){if(!newKeys[employeeIdKey_(old.id)]){revokedDevices+=revokeEmployeeLoginDevices_(old.id,'employee removed');revokedSessions+=revokeEmployeeSessions_(old.id,'employee removed');}});
  PropertiesService.getScriptProperties().setProperty('EMPLOYEES_JSON', JSON.stringify(cleaned));
  return {ok:true, count:cleaned.length, revokedLoginDevices:revokedDevices, revokedSessions:revokedSessions, updatedAt:isoNow_()};
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

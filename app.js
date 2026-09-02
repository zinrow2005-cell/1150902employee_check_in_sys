(function(){
  'use strict';
  const CFG=window.WTS_ATTENDANCE_CONFIG||{};
  const $=id=>document.getElementById(id);
  const state={employee:null,token:sessionStorage.getItem('wts_att_session')||'',type:'',location:null,locationLabel:'',stream:null,facing:'user',photoBlob:null,photoUrl:'',photoTakenAt:'',lineShared:false,busy:false};
  const pending=new Map();
  const BRIDGE_CHANNEL='wts-attendance-bridge';
  const bridgeReady=()=>/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(String(CFG.bridgeUrl||''));
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
    if(!bridgeReady())return Promise.reject(new Error('雲端橋接網址尚未設定'));
    const requestId=randomId();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('雲端橋接逾時，請確認網路後重試；重送同一筆不會重複記錄。'));},timeoutMs);
      pending.set(requestId,{resolve,reject,timer});
      const form=document.createElement('form');form.method='POST';form.action=CFG.bridgeUrl;form.target='bridgeFrame';form.style.display='none';
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
    renderToday();
  }
  async function login(){
    if(state.busy)return;const id=$('employeeId').value.trim();const pin=$('employeePin').value.trim();
    if(!id||!pin){status($('loginStatus'),'請輸入員工編號與打卡 PIN。','error');return;}
    state.busy=true;$('loginBtn').disabled=true;status($('loginStatus'),'正在驗證員工身分…');
    try{const d=await postBridge('login',{employeeId:id,pin});state.token=d.sessionToken;state.employee=d.employee;sessionStorage.setItem('wts_att_session',state.token);sessionStorage.setItem('wts_att_employee',JSON.stringify(state.employee));localStorage.setItem('wts_att_employee_id',id);$('employeePin').value='';showPunch();}
    catch(e){status($('loginStatus'),e.message,'error');}
    finally{state.busy=false;$('loginBtn').disabled=false;}
  }
  function logout(){cancelFlow();state.token='';state.employee=null;sessionStorage.removeItem('wts_att_session');sessionStorage.removeItem('wts_att_employee');$('punchPanel').hidden=true;$('loginPanel').hidden=false;status($('loginStatus'),'已登出。','ok');}
  function stopCamera(){if(state.stream){state.stream.getTracks().forEach(t=>{try{t.stop()}catch(_e){}});}state.stream=null;const v=$('cameraVideo');if(v){v.srcObject=null;}}
  function clearPhoto(){if(state.photoUrl)URL.revokeObjectURL(state.photoUrl);state.photoUrl='';state.photoBlob=null;state.photoTakenAt='';state.lineShared=false;$('photoPreview').hidden=true;$('cameraVideo').hidden=false;$('faceGuide').hidden=false;$('photoActions').hidden=true;$('lineConfirm').hidden=true;$('submitPunchBtn').hidden=true;$('downloadPhotoLink').hidden=true;}
  function cancelFlow(){stopCamera();clearPhoto();state.type='';state.location=null;state.locationLabel='';$('flowPanel').hidden=true;status($('flowStatus'),'');}
  function beginFlow(type){cancelFlow();state.type=type;$('flowPanel').hidden=false;$('flowTitle').textContent=type+'打卡';$('locationBox').innerHTML='<b>尚未定位</b><span>點「開始定位」取得現在位置與地名。</span>';$('locateBtn').hidden=false;$('cameraWrap').hidden=true;$('cameraActions').hidden=true;completeBefore('gps');$('flowPanel').scrollIntoView({behavior:'smooth',block:'start'});}
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
    try{state.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:state.facing},width:{ideal:1280},height:{ideal:1600}}});const v=$('cameraVideo');v.srcObject=state.stream;v.classList.toggle('mirror',state.facing==='user');$('cameraWrap').hidden=false;$('cameraActions').hidden=false;await v.play();}
    catch(_e){status($('flowStatus'),'無法開啟相機，請確認瀏覽器已允許相機權限。','error');}
  }
  async function switchCamera(){state.facing=state.facing==='user'?'environment':'user';await startCamera();}
  function wrapText(ctx,text,maxWidth){const chars=Array.from(String(text||'')),lines=[];let line='';chars.forEach(ch=>{const test=line+ch;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=ch;}else line=test;});if(line)lines.push(line);return lines.slice(0,3);}
  async function takePhoto(){
    const v=$('cameraVideo');if(!v.videoWidth||!v.videoHeight){status($('flowStatus'),'相機尚未準備完成，請再試一次。','error');return;}
    const c=$('photoCanvas'),max=1440,scale=Math.min(1,max/v.videoWidth),w=Math.round(v.videoWidth*scale),h=Math.round(v.videoHeight*scale);c.width=w;c.height=h;const ctx=c.getContext('2d');
    ctx.save();if(state.facing==='user'){ctx.translate(w,0);ctx.scale(-1,1);}ctx.drawImage(v,0,0,w,h);ctx.restore();
    const now=twParts();state.photoTakenAt=now.dateTime;const bandH=Math.max(150,Math.round(h*.19));ctx.fillStyle='rgba(10,24,15,.72)';ctx.fillRect(0,h-bandH,w,bandH);ctx.fillStyle='#fff';ctx.font=`700 ${Math.max(24,Math.round(w*.035))}px sans-serif`;ctx.fillText(`${CFG.farmName||'王泰山畜牧場'}｜${state.type}打卡`,24,h-bandH+42);ctx.font=`600 ${Math.max(20,Math.round(w*.028))}px sans-serif`;ctx.fillText(`${state.employee?.name||state.employee?.id||'員工'}｜${now.dateTime} 台灣時間`,24,h-bandH+82);ctx.font=`500 ${Math.max(17,Math.round(w*.023))}px sans-serif`;let y=h-bandH+116;wrapText(ctx,state.locationLabel,w-48).forEach(line=>{ctx.fillText(line,24,y);y+=Math.max(23,Math.round(w*.03));});
    const blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',0.86));if(!blob){status($('flowStatus'),'照片建立失敗，請重新拍照。','error');return;}state.photoBlob=blob;state.photoUrl=URL.createObjectURL(blob);$('photoPreview').src=state.photoUrl;$('photoPreview').hidden=false;v.hidden=true;$('faceGuide').hidden=true;$('cameraActions').hidden=true;$('photoActions').hidden=false;stopCamera();setStep('photo','done');setStep('line','active');status($('flowStatus'),'自拍完成。下一步請把這張照片分享至指定 LINE 群組。','ok');
  }
  async function shareLine(){
    if(!state.photoBlob)return;const filename=`WTS_${state.employee?.id||'EMP'}_${state.type}_${twParts().date.replaceAll('-','')}_${Date.now()}.jpg`;const file=new File([state.photoBlob],filename,{type:'image/jpeg'});const text=`${CFG.farmName||'王泰山畜牧場'}｜${state.type}打卡\n${state.employee?.name||state.employee?.id||'員工'}\n${state.photoTakenAt} 台灣時間\n${state.locationLabel}`;
    if(navigator.share&&navigator.canShare?.({files:[file]})){
      try{await navigator.share({title:`${state.type}打卡`,text,files:[file]});state.lineShared=true;$('lineConfirm').hidden=false;$('submitPunchBtn').hidden=false;setStep('line','done');setStep('submit','active');status($('flowStatus'),'LINE 分享程序已完成，正在自動回傳正式打卡時間…','ok');await submitPunch();}
      catch(e){if(e&&e.name!=='AbortError')status($('flowStatus'),'系統分享失敗，可改用下方「下載照片後手動傳 LINE」。','error');}
    }else{
      const a=$('downloadPhotoLink');a.href=state.photoUrl;a.download=filename;a.hidden=false;status($('flowStatus'),'此瀏覽器無法直接分享照片。請下載照片、手動傳到 LINE 群組，再點下方確認。','error');
      if(!$('manualLineBtn')){const b=document.createElement('button');b.id='manualLineBtn';b.type='button';b.className='line-btn';b.textContent='我已手動傳到 LINE 群組';b.addEventListener('click',async()=>{state.lineShared=true;$('lineConfirm').hidden=false;$('submitPunchBtn').hidden=false;setStep('line','done');setStep('submit','active');status($('flowStatus'),'已確認手動 LINE 分享完成，正在自動回傳正式打卡時間…','ok');await submitPunch();});$('photoActions').appendChild(b);}
    }
  }
  function localRecords(){try{return JSON.parse(localStorage.getItem('wts_att_local_records')||'[]')||[]}catch(_e){return[]}}
  function saveLocal(r){const a=localRecords();a.unshift(r);localStorage.setItem('wts_att_local_records',JSON.stringify(a.slice(0,60)));renderToday();}
  function renderToday(){const d=twParts().date,rows=localRecords().filter(r=>r.date===d);$('todayRecords').innerHTML=rows.length?rows.map(r=>`<div class="record"><b>${esc(r.type)}｜${esc(r.time)}｜${esc(r.employeeName||'')}</b><span>${esc(r.locationLabel||'未取得地名')}<br>LINE：${r.lineShared?'已分享':'未確認'}｜來源：雲端橋接</span></div>`).join(''):'<p class="muted">今天尚無本機打卡紀錄。</p>';}
  async function submitPunch(){
    if(state.busy)return;if(CFG.requireGps!==false&&!state.location){status($('flowStatus'),'尚未取得 GPS，不能送出。','error');return;}if(CFG.requireLineShare!==false&&!state.lineShared){status($('flowStatus'),'請先分享自拍到 LINE 群組。','error');return;}
    state.busy=true;$('submitPunchBtn').disabled=true;const recordId=`GH-${state.employee?.id||'EMP'}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;status($('flowStatus'),'正在回傳打卡資料，以雲端台灣時間作為正式時間…');
    try{const d=await postBridge('punch',{sessionToken:state.token,recordId,type:state.type,latitude:state.location?.latitude,longitude:state.location?.longitude,accuracyM:state.location?.accuracyM,locationLabel:state.locationLabel,photoConfirmed:'1',photoTakenAtClient:state.photoTakenAt,lineShared:'1',lineShareMethod:navigator.share?'web-share':'manual'});const r=d.record||{};saveLocal({recordId:r.recordId||recordId,type:r.type||state.type,date:r.date||twParts().date,time:r.time||twParts().time,employeeName:state.employee?.name||'',locationLabel:r.locationLabel||state.locationLabel,lineShared:true});setStep('submit','done');status($('flowStatus'),`${r.type||state.type}打卡成功｜${r.date||''} ${r.time||''}（台灣伺服器時間）`,'ok');$('submitPunchBtn').hidden=true;setTimeout(()=>cancelFlow(),1700);}
    catch(e){status($('flowStatus'),e.message,'error');}
    finally{state.busy=false;$('submitPunchBtn').disabled=false;}
  }
  if(!bridgeReady())$('setupPanel').hidden=false;
  $('loginBtn').addEventListener('click',login);$('employeePin').addEventListener('keydown',e=>{if(e.key==='Enter')login();});$('logoutBtn').addEventListener('click',logout);$('cancelBtn').addEventListener('click',cancelFlow);$('locateBtn').addEventListener('click',locate);$('switchCameraBtn').addEventListener('click',switchCamera);$('takePhotoBtn').addEventListener('click',takePhoto);$('retakeBtn').addEventListener('click',()=>startCamera());$('shareLineBtn').addEventListener('click',shareLine);$('submitPunchBtn').addEventListener('click',submitPunch);document.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click',()=>beginFlow(b.dataset.type)));
  window.addEventListener('pagehide',stopCamera);if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});restoreEmployee();
})();

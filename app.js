(function(){
  'use strict';
  // W412 FIX348：拍照後先完整預覽，確認照片後才進 LINE 分享；沿用雙層防連點／防重複
  const CLIENT_ANY_COOLDOWN_MS=30*1000;
  const CLIENT_SAME_TYPE_COOLDOWN_MS=3*60*1000;
  const LINE_SHARE_COOLDOWN_MS=15*1000;
  const CFG=window.WTS_ATTENDANCE_CONFIG||{};
  const $=id=>document.getElementById(id);
  const state={employee:null,token:sessionStorage.getItem('wts_att_session')||'',type:'',location:null,locationLabel:'',stream:null,facing:'user',photoBlob:null,photoUrl:'',photoTakenAt:'',lineShared:false,lineShareMethod:'',busy:false,cameraStampTimer:null,shareBusy:false,lastShareAttemptAt:0};
  const pending=new Map();
  const BRIDGE_CHANNEL='wts-attendance-bridge';
  const BRIDGE_STORAGE_KEY='wts_att_bridge_url_v344';
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
  let bridgeUrl=bridgeFromQuery();
  if(!bridgeUrl){try{bridgeUrl=normalizeBridgeUrl(localStorage.getItem(BRIDGE_STORAGE_KEY)||'');}catch(_e){localStorage.removeItem(BRIDGE_STORAGE_KEY);bridgeUrl='';}}
  if(!bridgeUrl){try{bridgeUrl=normalizeBridgeUrl(CFG.bridgeUrl||'');}catch(_e){bridgeUrl='';}}
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
  function updateCameraStamp(){const now=twParts();if($('cameraStampFarm'))$('cameraStampFarm').textContent=CFG.farmName||'王泰山畜牧場';if($('cameraStampLocation'))$('cameraStampLocation').textContent=state.locationLabel||'等待定位地址';if($('cameraStampTime'))$('cameraStampTime').textContent=`台灣時間 ${now.date} ${now.time}`;}
  function startCameraStamp(){updateCameraStamp();if(state.cameraStampTimer)clearInterval(state.cameraStampTimer);state.cameraStampTimer=setInterval(updateCameraStamp,1000);if($('cameraStamp'))$('cameraStamp').hidden=false;}
  function stopCamera(){if(state.cameraStampTimer){clearInterval(state.cameraStampTimer);state.cameraStampTimer=null;}if(state.stream){state.stream.getTracks().forEach(t=>{try{t.stop()}catch(_e){}});}state.stream=null;const v=$('cameraVideo');if(v){v.pause?.();v.srcObject=null;}}
  function clearPhoto(){if(state.photoUrl)URL.revokeObjectURL(state.photoUrl);state.photoUrl='';state.photoBlob=null;state.photoTakenAt='';state.lineShared=false;state.lineShareMethod='';state.shareBusy=false;state.lastShareAttemptAt=0;closeConfirm('photoReviewOverlay');closeConfirm('photoConfirmOverlay');closeConfirm('lineResultOverlay');$('photoPreview').hidden=true;$('photoCanvas').hidden=true;$('cameraVideo').hidden=false;$('faceGuide').hidden=false;if($('cameraStamp'))$('cameraStamp').hidden=false;$('photoActions').hidden=true;if($('photoReviewBox'))$('photoReviewBox').hidden=true;$('lineConfirm').hidden=true;$('submitPunchBtn').hidden=true;$('downloadPhotoLink').hidden=true;if($('openLineBtn'))$('openLineBtn').hidden=true;if($('manualLineBtn'))$('manualLineBtn').hidden=true;}
  function cancelFlow(){stopCamera();clearPhoto();state.type='';state.location=null;state.locationLabel='';$('flowPanel').hidden=true;status($('flowStatus'),'');}
  function beginFlow(type){const g=clientPunchGuard(type);if(g.blocked){status($('punchGuardStatus'),g.message,'error');return;}status($('punchGuardStatus'),'','');cancelFlow();state.type=type;$('flowPanel').hidden=false;$('flowTitle').textContent=type+'打卡';$('locationBox').innerHTML='<b>尚未定位</b><span>點「開始定位」取得現在位置與地名。</span>';$('locateBtn').hidden=false;$('cameraWrap').hidden=true;$('cameraActions').hidden=true;completeBefore('gps');$('flowPanel').scrollIntoView({behavior:'smooth',block:'start'});}
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
    try{state.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:state.facing},width:{ideal:1280},height:{ideal:1600}}});const v=$('cameraVideo');v.srcObject=state.stream;v.classList.toggle('mirror',state.facing==='user');v.hidden=false;$('photoCanvas').hidden=true;$('cameraWrap').hidden=false;$('cameraActions').hidden=false;await v.play();startCameraStamp();}
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
  function saveLocal(r){const a=localRecords();a.unshift(r);localStorage.setItem('wts_att_local_records',JSON.stringify(a.slice(0,60)));renderToday();}
  function renderToday(){const d=twParts().date,rows=localRecords().filter(r=>r.date===d);$('todayRecords').innerHTML=rows.length?rows.map(r=>`<div class="record"><b>${esc(r.type)}｜${esc(r.time)}｜${esc(r.employeeName||'')}</b><span>${esc(r.locationLabel||'未取得地名')}<br>LINE：${r.lineShared?'已分享':'未確認'}｜來源：雲端橋接</span></div>`).join(''):'<p class="muted">今天尚無本機打卡紀錄。</p>';}
  async function submitPunch(){
    if(state.busy)return;const guard=clientPunchGuard(state.type);if(guard.blocked){status($('flowStatus'),guard.message,'error');return;}if(CFG.requireGps!==false&&!state.location){status($('flowStatus'),'尚未取得 GPS，不能送出。','error');return;}if(CFG.requireLineShare!==false&&!state.lineShared){status($('flowStatus'),'請先確認自拍照片已傳到 LINE 群組。','error');return;}
    state.busy=true;$('submitPunchBtn').disabled=true;const recordId=`GH-${state.employee?.id||'EMP'}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;status($('flowStatus'),'正在回傳打卡資料，以雲端台灣時間作為正式時間…');
    try{const d=await postBridge('punch',{sessionToken:state.token,recordId,type:state.type,latitude:state.location?.latitude,longitude:state.location?.longitude,accuracyM:state.location?.accuracyM,locationLabel:state.locationLabel,photoConfirmed:'1',photoTakenAtClient:state.photoTakenAt,lineShared:'1',lineShareMethod:state.lineShareMethod||'manual-confirm'});const r=d.record||{};if(d.duplicate)localStorage.setItem(cooldownKey('any'),String(Date.now()));else markClientPunch(state.type);saveLocal({recordId:r.recordId||recordId,type:r.type||state.type,date:r.date||twParts().date,time:r.time||twParts().time,employeeName:state.employee?.name||'',locationLabel:r.locationLabel||state.locationLabel,lineShared:true});setStep('submit','done');status($('flowStatus'),d.duplicate?`短時間內已有打卡紀錄，系統未重複新增｜${r.date||''} ${r.time||''}`:`${r.type||state.type}打卡成功｜${r.date||''} ${r.time||''}（台灣伺服器時間；主系統不含照片）`,'ok');$('submitPunchBtn').hidden=true;setTimeout(()=>cancelFlow(),1700);}
    catch(e){status($('flowStatus'),e.message,'error');}
    finally{state.busy=false;$('submitPunchBtn').disabled=false;}
  }
  function refreshBridgeSetup(){const issue=bridgeConfigIssue();const panel=$('setupPanel');const input=$('bridgeUrlInput');if(input&&!input.matches(':focus'))input.value=bridgeUrl||'';if(issue){panel.hidden=false;const el=$('setupMessage');if(el)el.textContent=issue;status($('loginStatus'),issue,'error');}else{const src=$('bridgeSourceText');if(src)src.textContent='橋接網址已設定在這台裝置。若主系統內附 config.js 也有預設網址，這台裝置的設定會優先使用。';if($('loginStatus').textContent.includes('尚未設定'))status($('loginStatus'),'','');}}

  async function testBridge(){
    if(!bridgeReady()){status($('setupStatus'),bridgeConfigIssue(),'error');return;}
    const btn=$('testBridgeBtn');if(btn)btn.disabled=true;status($('setupStatus'),'正在測試 Apps Script 回傳…');
    try{const d=await postBridge('health',{},10000);status($('setupStatus'),`雲端橋接正常｜${d.now||'已收到 Apps Script 回傳'}`,'ok');}
    catch(e){status($('setupStatus'),e.message||String(e),'error');}
    finally{if(btn)btn.disabled=false;}
  }
  function saveBridgeSetup(){try{const n=normalizeBridgeUrl($('bridgeUrlInput').value);localStorage.setItem(BRIDGE_STORAGE_KEY,n);bridgeUrl=n;status($('setupStatus'),'橋接網址已儲存。現在可以直接登入打卡。','ok');refreshBridgeSetup();setTimeout(()=>{$('setupPanel').hidden=true;},700);}catch(e){status($('setupStatus'),e.message||String(e),'error');}}
  function clearBridgeSetup(){localStorage.removeItem(BRIDGE_STORAGE_KEY);bridgeUrl='';try{bridgeUrl=normalizeBridgeUrl(CFG.bridgeUrl||'');}catch(_e){bridgeUrl='';}status($('setupStatus'),bridgeUrl?'已清除這台裝置的自訂網址，改用 GitHub config.js 預設網址。':'已清除這台裝置的橋接網址。','ok');refreshBridgeSetup();}
  refreshBridgeSetup();
  $('setupToggleBtn').addEventListener('click',()=>{$('setupPanel').hidden=!$('setupPanel').hidden;if(!$('setupPanel').hidden){$('bridgeUrlInput').value=bridgeUrl||'';setTimeout(()=>$('bridgeUrlInput').focus(),50);}});
  $('saveBridgeBtn').addEventListener('click',saveBridgeSetup);$('testBridgeBtn').addEventListener('click',testBridge);$('clearBridgeBtn').addEventListener('click',clearBridgeSetup);$('bridgeUrlInput').addEventListener('keydown',e=>{if(e.key==='Enter')saveBridgeSetup();});
  $('loginBtn').addEventListener('click',login);$('employeePin').addEventListener('keydown',e=>{if(e.key==='Enter')login();});$('logoutBtn').addEventListener('click',logout);$('cancelBtn').addEventListener('click',cancelFlow);$('locateBtn').addEventListener('click',locate);$('switchCameraBtn').addEventListener('click',switchCamera);$('takePhotoBtn').addEventListener('click',takePhoto);$('retakeBtn').addEventListener('click',()=>startCamera());$('shareLineBtn').addEventListener('click',reviewPhotoAndAskLineShare);$('openLineBtn').addEventListener('click',openLineShare);$('manualLineBtn').addEventListener('click',confirmLineShared);$('submitPunchBtn').addEventListener('click',submitPunch);$('photoConfirmYesBtn').addEventListener('click',startConfirmedLineShare);$('photoReviewRetakeBtn').addEventListener('click',retakeFromReview);$('photoReviewUseBtn').addEventListener('click',acceptPhotoFromReview);$('photoConfirmRetakeBtn').addEventListener('click',()=>{closeConfirm('photoConfirmOverlay');startCamera();});$('photoConfirmCancelBtn').addEventListener('click',()=>{closeConfirm('photoConfirmOverlay');showPhotoReviewOverlay();});$('lineResultYesBtn').addEventListener('click',confirmLineShared);$('lineResultRetryBtn').addEventListener('click',()=>{closeConfirm('lineResultOverlay');shareLine();});$('lineResultNoBtn').addEventListener('click',()=>{closeConfirm('lineResultOverlay');status($('flowStatus'),'尚未確認 LINE 分享；本次打卡不會回傳。','');});document.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click',()=>beginFlow(b.dataset.type)));
  window.addEventListener('pagehide',stopCamera);if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});restoreEmployee();
})();

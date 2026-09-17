import { requireSupabase, rememberRoom, recentRooms, esc, isConfigured } from "./supabase.js";

const $=s=>document.querySelector(s);
const msg=$("#homeMessage");
const invite=new URLSearchParams(location.search).get("room");
if(invite) $("#roomCode").value=invite.toUpperCase();

$("#createRoomBtn").addEventListener("click",async()=>{
  msg.textContent="";
  try{
    const sb=requireSupabase();
    const name=$("#createName").value.trim();
    const startingPoints=Number($("#startingPoints").value);
    if(!name) throw new Error("名前を入力してください。");
    const {data,error}=await sb.rpc("mj_create_room",{p_host_name:name,p_starting_points:startingPoints});
    if(error) throw error;
    const row=Array.isArray(data)?data[0]:data;
    rememberRoom(row.room_id,row.room_code,row.host_key,row.member_id,row.member_key);
    location.href=`./room.html?id=${encodeURIComponent(row.room_id)}`;
  }catch(e){msg.textContent=e.message;}
});

$("#joinRoomBtn").addEventListener("click",async()=>{
  msg.textContent="";
  try{
    const sb=requireSupabase();
    const code=$("#roomCode").value.trim().toUpperCase();
    const name=$("#joinName").value.trim();
    if(!code||!name) throw new Error("卓コードと名前を入力してください。");
    const {data,error}=await sb.rpc("mj_join_room",{p_room_code:code,p_name:name});
    if(error) throw error;
    const row=Array.isArray(data)?data[0]:data;
    rememberRoom(row.room_id,code,null,row.member_id,row.member_key);
    location.href=`./room.html?id=${encodeURIComponent(row.room_id)}`;
  }catch(e){msg.textContent=e.message;}
});

function renderRecent(){
  const box=$("#recentRooms"),items=recentRooms();box.innerHTML="";
  if(!items.length){box.innerHTML=`<p class="muted">まだありません。</p>`;return;}
  items.forEach(x=>{
    const a=document.createElement("a");
    a.className="member-pill text-link";
    a.href=`./room.html?id=${encodeURIComponent(x.roomId)}`;
    a.innerHTML=`<span><span class="seat">ROOM</span><br><strong>${esc(x.roomCode)}</strong></span><span>開く →</span>`;
    box.appendChild(a);
  });
}
if(!isConfigured) msg.textContent="Supabase接続前です。config.js を設定してください。";
renderRecent();


/* ---------- QR参加 ---------- */
let qrScanner=null;

function parseInviteQr(text){
  try{
    const u=new URL(text);
    const code=(u.searchParams.get("room")||"").trim().toUpperCase();
    if(!code) throw new Error();
    return code;
  }catch{
    const raw=String(text||"").trim().toUpperCase();
    if(/^[A-Z0-9]{6}$/.test(raw)) return raw;
    throw new Error("この麻雀アプリの招待QRではありません。");
  }
}

async function stopQrScanner(){
  try{await qrScanner?.stop()}catch{}
  try{qrScanner?.destroy()}catch{}
  qrScanner=null;
  const v=$("#qrVideo");
  if(v?.srcObject){
    v.srcObject.getTracks().forEach(t=>t.stop());
    v.srcObject=null;
  }
}

async function handleQrResult(result){
  const raw=typeof result==="string"?result:(result?.data||"");
  const code=parseInviteQr(raw);
  $("#roomCode").value=code;
  $("#qrStatus").textContent=`卓コード ${code} を読み取りました。`;
  await stopQrScanner();
  setTimeout(()=>$("#qrDialog").close(),350);
  $("#joinName").focus();
}

$("#scanQrBtn")?.addEventListener("click",async()=>{
  msg.textContent="";
  $("#qrStatus").textContent="カメラを準備しています…";
  $("#qrDialog").showModal();
  try{
    const mod=await import("https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/+esm");
    const QrScanner=mod.default;
    qrScanner=new QrScanner(
      $("#qrVideo"),
      result=>handleQrResult(result).catch(e=>$("#qrStatus").textContent=e.message),
      {preferredCamera:"environment",highlightScanRegion:true,highlightCodeOutline:true,returnDetailedScanResult:true}
    );
    await qrScanner.start();
    $("#qrStatus").textContent="QRコードを枠の中へ合わせてください。";
  }catch(e){
    $("#qrStatus").textContent="カメラを起動できません。写真から読み取るか、卓コードを入力してください。";
  }
});

$("#closeQrBtn")?.addEventListener("click",async()=>{
  await stopQrScanner();
  $("#qrDialog").close();
});

$("#pickQrImageBtn")?.addEventListener("click",()=>$("#qrImageInput").click());
$("#qrImageInput")?.addEventListener("change",async e=>{
  const file=e.target.files?.[0];
  if(!file) return;
  $("#qrStatus").textContent="画像を読み取っています…";
  try{
    const mod=await import("https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/+esm");
    const QrScanner=mod.default;
    const result=await QrScanner.scanImage(file,{returnDetailedScanResult:true});
    await handleQrResult(result);
  }catch(err){
    $("#qrStatus").textContent="QRコードを読み取れませんでした。";
  }finally{
    e.target.value="";
  }
});

$("#qrDialog")?.addEventListener("close",()=>stopQrScanner());

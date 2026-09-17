import { requireSupabase, rememberRoom, esc } from "./supabase.js";

const sb=requireSupabase();
const $=s=>document.querySelector(s);
let currentUser=null,currentProfile=null,profiles=[],selectedIds=[];
let qrScanner=null;
const inviteCode=(new URLSearchParams(location.search).get("room")||"").trim().toUpperCase();

function msg(id,text){$(id).textContent=text||""}

async function refreshAuth(){
  const {data:{user}}=await sb.auth.getUser();
  currentUser=user||null;
  currentProfile=null;

  if(currentUser){
    const {data}=await sb.from("profiles").select("*").eq("id",currentUser.id).maybeSingle();
    currentProfile=data||null;
  }
  renderAuth();
  await Promise.all([loadProfiles(),loadMyRooms(),loadInvite(),loadMyStats()]);
}

function renderAuth(){
  const logged=!!currentUser;
  $("#loggedOutArea").classList.toggle("hidden",logged);
  $("#loggedInArea").classList.toggle("hidden",!logged);
  $("#createCard").classList.toggle("hidden",!logged);
  $("#myRoomsCard").classList.toggle("hidden",!logged);
  if(logged){
    $("#myDisplayName").textContent=currentProfile?.display_name||"プロフィール";
    $("#myEmail").textContent=currentUser.email||"";
  }
}

$("#showLoginBtn").addEventListener("click",()=>{
  $("#showLoginBtn").classList.add("active");$("#showSignupBtn").classList.remove("active");
  $("#loginArea").classList.remove("hidden");$("#signupArea").classList.add("hidden");msg("#authMessage","");
});
$("#showSignupBtn").addEventListener("click",()=>{
  $("#showSignupBtn").classList.add("active");$("#showLoginBtn").classList.remove("active");
  $("#signupArea").classList.remove("hidden");$("#loginArea").classList.add("hidden");msg("#authMessage","");
});

$("#signupBtn").addEventListener("click",async()=>{
  msg("#authMessage","");
  const display_name=$("#signupName").value.trim(),email=$("#signupEmail").value.trim(),password=$("#signupPassword").value;
  if(!display_name||!email||password.length<6){msg("#authMessage","表示名・メールアドレス・6文字以上のパスワードを入力してください。");return}
  const redirect=`${location.origin}${location.pathname}`;
  const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name},emailRedirectTo:redirect}});
  if(error){msg("#authMessage",error.message);return}
  if(!data.session){
    msg("#authMessage","確認メールを送りました。メール内のリンクを開いてからログインしてください。");
  }else{
    await refreshAuth();
  }
});

$("#loginBtn").addEventListener("click",async()=>{
  msg("#authMessage","");
  const email=$("#loginEmail").value.trim(),password=$("#loginPassword").value;
  const {error}=await sb.auth.signInWithPassword({email,password});
  if(error){msg("#authMessage",error.message);return}
  await refreshAuth();
});

$("#logoutBtn").addEventListener("click",async()=>{
  await sb.auth.signOut();selectedIds=[];await refreshAuth();
});

sb.auth.onAuthStateChange(()=>setTimeout(refreshAuth,0));

async function loadProfiles(){
  const {data,error}=await sb.from("profiles").select("id,display_name,created_at").order("display_name");
  if(error){console.error(error);return}
  profiles=data||[];
  $("#memberCount").textContent=`${profiles.length}人`;
  renderPublicMembers();
  renderCreateMembers();
}

function filtered(q){
  q=(q||"").trim().toLowerCase();
  return q?profiles.filter(p=>p.display_name.toLowerCase().includes(q)):profiles;
}
function memberRow(p,{selectable=false}={}){
  const row=document.createElement("label");
  row.className="account-member-row";
  const checked=selectedIds.includes(p.id);
  row.innerHTML=`
    ${selectable?`<input type="checkbox" ${checked?"checked":""}>`:""}
    <span class="member-avatar">${esc(p.display_name.slice(0,1))}</span>
    <span class="member-main"><strong>${esc(p.display_name)}</strong><small>ID ${p.id.slice(0,6)}</small></span>
    ${p.id===currentUser?.id?'<span class="you-chip">自分</span>':""}`;
  if(selectable){
    const cb=row.querySelector("input");
    cb.addEventListener("change",()=>{
      if(cb.checked){
        if(selectedIds.length>=4){cb.checked=false;return}
        selectedIds.push(p.id);
      }else{
        selectedIds=selectedIds.filter(id=>id!==p.id);
      }
      renderCreateMembers();
    });
  }
  return row;
}
function renderPublicMembers(){
  const box=$("#allMembers");box.innerHTML="";
  filtered($("#memberSearch").value).forEach(p=>box.appendChild(memberRow(p)));
}
function renderCreateMembers(){
  const box=$("#createMemberList");box.innerHTML="";
  if(currentUser && !selectedIds.includes(currentUser.id)) selectedIds=[currentUser.id,...selectedIds].slice(0,4);
  filtered($("#createSearch").value).forEach(p=>box.appendChild(memberRow(p,{selectable:true})));
  $("#selectedCount").textContent=`${selectedIds.length} / 4`;
  $("#createRoomBtn").disabled=selectedIds.length!==4 || !selectedIds.includes(currentUser?.id);
}
$("#memberSearch").addEventListener("input",renderPublicMembers);
$("#createSearch").addEventListener("input",renderCreateMembers);

$("#shuffleSelectionBtn").addEventListener("click",()=>{
  if(selectedIds.length<2)return;
  selectedIds=[...selectedIds].sort(()=>Math.random()-.5);
  renderCreateMembers();
});

$("#createRoomBtn").addEventListener("click",async()=>{
  msg("#createMessage","");
  if(selectedIds.length!==4){msg("#createMessage","4人選択してください。");return}
  const {data,error}=await sb.rpc("mj_create_account_room",{
    p_player_ids:selectedIds,
    p_starting_points:Number($("#startingPoints").value)
  });
  if(error){msg("#createMessage",error.message);return}
  const row=Array.isArray(data)?data[0]:data;
  rememberRoom(row.room_id,row.room_code);
  location.href=`./room.html?id=${encodeURIComponent(row.room_id)}`;
});

async function loadMyRooms(){
  const box=$("#myRooms");box.innerHTML="";
  if(!currentUser){return}
  const {data:memberRows,error}=await sb.from("mj_room_members").select("room_id").eq("user_id",currentUser.id);
  if(error){box.innerHTML=`<p class="message">${esc(error.message)}</p>`;return}
  const ids=[...new Set((memberRows||[]).map(x=>x.room_id))];
  if(!ids.length){box.innerHTML=`<p class="muted">まだ卓はありません。</p>`;return}
  const {data:rooms}=await sb.from("mj_rooms").select("id,room_code,status,created_at").in("id",ids).order("created_at",{ascending:false}).limit(12);
  (rooms||[]).forEach(r=>{
    const a=document.createElement("a");a.className="member-pill text-link";a.href=`./room.html?id=${r.id}`;
    a.innerHTML=`<span><span class="seat">${esc(r.status)}</span><br><strong>${esc(r.room_code)}</strong></span><span>開く →</span>`;
    box.appendChild(a);
  });
}

async function loadInvite(){
  const card=$("#inviteCard");
  if(!inviteCode||!currentUser){card.classList.add("hidden");return}
  const {data:room}=await sb.from("mj_rooms").select("id,room_code,status").eq("room_code",inviteCode).maybeSingle();
  if(!room){card.classList.add("hidden");return}
  const {data:member}=await sb.from("mj_room_members").select("id,name").eq("room_id",room.id).eq("user_id",currentUser.id).maybeSingle();
  if(!member){card.classList.remove("hidden");$("#inviteText").textContent=`卓 ${inviteCode} に招待されていますが、現在のアカウントは参加メンバーに含まれていません。`;$("#openInviteBtn").classList.add("hidden");return}
  card.classList.remove("hidden");$("#openInviteBtn").classList.remove("hidden");
  $("#inviteText").textContent=`${member.name} として卓 ${inviteCode} に参加できます。`;
  $("#openInviteBtn").onclick=()=>{rememberRoom(room.id,room.room_code);location.href=`./room.html?id=${room.id}`};
}

async function loadMyStats(){
  const box=$("#myStats");box.innerHTML="";
  if(!currentUser)return;
  const {data,error}=await sb.from("mj_player_stats").select("*").eq("user_id",currentUser.id).maybeSingle();
  if(error||!data){box.innerHTML=`<span>半荘 0</span><span>総収支 ±0</span>`;return}
  box.innerHTML=`<span>半荘 <strong>${data.games_count}</strong></span><span>平均順位 <strong>${Number(data.avg_rank).toFixed(2)}</strong></span><span>総収支 <strong class="${Number(data.total_delta)>=0?"positive":"negative"}">${Number(data.total_delta)>=0?"+":""}${Number(data.total_delta).toLocaleString()}</strong></span>`;
}

/* QR */
function parseInviteQr(text){
  try{
    const u=new URL(text);const code=(u.searchParams.get("room")||"").trim().toUpperCase();if(!code)throw new Error();return code;
  }catch{
    const raw=String(text||"").trim().toUpperCase();if(/^[A-Z0-9]{6}$/.test(raw))return raw;
    throw new Error("この麻雀アプリの招待QRではありません。");
  }
}
async function stopQrScanner(){
  try{await qrScanner?.stop()}catch{}try{qrScanner?.destroy()}catch{}qrScanner=null;
  const v=$("#qrVideo");if(v?.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}
}
async function handleQrResult(result){
  const code=parseInviteQr(typeof result==="string"?result:(result?.data||""));
  await stopQrScanner();$("#qrDialog").close();
  const url=new URL(location.href);url.searchParams.set("room",code);location.href=url.toString();
}
$("#scanQrBtn").addEventListener("click",async()=>{
  $("#qrStatus").textContent="カメラを準備しています…";$("#qrDialog").showModal();
  try{
    const mod=await import("https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/+esm");
    qrScanner=new mod.default($("#qrVideo"),r=>handleQrResult(r).catch(e=>$("#qrStatus").textContent=e.message),{preferredCamera:"environment",highlightScanRegion:true,returnDetailedScanResult:true});
    await qrScanner.start();$("#qrStatus").textContent="QRコードを枠の中へ合わせてください。";
  }catch{$("#qrStatus").textContent="カメラを起動できません。写真から読み取ってください。";}
});
$("#closeQrBtn").addEventListener("click",async()=>{await stopQrScanner();$("#qrDialog").close()});
$("#pickQrImageBtn").addEventListener("click",()=>$("#qrImageInput").click());
$("#qrImageInput").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{const mod=await import("https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/+esm");const r=await mod.default.scanImage(file,{returnDetailedScanResult:true});await handleQrResult(r)}
  catch{$("#qrStatus").textContent="QRコードを読み取れませんでした。"}finally{e.target.value=""}
});
$("#qrDialog").addEventListener("close",()=>stopQrScanner());

refreshAuth();

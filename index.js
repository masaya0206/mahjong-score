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

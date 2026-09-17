import { requireSupabase, roomSession, rememberRoom, esc } from "./supabase.js";

const $=s=>document.querySelector(s);
const roomId=new URLSearchParams(location.search).get("id");
if(!roomId) location.href="./index.html";

const session=roomSession(roomId);
let room=null,members=[],events=[];
let roomChannel=null,memberChannel=null,eventChannel=null;
const sb=requireSupabase();

function isHost(){ return !!session?.hostKey; }
function roundText(){
  if(!room) return "-";
  const wind = room.round_index<4 ? "東" : "南";
  return `${wind}${(room.round_index%4)+1}局`;
}
function fmt(n){ return Number(n).toLocaleString("ja-JP"); }
function options(){
  return members.map(m=>`<option value="${m.id}">${m.seat_label}・${esc(m.name)}</option>`).join("");
}
async function loadAll(){
  const [{data:r,error:re},{data:m,error:me},{data:e,error:ee}] = await Promise.all([
    sb.from("mj_rooms").select("*").eq("id",roomId).single(),
    sb.from("mj_room_members").select("*").eq("room_id",roomId).order("seat_index"),
    sb.from("mj_score_events").select("*").eq("room_id",roomId).order("created_at",{ascending:false}).limit(20)
  ]);
  if(re) throw re;if(me) throw me;if(ee) throw ee;
  room=r;members=m;events=e;
  if(session) rememberRoom(room.id,room.room_code,session.hostKey||null,session.memberId||null);
  render();
}
function render(){
  $("#roomTitle").textContent=`卓 ${room.room_code}`;
  $("#roomCodeDisplay").textContent=room.room_code;

  const waiting=room.status==="waiting", playing=room.status==="playing", finished=room.status==="finished";
  $("#waitingCard").classList.toggle("hidden",!waiting);
  $("#gameSection").classList.toggle("hidden",!playing);
  $("#finishedCard").classList.toggle("hidden",!finished);
  $("#hostControls").classList.toggle("hidden",!isHost() || !playing);

  if(waiting){
    $("#roundLabel").textContent="WAITING";
    const wb=$("#waitingMembers"); wb.innerHTML="";
    members.forEach(m=>{
      const d=document.createElement("div"); d.className="member-pill";
      d.innerHTML=`<span><span class="seat">${m.seat_label}</span><br><strong>${esc(m.name)}</strong></span><span>${m.seat_index===0?"HOST":"参加"}</span>`;
      wb.appendChild(d);
    });
    $("#startGameBtn").classList.toggle("hidden", !(isHost() && members.length===4));
    drawQr();
  }

  if(playing){
    $("#roundLabel").textContent=roundText();
    $("#roundMini").textContent=roundText().replace("局","");
    $("#honbaLabel").textContent=room.honba;
    $("#riichiLabel").textContent=room.riichi_sticks;

    const board=$("#scoreBoard");board.innerHTML="";
    members.forEach(m=>{
      const c=document.createElement("article");
      c.className=`score-card ${m.seat_index===room.dealer_index?"dealer":""}`;
      c.innerHTML=`<div class="score-head"><div><div class="score-seat">${m.seat_label}${m.seat_index===room.dealer_index?"・親":""}</div><div class="score-name">${esc(m.name)}</div></div></div><div class="score-number">${fmt(m.score)}</div>`;
      board.appendChild(c);
    });

    const html=options();
    ["#ronWinner","#ronLoser","#tsumoWinner","#riichiPlayer","#manualFrom","#manualTo"].forEach(s=>{
      const el=$(s), old=el.value; el.innerHTML=html; if(old) el.value=old;
    });

    const log=$("#eventLog");log.innerHTML="";
    if(!events.length) log.innerHTML=`<p class="muted">まだ操作はありません。</p>`;
    events.forEach(ev=>{
      const d=document.createElement("div");d.className="list-item";
      d.innerHTML=`<strong>${esc(ev.label)}</strong><div class="muted">${new Date(ev.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}</div>`;
      log.appendChild(d);
    });
  }

  if(finished){
    $("#roundLabel").textContent="FINISHED";
    const rank=$("#finalRanking");rank.innerHTML="";
    [...members].sort((a,b)=>b.score-a.score).forEach((m,i)=>{
      const d=document.createElement("div");d.className="rank-row";
      d.innerHTML=`<span class="rank-badge">${i+1}</span><strong>${esc(m.name)}</strong><strong>${fmt(m.score)}</strong>`;
      rank.appendChild(d);
    });
  }
}
async function drawQr(){
  const url=`${location.origin}${location.pathname.replace(/room\.html$/,"index.html")}?room=${encodeURIComponent(room.room_code)}`;
  try{
    const QR = await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm");
    await QR.toCanvas($("#qrCanvas"),url,{width:180,margin:1});
  }catch{
    const ctx=$("#qrCanvas").getContext("2d");ctx.clearRect(0,0,180,180);ctx.font="14px sans-serif";ctx.fillText("QR読み込み失敗",25,90);
  }
}
$("#copyInviteBtn").addEventListener("click",async()=>{
  const url=`${location.origin}${location.pathname.replace(/room\.html$/,"index.html")}?room=${encodeURIComponent(room.room_code)}`;
  try{await navigator.clipboard.writeText(url);$("#copyInviteBtn").textContent="コピーしました";setTimeout(()=>$("#copyInviteBtn").textContent="招待リンクをコピー",1200);}
  catch{prompt("このURLを共有してください",url);}
});
$("#startGameBtn").addEventListener("click",()=>hostRpc("mj_start_room",{}));
$("#riichiBtn").addEventListener("click",()=>hostRpc("mj_riichi",{p_member_id:$("#riichiPlayer").value}));
$("#manualBtn").addEventListener("click",async()=>{
  const from=$("#manualFrom").value,to=$("#manualTo").value,points=Number($("#manualPoints").value);
  if(from===to || !(points>0)) return showMsg("入力を確認してください。");
  await applyEvent("manual",`${nameOf(from)} → ${nameOf(to)} ${fmt(points)}点`,{[from]:-points,[to]:points},"none",false);
});
$("#ronBtn").addEventListener("click",async()=>{
  const w=$("#ronWinner").value,l=$("#ronLoser").value,p=Number($("#ronPoints").value);
  if(w===l || !(p>0)) return showMsg("入力を確認してください。");
  const pot=room.riichi_sticks*1000;
  await applyEvent("ron",`${nameOf(w)} ロン +${fmt(p+pot)}`,{[w]:p+pot,[l]:-p},$("#ronRenchan").checked?"continue":"next",true);
});
$("#tsumoBtn").addEventListener("click",async()=>{
  const w=$("#tsumoWinner").value, child=Number($("#tsumoChild").value), dealerPay=Number($("#tsumoDealer").value);
  if(!(child>0)) return showMsg("支払い点を入力してください。");
  const wi=members.findIndex(x=>x.id===w), isDealer=members[wi].seat_index===room.dealer_index;
  if(!isDealer && !(dealerPay>0)) return showMsg("親の支払い点を入力してください。");
  const deltas={};let gain=room.riichi_sticks*1000;
  members.forEach(m=>{
    if(m.id===w) return;
    const pay=isDealer?child:(m.seat_index===room.dealer_index?dealerPay:child);
    deltas[m.id]=-pay;gain+=pay;
  });
  deltas[w]=gain;
  await applyEvent("tsumo",`${nameOf(w)} ツモ +${fmt(gain)}`,deltas,$("#tsumoRenchan").checked?"continue":"next",true);
});
$("#drawRenchanBtn").addEventListener("click",()=>applyEvent("draw","流局・親連荘",{},"continue",false));
$("#drawNextBtn").addEventListener("click",()=>applyEvent("draw","流局・親流れ",{},"next",false));
$("#nextRoundBtn").addEventListener("click",()=>applyEvent("manual_round","手動で次局",{},"next",false));
$("#undoBtn").addEventListener("click",()=>hostRpc("mj_undo_last",{}));
$("#finishBtn").addEventListener("click",async()=>{
  if(confirm("この半荘を終了しますか？")) await hostRpc("mj_finish_room",{});
});
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));
  document.querySelectorAll(".op-panel").forEach(x=>x.classList.add("hidden"));
  $(`#panel-${b.dataset.panel}`).classList.remove("hidden");
}));
function nameOf(id){return members.find(x=>x.id===id)?.name||""}
function showMsg(t){$("#roomMessage").textContent=t}
async function hostRpc(fn,args){
  showMsg("");
  if(!session?.hostKey) return showMsg("この端末にはホスト権限がありません。");
  const {error}=await sb.rpc(fn,{p_room_id:roomId,p_host_key:session.hostKey,...args});
  if(error) showMsg(error.message);
}
async function applyEvent(type,label,deltas,advance,clearRiichi){
  showMsg("");
  if(!session?.hostKey) return showMsg("この端末にはホスト権限がありません。");
  const {error}=await sb.rpc("mj_apply_event",{
    p_room_id:roomId,p_host_key:session.hostKey,p_event_type:type,p_label:label,
    p_deltas:deltas,p_advance:advance,p_clear_riichi:clearRiichi
  });
  if(error) showMsg(error.message);
}
function subscribe(){
  roomChannel=sb.channel(`room-${roomId}`).on("postgres_changes",{event:"*",schema:"public",table:"mj_rooms",filter:`id=eq.${roomId}`},loadAll).subscribe();
  memberChannel=sb.channel(`members-${roomId}`).on("postgres_changes",{event:"*",schema:"public",table:"mj_room_members",filter:`room_id=eq.${roomId}`},loadAll).subscribe();
  eventChannel=sb.channel(`events-${roomId}`).on("postgres_changes",{event:"*",schema:"public",table:"mj_score_events",filter:`room_id=eq.${roomId}`},loadAll).subscribe();
}
loadAll().then(subscribe).catch(e=>showMsg(e.message));

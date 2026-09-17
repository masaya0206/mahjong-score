import { requireSupabase, roomSession, rememberRoom, esc } from "./supabase.js";

const $=s=>document.querySelector(s);
const roomId=new URLSearchParams(location.search).get("id");
if(!roomId) location.href="./index.html";

const session=roomSession(roomId);
let room=null,members=[],events=[];
let pendingShuffle=null;
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

  const waiting=room.status==="waiting";
  const playing=room.status==="playing";
  const between=room.status==="between_games";
  const finished=room.status==="finished";

  $("#waitingCard").classList.toggle("hidden",!waiting);
  $("#gameSection").classList.toggle("hidden",!playing);
  $("#nextGameCard").classList.toggle("hidden",!between);
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
    const viewerMemberId=session?.memberId || members[0]?.id;
    const viewer=members.find(m=>m.id===viewerMemberId) || members[0];
    const baseSeat=viewer?.seat_index ?? 0;
    const relativePos = (seatIndex)=>{
      const diff=(seatIndex-baseSeat+4)%4;
      return diff===0?"self":diff===1?"right":diff===2?"top":"left";
    };
    const relativeLabel = pos => ({self:"自分",right:"下家",top:"対面",left:"上家"}[pos] || "");

    members.forEach(m=>{
      const pos=relativePos(m.seat_index);
      const c=document.createElement("article");
      c.className=`score-card table-seat pos-${pos} ${m.seat_index===room.dealer_index?"dealer":""} ${m.is_riichi?"riichi":""}`;
      c.innerHTML=`
        <div class="score-head">
          <div>
            <div class="score-seat">${relativeLabel(pos)}・${m.seat_label}${m.seat_index===room.dealer_index?"・親":""}</div>
            <div class="score-name">${esc(m.name)}</div>
          </div>
          ${m.is_riichi?'<span class="riichi-badge">立直</span>':""}
        </div>
        <div class="score-number">${fmt(m.score)}</div>`;
      board.appendChild(c);
    });

    const html=options();
    ["#ronWinner","#ronLoser","#tsumoWinner","#riichiPlayer","#manualFrom","#manualTo"].forEach(s=>{
      const el=$(s), old=el.value; el.innerHTML=html; if(old) el.value=old;
    });
    updateScorePreview();
    updateRiichiPreview();

    const log=$("#eventLog");log.innerHTML="";
    if(!events.length) log.innerHTML=`<p class="muted">まだ操作はありません。</p>`;
    events.forEach(ev=>{
      const d=document.createElement("div");d.className="list-item";
      d.innerHTML=`<strong>${esc(ev.label)}</strong><div class="muted">${new Date(ev.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}</div>`;
      log.appendChild(d);
    });
  }

  if(between){
    $("#roundLabel").textContent="BETWEEN GAMES";
    const completed=Number(room.games_completed||0);
    const starter=Number(room.next_starting_dealer_index||0);
    const seatRoundComplete = completed>0 && completed%4===0;

    $("#nextGameTitle").textContent=`${completed}半荘終了`;
    $("#nextGameMessage").textContent=
      `次の半荘は ${members.find(m=>m.seat_index===starter)?.name||"-"} が最初の親です。`;

    const summary=$("#sessionSummary");
    summary.innerHTML="";
    const totals=[...(room.session_totals||[])];
    if(totals.length){
      totals.sort((a,b)=>Number(b.total)-Number(a.total)).forEach((x,i)=>{
        const d=document.createElement("div");
        d.className="rank-row";
        d.innerHTML=`<span class="rank-badge">${i+1}</span><strong>${esc(x.name)}</strong><strong class="${Number(x.total)>=0?"positive":"negative"}">${Number(x.total)>=0?"+":""}${fmt(x.total)}</strong>`;
        summary.appendChild(d);
      });
    }else{
      summary.innerHTML=`<p class="muted">まだ集計はありません。</p>`;
    }

    $("#seatDecisionArea").classList.toggle("hidden",!seatRoundComplete || !isHost());
    $("#startNextGameBtn").classList.toggle("hidden",seatRoundComplete || !isHost());
    $("#shuffleResultArea").classList.add("hidden");
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
$("#riichiBtn").addEventListener("click",async()=>{
  const memberId=$("#riichiPlayer").value;
  const member=members.find(m=>m.id===memberId);
  if(!member) return showMsg("リーチする人を選択してください。");
  if(member.is_riichi) return showMsg(`${member.name}はこの局ですでにリーチしています。`);
  if(member.score<1000) return showMsg("持ち点が1000点未満のためリーチできません。");
  await hostRpc("mj_riichi",{p_member_id:memberId});
});
$("#manualBtn").addEventListener("click",async()=>{
  const from=$("#manualFrom").value,to=$("#manualTo").value,points=Number($("#manualPoints").value);
  if(from===to || !(points>0)) return showMsg("入力を確認してください。");
  await applyEvent("manual",`${nameOf(from)} → ${nameOf(to)} ${fmt(points)}点`,{[from]:-points,[to]:points},"none",false);
});
function ceil100(n){ return Math.ceil(n/100)*100; }

function basicPoints(han,fu){
  han=Number(han); fu=Number(fu);
  if(han>=13) return 8000;       // 役満
  if(han>=11) return 6000;       // 三倍満
  if(han>=8) return 4000;        // 倍満
  if(han>=6) return 3000;        // 跳満
  if(han===5) return 2000;       // 満貫
  return Math.min(fu * Math.pow(2,han+2), 2000);
}

function calcRon(han,fu,isDealer){
  const basic=basicPoints(han,fu);
  return ceil100(basic*(isDealer?6:4));
}

function calcTsumo(han,fu,isDealer){
  const basic=basicPoints(han,fu);
  if(isDealer){
    return {child:ceil100(basic*2),dealer:0};
  }
  return {child:ceil100(basic),dealer:ceil100(basic*2)};
}

function winnerIsDealer(memberId){
  return members.find(x=>x.id===memberId)?.seat_index===room.dealer_index;
}

function updateScorePreview(){
  if(!room || !members.length) return;

  const rw=$("#ronWinner")?.value;
  if(rw){
    const han=Number($("#ronHan").value), fu=Number($("#ronFu").value);
    const dealer=winnerIsDealer(rw);
    const base=calcRon(han,fu,dealer);
    const honba=room.honba*300;
    $("#ronPreview").textContent=`点数：${fmt(base)}点${honba?` ＋ 本場${fmt(honba)}点`:""}（合計 ${fmt(base+honba)}点）`;
    $("#ronRenchan").checked=dealer;
  }

  const tw=$("#tsumoWinner")?.value;
  if(tw){
    const han=Number($("#tsumoHan").value), fu=Number($("#tsumoFu").value);
    const dealer=winnerIsDealer(tw);
    const pay=calcTsumo(han,fu,dealer);
    const hb=room.honba*100;
    if(dealer){
      $("#tsumoPreview").textContent=`支払い：全員 ${fmt(pay.child+hb)}点${hb?`（本場込み）`:""}`;
    }else{
      $("#tsumoPreview").textContent=`支払い：子 ${fmt(pay.child+hb)}点 / 親 ${fmt(pay.dealer+hb)}点${hb?`（本場込み）`:""}`;
    }
    $("#tsumoRenchan").checked=dealer;
  }
}

$("#ronBtn").addEventListener("click",async()=>{
  const w=$("#ronWinner").value,l=$("#ronLoser").value;
  if(w===l) return showMsg("和了者と放銃者を別にしてください。");

  const han=Number($("#ronHan").value), fu=Number($("#ronFu").value);
  const base=calcRon(han,fu,winnerIsDealer(w));
  const payment=base + room.honba*300;
  const pot=room.riichi_sticks*1000;

  await applyEvent(
    "ron",
    `${nameOf(w)} ${han}翻${fu}符 ロン +${fmt(payment+pot)}`,
    {[w]:payment+pot,[l]:-payment},
    $("#ronRenchan").checked?"continue":"next",
    true
  );
});

$("#tsumoBtn").addEventListener("click",async()=>{
  const w=$("#tsumoWinner").value;
  const han=Number($("#tsumoHan").value), fu=Number($("#tsumoFu").value);
  const isDealer=winnerIsDealer(w);
  const pay=calcTsumo(han,fu,isDealer);
  const honbaEach=room.honba*100;
  const deltas={};
  let gain=room.riichi_sticks*1000;

  members.forEach(m=>{
    if(m.id===w) return;
    const amount=(isDealer ? pay.child : (m.seat_index===room.dealer_index ? pay.dealer : pay.child)) + honbaEach;
    deltas[m.id]=-amount;
    gain+=amount;
  });
  deltas[w]=gain;

  const payText=isDealer
    ? `${fmt(pay.child+honbaEach)}オール`
    : `${fmt(pay.child+honbaEach)} / ${fmt(pay.dealer+honbaEach)}`;

  await applyEvent(
    "tsumo",
    `${nameOf(w)} ${han}翻${fu}符 ツモ ${payText}`,
    deltas,
    $("#tsumoRenchan").checked?"continue":"next",
    true
  );
});

["#ronWinner","#ronHan","#ronFu","#tsumoWinner","#tsumoHan","#tsumoFu"].forEach(s=>{
  $(s)?.addEventListener("change",updateScorePreview);
});
$("#riichiPlayer")?.addEventListener("change",updateRiichiPreview);
$("#drawRenchanBtn").addEventListener("click",()=>applyEvent("draw","流局・親連荘",{},"continue",false));
$("#drawNextBtn").addEventListener("click",()=>applyEvent("draw","流局・親流れ",{},"next",false));
$("#nextRoundBtn").addEventListener("click",()=>applyEvent("manual_round","手動で次局",{},"next",false));
$("#undoBtn").addEventListener("click",()=>hostRpc("mj_undo_last",{}));
$("#finishBtn").addEventListener("click",async()=>{
  if(confirm("この半荘を終了しますか？")) await hostRpc("mj_finish_hand",{p_reason:"manual"});
});
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));
  document.querySelectorAll(".op-panel").forEach(x=>x.classList.add("hidden"));
  $(`#panel-${b.dataset.panel}`).classList.remove("hidden");
}));
function nameOf(id){return members.find(x=>x.id===id)?.name||""}

function updateRiichiPreview(){
  const select=$("#riichiPlayer");
  const button=$("#riichiBtn");
  const help=$("#riichiHelp");
  if(!select || !button || !members.length || !room) return;

  const member=members.find(m=>m.id===select.value) || members[0];
  if(!member) return;

  $("#riichiScorePreview").textContent =
    member.is_riichi ? `${fmt(member.score)}点（立直済）` : `${fmt(member.score)} → ${fmt(member.score-1000)}点`;
  $("#riichiPotPreview").textContent =
    member.is_riichi ? `${room.riichi_sticks}本` : `${room.riichi_sticks} → ${room.riichi_sticks+1}本`;

  if(member.is_riichi){
    help.textContent="この局ですでにリーチしています。";
    button.disabled=true;
    button.textContent="立直済み";
  }else if(member.score<1000){
    help.textContent="持ち点が1000点未満のためリーチできません。";
    button.disabled=true;
    button.textContent="リーチできません";
  }else{
    help.textContent="同じ局では1人1回だけリーチできます。";
    button.disabled=false;
    button.textContent="リーチを確定";
  }
}

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
  if(error){
    showMsg(error.message);
    return;
  }

  // 誰かがマイナスになったらDB側でも自動終了するが、
  // 即時反映を補助するため再読込。
  await loadAll();
}

$("#startNextGameBtn")?.addEventListener("click",()=>hostRpc("mj_start_next_game",{}));

$("#keepSeatsBtn")?.addEventListener("click",async()=>{
  pendingShuffle=null;
  await hostRpc("mj_continue_same_seats",{});
});

function makeShuffle(){
  const shuffled=[...members].sort(()=>Math.random()-.5);
  pendingShuffle=shuffled.map((m,i)=>({member_id:m.id,seat_index:i}));
  const box=$("#shuffleResult");
  box.innerHTML="";
  shuffled.forEach((m,i)=>{
    const label=["東","南","西","北"][i];
    const d=document.createElement("div");
    d.className="member-pill";
    d.innerHTML=`<span><span class="seat">${label}</span><br><strong>${esc(m.name)}</strong></span>`;
    box.appendChild(d);
  });
  $("#shuffleResultArea").classList.remove("hidden");
}

$("#shuffleSeatsBtn")?.addEventListener("click",makeShuffle);
$("#reshuffleBtn")?.addEventListener("click",makeShuffle);

$("#confirmShuffleBtn")?.addEventListener("click",async()=>{
  if(!pendingShuffle) return;
  await hostRpc("mj_apply_seat_shuffle",{p_seats:pendingShuffle});
  pendingShuffle=null;
});

$("#endSessionBtn")?.addEventListener("click",async()=>{
  if(confirm("今日の対局を終了しますか？")) await hostRpc("mj_end_session",{});
});

function subscribe(){
  roomChannel=sb.channel(`room-${roomId}`).on("postgres_changes",{event:"*",schema:"public",table:"mj_rooms",filter:`id=eq.${roomId}`},loadAll).subscribe();
  memberChannel=sb.channel(`members-${roomId}`).on("postgres_changes",{event:"*",schema:"public",table:"mj_room_members",filter:`room_id=eq.${roomId}`},loadAll).subscribe();
  eventChannel=sb.channel(`events-${roomId}`).on("postgres_changes",{event:"*",schema:"public",table:"mj_score_events",filter:`room_id=eq.${roomId}`},loadAll).subscribe();
}
loadAll().then(subscribe).catch(e=>showMsg(e.message));

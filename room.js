import { requireSupabase, roomSession, rememberRoom, esc } from "./supabase.js";

const $=s=>document.querySelector(s);
const roomId=new URLSearchParams(location.search).get("id");
if(!roomId) location.href="./index.html";

const sb=requireSupabase();
const session=roomSession(roomId);
let room=null,members=[],events=[],pendingShuffle=null;
let activeWinnerId=null, winMode="ron", selectedLoserId=null, riichiTargetId=null;
let pressTimer=null, pressStart=null;

function isHost(){return !!session?.hostKey}
function canOperate(){return !!session?.memberId && !!session?.memberKey}
function fmt(n){return Number(n).toLocaleString("ja-JP")}
function nameOf(id){return members.find(m=>m.id===id)?.name||""}
function me(){return members.find(m=>m.id===session?.memberId)||members[0]}
function roundText(){
  const wind=room?.round_index<4?"東":"南";
  return `${wind}${((room?.round_index||0)%4)+1}局`;
}
function memberOptions(){
  return members.map(m=>`<option value="${m.id}">${m.seat_label}・${esc(m.name)}</option>`).join("");
}
function showToast(text){
  const el=$("#roomToast");el.textContent=text;el.classList.remove("hidden");
  clearTimeout(showToast.t);showToast.t=setTimeout(()=>el.classList.add("hidden"),2200);
}
function openDialog(id){const d=$(id);if(d&&!d.open)d.showModal()}
function closeDialog(id){const d=$(id);if(d?.open)d.close()}

async function loadAll(){
  const [{data:r,error:re},{data:m,error:me},{data:e,error:ee}]=await Promise.all([
    sb.from("mj_rooms").select("*").eq("id",roomId).single(),
    sb.from("mj_room_members").select("id,room_id,name,seat_index,seat_label,score,joined_at,is_riichi").eq("room_id",roomId).order("seat_index"),
    sb.from("mj_score_events").select("id,room_id,event_type,label,created_at,operator_name").eq("room_id",roomId).order("created_at",{ascending:false}).limit(40)
  ]);
  if(re) throw re;if(me) throw me;if(ee) throw ee;
  room=r;members=m;events=e;
  if(session) rememberRoom(room.id,room.room_code,session.hostKey||null,session.memberId||null,session.memberKey||null);
  render();
}

function relativePos(seatIndex){
  const viewer=me(),base=viewer?.seat_index??0,diff=(seatIndex-base+4)%4;
  return diff===0?"self":diff===1?"right":diff===2?"top":"left";
}
function relativeLabel(pos){return({self:"自分",right:"下家",top:"対面",left:"上家"}[pos]||"")}

function render(){
  $("#roomTitle").textContent=`卓 ${room.room_code}`;
  $("#roomCodeDisplay").textContent=room.room_code;
  const waiting=room.status==="waiting",playing=room.status==="playing",between=room.status==="between_games",finished=room.status==="finished";

  document.body.classList.toggle("playing-mode",playing);
  $("#pageHeader").classList.toggle("hidden",playing);
  $("#mainShell").classList.toggle("game-shell",playing);

  $("#waitingCard").classList.toggle("hidden",!waiting);
  $("#gameSection").classList.toggle("hidden",!playing);
  $("#nextGameCard").classList.toggle("hidden",!between);
  $("#finishedCard").classList.toggle("hidden",!finished);
  document.querySelectorAll(".host-only").forEach(x=>x.classList.toggle("hidden",!isHost()));

  if(waiting){
    $("#roundLabel").textContent="WAITING";
    const box=$("#waitingMembers");box.innerHTML="";
    members.forEach(m=>{
      const d=document.createElement("div");d.className="member-pill";
      d.innerHTML=`<span><span class="seat">${m.seat_label}</span><br><strong>${esc(m.name)}</strong></span><span>${m.seat_index===0?"HOST":"参加"}</span>`;
      box.appendChild(d);
    });
    $("#startGameBtn").classList.toggle("hidden",!(isHost()&&members.length===4));
    drawQr();
  }

  if(playing){
    $("#roundMini").textContent=roundText().replace("局","");
    $("#honbaLabel").textContent=room.honba;
    $("#riichiLabel").textContent=room.riichi_sticks;

    const board=$("#scoreBoard");board.innerHTML="";
    members.forEach(m=>{
      const pos=relativePos(m.seat_index);
      const card=document.createElement("article");
      card.className=`score-card table-seat pos-${pos} ${m.seat_index===room.dealer_index?"dealer":""} ${m.is_riichi?"riichi":""}`;
      card.dataset.memberId=m.id;
      card.tabIndex=0;
      card.setAttribute("role","button");
      card.setAttribute("aria-label",`${m.name} ${fmt(m.score)}点。タップで和了、長押しで順位条件`);
      card.innerHTML=`
        <button class="player-name-button" type="button" data-riichi-id="${m.id}">
          <span class="score-seat">${relativeLabel(pos)}・${m.seat_label}${m.seat_index===room.dealer_index?"・親":""}</span>
          <span class="score-name">${esc(m.name)}</span>
          ${m.is_riichi?'<span class="riichi-badge">立直</span>':""}
        </button>
        <div class="score-number">${fmt(m.score)}</div>
        <div class="tap-hint">点数欄タップ：和了 / 長押し：条件</div>`;

      card.addEventListener("click",e=>{
        if(e.target.closest(".player-name-button")) return;
        openWin(m.id);
      });
      card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openWin(m.id)}});

      card.addEventListener("pointerdown",e=>{
        if(e.target.closest(".player-name-button")) return;
        pressStart={x:e.clientX,y:e.clientY};
        pressTimer=setTimeout(()=>{pressTimer=null;openAssist(m.id)},650);
      });
      card.addEventListener("pointermove",e=>{
        if(pressTimer&&pressStart&&Math.hypot(e.clientX-pressStart.x,e.clientY-pressStart.y)>12){
          clearTimeout(pressTimer);pressTimer=null;
        }
      });
      ["pointerup","pointercancel","pointerleave"].forEach(type=>card.addEventListener(type,()=>{
        if(pressTimer){clearTimeout(pressTimer);pressTimer=null}
      }));

      board.appendChild(card);
    });
    board.querySelectorAll(".player-name-button").forEach(b=>b.addEventListener("click",e=>{
      e.stopPropagation();openRiichi(b.dataset.riichiId);
    }));
    renderEventLog();
  }

  if(between){
    $("#roundLabel").textContent="BETWEEN GAMES";
    const completed=Number(room.games_completed||0);
    const starter=Number(room.next_starting_dealer_index||0);
    const cycle=completed>0&&completed%4===0;
    $("#nextGameTitle").textContent=`${completed}半荘終了`;
    $("#nextGameMessage").textContent=`次の半荘は ${members.find(m=>m.seat_index===starter)?.name||"-"} が最初の親です。`;
    const summary=$("#sessionSummary");summary.innerHTML="";
    const totals=[...(room.session_totals||[])];
    totals.sort((a,b)=>Number(b.total)-Number(a.total)).forEach((x,i)=>{
      const d=document.createElement("div");d.className="rank-row";
      d.innerHTML=`<span class="rank-badge">${i+1}</span><strong>${esc(x.name)}</strong><strong class="${Number(x.total)>=0?"positive":"negative"}">${Number(x.total)>=0?"+":""}${fmt(x.total)}</strong>`;
      summary.appendChild(d);
    });
    $("#seatDecisionArea").classList.toggle("hidden",!cycle||!isHost());
    $("#startNextGameBtn").classList.toggle("hidden",cycle||!isHost());
    $("#shuffleResultArea").classList.add("hidden");
  }

  if(finished){
    $("#roundLabel").textContent="FINISHED";
    const rank=$("#finalRanking");rank.innerHTML="";
    const totals=[...(room.session_totals||[])].sort((a,b)=>Number(b.total)-Number(a.total));
    totals.forEach((x,i)=>{
      const d=document.createElement("div");d.className="rank-row";
      d.innerHTML=`<span class="rank-badge">${i+1}</span><strong>${esc(x.name)}</strong><strong class="${Number(x.total)>=0?"positive":"negative"}">${Number(x.total)>=0?"+":""}${fmt(x.total)}</strong>`;
      rank.appendChild(d);
    });
  }
}

function renderEventLog(){
  const box=$("#eventLog");box.innerHTML="";
  if(!events.length){box.innerHTML=`<p class="muted">まだ操作はありません。</p>`;return}
  events.forEach(ev=>{
    const d=document.createElement("div");d.className="log-entry";
    d.innerHTML=`<div><strong>${esc(ev.label)}</strong><div class="muted">${new Date(ev.created_at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}</div></div><span class="operator-chip">操作：${esc(ev.operator_name||"システム")}</span>`;
    box.appendChild(d);
  });
}

async function drawQr(){
  const url=`${location.origin}${location.pathname.replace(/room\.html$/,"index.html")}?room=${encodeURIComponent(room.room_code)}`;
  try{
    const QR=await import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm");
    await QR.toCanvas($("#qrCanvas"),url,{width:180,margin:1});
  }catch{}
}

function ensureMemberAuth(){
  if(!canOperate()) throw new Error("この端末の参加者認証がありません。SQL更新後に新しい卓へ参加し直してください。");
}
async function memberRpc(fn,args={}){
  try{
    ensureMemberAuth();
    const {error}=await sb.rpc(fn,{
      p_room_id:roomId,
      p_operator_id:session.memberId,
      p_member_key:session.memberKey,
      ...args
    });
    if(error) throw error;
    await loadAll();
    return true;
  }catch(e){showToast(e.message);return false}
}
async function hostRpc(fn,args={}){
  if(!session?.hostKey){showToast("ホストだけが操作できます。");return false}
  const {error}=await sb.rpc(fn,{p_room_id:roomId,p_host_key:session.hostKey,...args});
  if(error){showToast(error.message);return false}
  await loadAll();return true;
}

/* ---------- リーチ ---------- */
function openRiichi(memberId){
  const m=members.find(x=>x.id===memberId);if(!m)return;
  riichiTargetId=memberId;
  $("#riichiDialogTitle").textContent=`${m.name} のリーチ`;
  $("#riichiScoreText").textContent=m.is_riichi?`${fmt(m.score)}点（立直済）`:`${fmt(m.score)} → ${fmt(m.score-1000)}点`;
  $("#riichiPotText").textContent=m.is_riichi?`${room.riichi_sticks}本`:`${room.riichi_sticks} → ${room.riichi_sticks+1}本`;
  const disabled=m.is_riichi||m.score<1000;
  $("#confirmRiichiBtn").disabled=disabled;
  $("#confirmRiichiBtn").textContent=m.is_riichi?"立直済み":m.score<1000?"リーチ不可":"リーチを確定";
  $("#riichiDialogHelp").textContent=m.is_riichi?"この局ですでにリーチしています。":m.score<1000?"持ち点が1000点未満です。":"名前欄からリーチを申告しています。";
  openDialog("#riichiDialog");
}
$("#confirmRiichiBtn").addEventListener("click",async()=>{
  if(await memberRpc("mj_member_riichi",{p_target_member_id:riichiTargetId})) closeDialog("#riichiDialog");
});

/* ---------- 点数計算 ---------- */
function ceil100(n){return Math.ceil(n/100)*100}
function basicPoints(han,fu){
  han=Number(han);fu=Number(fu);
  if(han>=13)return 8000;if(han>=11)return 6000;if(han>=8)return 4000;if(han>=6)return 3000;if(han===5)return 2000;
  return Math.min(fu*Math.pow(2,han+2),2000);
}
function calcRon(han,fu,dealer){return ceil100(basicPoints(han,fu)*(dealer?6:4))}
function calcTsumo(han,fu,dealer){
  const b=basicPoints(han,fu);
  return dealer?{child:ceil100(b*2),dealer:0}:{child:ceil100(b),dealer:ceil100(b*2)};
}
function isDealer(id){return members.find(m=>m.id===id)?.seat_index===room.dealer_index}

function openWin(memberId){
  activeWinnerId=memberId;selectedLoserId=null;winMode="ron";
  $("#winDialogTitle").textContent=`${nameOf(memberId)} の和了`;
  $("#modeRonBtn").classList.add("active");$("#modeTsumoBtn").classList.remove("active");
  renderLosers();updateWinPreview();openDialog("#winDialog");
}
function renderLosers(){
  $("#loserArea").classList.toggle("hidden",winMode!=="ron");
  const box=$("#loserButtons");box.innerHTML="";
  members.filter(m=>m.id!==activeWinnerId).forEach(m=>{
    const b=document.createElement("button");b.type="button";
    b.className=`choice-btn ${m.id===selectedLoserId?"active":""}`;
    b.textContent=`${m.seat_label} ${m.name}`;
    b.addEventListener("click",()=>{selectedLoserId=m.id;renderLosers();updateWinPreview()});
    box.appendChild(b);
  });
}
function updateWinPreview(){
  const han=Number($("#winHan").value),fu=Number($("#winFu").value),dealer=isDealer(activeWinnerId),pot=room.riichi_sticks*1000;
  if(winMode==="ron"){
    const p=calcRon(han,fu,dealer)+room.honba*300;
    $("#winPreview").textContent=`ロン ${fmt(p)}点${pot?` + 供託${fmt(pot)}点`:""} / 合計受取 ${fmt(p+pot)}点`;
  }else{
    const p=calcTsumo(han,fu,dealer),hb=room.honba*100;
    $("#winPreview").textContent=dealer
      ?`${fmt(p.child+hb)}点オール${pot?` + 供託${fmt(pot)}点`:""}`
      :`子 ${fmt(p.child+hb)}点 / 親 ${fmt(p.dealer+hb)}点${pot?` + 供託${fmt(pot)}点`:""}`;
  }
}
$("#modeRonBtn").addEventListener("click",()=>{winMode="ron";$("#modeRonBtn").classList.add("active");$("#modeTsumoBtn").classList.remove("active");renderLosers();updateWinPreview()});
$("#modeTsumoBtn").addEventListener("click",()=>{winMode="tsumo";$("#modeTsumoBtn").classList.add("active");$("#modeRonBtn").classList.remove("active");renderLosers();updateWinPreview()});
$("#winHan").addEventListener("change",updateWinPreview);$("#winFu").addEventListener("change",updateWinPreview);
$("#closeWinBtn").addEventListener("click",()=>closeDialog("#winDialog"));

$("#confirmWinBtn").addEventListener("click",async()=>{
  const han=Number($("#winHan").value),fu=Number($("#winFu").value),dealer=isDealer(activeWinnerId),pot=room.riichi_sticks*1000;
  const deltas={};let label="",advance=dealer?"continue":"next";
  if(winMode==="ron"){
    if(!selectedLoserId){showToast("放銃者を選んでください。");return}
    const pay=calcRon(han,fu,dealer)+room.honba*300;
    deltas[activeWinnerId]=pay+pot;deltas[selectedLoserId]=-pay;
    label=`${nameOf(activeWinnerId)} ${han}翻${fu}符 ロン ${fmt(pay)}点`;
  }else{
    const p=calcTsumo(han,fu,dealer),hb=room.honba*100;let gain=pot;
    members.forEach(m=>{
      if(m.id===activeWinnerId)return;
      const pay=(dealer?p.child:(m.seat_index===room.dealer_index?p.dealer:p.child))+hb;
      deltas[m.id]=-pay;gain+=pay;
    });
    deltas[activeWinnerId]=gain;
    label=`${nameOf(activeWinnerId)} ${han}翻${fu}符 ツモ`;
  }
  const ok=await memberRpc("mj_member_apply_event",{
    p_event_type:winMode,p_label:label,p_deltas:deltas,p_advance:advance,p_clear_riichi:true
  });
  if(ok) closeDialog("#winDialog");
});

/* ---------- その他操作 ---------- */
$("#centerButton").addEventListener("click",()=>openDialog("#utilityDialog"));
$("#closeUtilityBtn").addEventListener("click",()=>closeDialog("#utilityDialog"));
$("#drawRenchanBtn").addEventListener("click",async()=>{if(await memberRpc("mj_member_apply_event",{p_event_type:"draw",p_label:"流局・親連荘",p_deltas:{},p_advance:"continue",p_clear_riichi:false}))closeDialog("#utilityDialog")});
$("#drawNextBtn").addEventListener("click",async()=>{if(await memberRpc("mj_member_apply_event",{p_event_type:"draw",p_label:"流局・親流れ",p_deltas:{},p_advance:"next",p_clear_riichi:false}))closeDialog("#utilityDialog")});
$("#historyBtn").addEventListener("click",()=>{closeDialog("#utilityDialog");renderEventLog();openDialog("#historyDialog")});
$("#closeHistoryBtn").addEventListener("click",()=>closeDialog("#historyDialog"));
$("#undoBtn").addEventListener("click",async()=>{if(await memberRpc("mj_member_undo_last",{}))closeDialog("#utilityDialog")});
$("#finishBtn").addEventListener("click",async()=>{if(confirm("この半荘を終了しますか？")){if(await hostRpc("mj_finish_hand",{p_reason:"manual"}))closeDialog("#utilityDialog")}});

/* ---------- チョンボ ---------- */
function updateChomboPreview(){
  const offender=members.find(m=>m.id===$("#chomboPlayer").value);
  if(!offender)return;
  const manual=$("#chomboMode").value==="manual";
  $("#chomboManualField").classList.toggle("hidden",!manual);
  if(manual){
    $("#chomboPreview").textContent="指定した合計点を他3人へできるだけ均等に配分します。";
  }else if(offender.seat_index===room.dealer_index){
    $("#chomboPreview").textContent="親の満貫払い：他3人へ4,000点ずつ（合計12,000点）";
  }else{
    $("#chomboPreview").textContent="子の満貫払い：親へ4,000点、他の子へ2,000点ずつ（合計8,000点）";
  }
}
$("#chomboBtn").addEventListener("click",()=>{
  $("#chomboPlayer").innerHTML=memberOptions();updateChomboPreview();closeDialog("#utilityDialog");openDialog("#chomboDialog");
});
$("#closeChomboBtn").addEventListener("click",()=>closeDialog("#chomboDialog"));
$("#chomboPlayer").addEventListener("change",updateChomboPreview);$("#chomboMode").addEventListener("change",updateChomboPreview);
$("#confirmChomboBtn").addEventListener("click",async()=>{
  const offender=members.find(m=>m.id===$("#chomboPlayer").value);if(!offender)return;
  const deltas={};let total=0;
  if($("#chomboMode").value==="mangan"){
    members.forEach(m=>{
      if(m.id===offender.id)return;
      const pay=offender.seat_index===room.dealer_index?4000:(m.seat_index===room.dealer_index?4000:2000);
      deltas[m.id]=pay;total+=pay;
    });
  }else{
    total=Number($("#chomboManualPoints").value);
    if(!(total>0&&total%100===0)){showToast("合計支払い点を100点単位で入力してください。");return}
    const others=members.filter(m=>m.id!==offender.id);
    let remaining=total;
    others.forEach((m,i)=>{
      const pay=i===others.length-1?remaining:Math.floor(total/others.length/100)*100;
      deltas[m.id]=pay;remaining-=pay;
    });
  }
  deltas[offender.id]=-total;
  const ok=await memberRpc("mj_member_apply_event",{p_event_type:"chombo",p_label:`${offender.name} チョンボ -${fmt(total)}点`,p_deltas:deltas,p_advance:"none",p_clear_riichi:false});
  if(ok)closeDialog("#chomboDialog");
});

/* ---------- 手動修正 ---------- */
$("#manualBtn").addEventListener("click",()=>{
  const html=memberOptions();$("#manualFrom").innerHTML=html;$("#manualTo").innerHTML=html;
  closeDialog("#utilityDialog");openDialog("#manualDialog");
});
$("#closeManualBtn").addEventListener("click",()=>closeDialog("#manualDialog"));
$("#confirmManualBtn").addEventListener("click",async()=>{
  const from=$("#manualFrom").value,to=$("#manualTo").value,p=Number($("#manualPoints").value);
  if(from===to||!(p>0)){showToast("入力を確認してください。");return}
  const ok=await memberRpc("mj_member_apply_event",{p_event_type:"manual",p_label:`${nameOf(from)} → ${nameOf(to)} ${fmt(p)}点`,p_deltas:{[from]:-p,[to]:p},p_advance:"none",p_clear_riichi:false});
  if(ok)closeDialog("#manualDialog");
});

/* ---------- 長押し順位アシスト ---------- */
const FU=[20,25,30,40,50,60,70,80,90,100,110];
function handLabel(h,f,dealer,mode){
  if(h>=13)return"役満";if(h>=11)return"三倍満";if(h>=8)return"倍満";if(h>=6)return"跳満";if(h===5)return"満貫";
  return `${h}翻${f}符`;
}
function candidates(){
  const arr=[];
  for(let h=1;h<=13;h++)for(const f of FU)arr.push({h,f});
  return arr;
}
function simulateRon(winner,target,h,f){
  const pay=calcRon(h,f,isDealer(winner.id))+room.honba*300;
  const pot=room.riichi_sticks*1000;
  return {winner:winner.score+pay+pot,target:target.score-pay,text:`${handLabel(h,f,isDealer(winner.id),"ron")} ${fmt(pay)}点直撃`};
}
function simulateTsumo(winner,target,h,f){
  const p=calcTsumo(h,f,isDealer(winner.id)),hb=room.honba*100,pot=room.riichi_sticks*1000;
  let gain=pot,targetLoss=0;
  members.forEach(m=>{
    if(m.id===winner.id)return;
    const pay=(isDealer(winner.id)?p.child:(m.seat_index===room.dealer_index?p.dealer:p.child))+hb;
    gain+=pay;if(m.id===target.id)targetLoss=pay;
  });
  const txt=isDealer(winner.id)?`${fmt(p.child+hb)}オール`:`${fmt(p.child+hb)}/${fmt(p.dealer+hb)}`;
  return {winner:winner.score+gain,target:target.score-targetLoss,text:`${handLabel(h,f,isDealer(winner.id),"tsumo")} ツモ ${txt}`};
}
function findCondition(winner,target,mode){
  const opts=[];
  for(const c of candidates()){
    const r=mode==="ron"?simulateRon(winner,target,c.h,c.f):simulateTsumo(winner,target,c.h,c.f);
    if(r.winner>r.target)opts.push({...c,...r});
  }
  opts.sort((a,b)=>{
    const pa=mode==="ron"?calcRon(a.h,a.f,isDealer(winner.id)):basicPoints(a.h,a.f);
    const pb=mode==="ron"?calcRon(b.h,b.f,isDealer(winner.id)):basicPoints(b.h,b.f);
    return pa-pb||a.h-b.h||a.f-b.f;
  });
  return opts[0]||null;
}
function openAssist(targetId){
  const viewer=me(),target=members.find(m=>m.id===targetId);
  if(!viewer||!target||viewer.id===target.id)return;
  const diff=viewer.score-target.score;
  $("#assistTitle").textContent=`${target.name} との差`;
  const ron=findCondition(viewer,target,"ron"),tsumo=findCondition(viewer,target,"tsumo");
  const ranked=[...members].sort((a,b)=>b.score-a.score);
  let html=`
    <div class="assist-gap ${diff>=0?"positive":"negative"}">${diff>=0?"+":""}${fmt(diff)}点</div>
    <p class="muted">${viewer.name} ${fmt(viewer.score)} / ${target.name} ${fmt(target.score)}</p>
    <div class="assist-section"><h3>${target.name}を逆転する目安</h3>
      <div class="condition-row"><span>直撃</span><strong>${ron?esc(ron.text):"役満でも不足"}</strong></div>
      <div class="condition-row"><span>ツモ</span><strong>${tsumo?esc(tsumo.text):"役満でも不足"}</strong></div>
    </div>
    <div class="assist-section"><h3>順位条件</h3>`;
  ranked.forEach((r,i)=>{
    if(r.id===viewer.id)return;
    const rc=findCondition(viewer,r,"ron"),tc=findCondition(viewer,r,"tsumo");
    html+=`<div class="rank-condition"><strong>${i+1}位 ${esc(r.name)} を抜く</strong><span>直撃：${rc?esc(rc.text):"役満以上"}</span><span>ツモ：${tc?esc(tc.text):"役満以上"}</span></div>`;
  });
  html+=`</div><p class="muted">本場・供託と現在の親子関係を含む目安です。同点時の順位規定は考慮していません。</p>`;
  $("#assistContent").innerHTML=html;openDialog("#assistDialog");
}
$("#closeAssistBtn").addEventListener("click",()=>closeDialog("#assistDialog"));

/* ---------- 待機・次半荘 ---------- */
$("#copyInviteBtn").addEventListener("click",async()=>{
  const url=`${location.origin}${location.pathname.replace(/room\.html$/,"index.html")}?room=${encodeURIComponent(room.room_code)}`;
  try{await navigator.clipboard.writeText(url);$("#copyInviteBtn").textContent="コピーしました";setTimeout(()=>$("#copyInviteBtn").textContent="招待リンクをコピー",1200)}
  catch{prompt("このURLを共有してください",url)}
});
$("#startGameBtn").addEventListener("click",()=>hostRpc("mj_start_room",{}));
$("#startNextGameBtn").addEventListener("click",()=>hostRpc("mj_start_next_game",{}));
$("#keepSeatsBtn").addEventListener("click",()=>hostRpc("mj_continue_same_seats",{}));
function makeShuffle(){
  const shuffled=[...members].sort(()=>Math.random()-.5);
  pendingShuffle=shuffled.map((m,i)=>({member_id:m.id,seat_index:i}));
  const box=$("#shuffleResult");box.innerHTML="";
  shuffled.forEach((m,i)=>{
    const d=document.createElement("div");d.className="member-pill";
    d.innerHTML=`<span><span class="seat">${["東","南","西","北"][i]}</span><br><strong>${esc(m.name)}</strong></span>`;
    box.appendChild(d);
  });
  $("#shuffleResultArea").classList.remove("hidden");
}
$("#shuffleSeatsBtn").addEventListener("click",makeShuffle);$("#reshuffleBtn").addEventListener("click",makeShuffle);
$("#confirmShuffleBtn").addEventListener("click",async()=>{if(pendingShuffle){await hostRpc("mj_apply_seat_shuffle",{p_seats:pendingShuffle});pendingShuffle=null}});
$("#endSessionBtn").addEventListener("click",async()=>{if(confirm("今日の対局を終了しますか？"))await hostRpc("mj_end_session",{})});

/* ---------- subscriptions ---------- */
function subscribe(){
  sb.channel(`room-${roomId}`).on("postgres_changes",{event:"*",schema:"public",table:"mj_rooms",filter:`id=eq.${roomId}`},loadAll).subscribe();
  sb.channel(`members-${roomId}`).on("postgres_changes",{event:"*",schema:"public",table:"mj_room_members",filter:`room_id=eq.${roomId}`},loadAll).subscribe();
  sb.channel(`events-${roomId}`).on("postgres_changes",{event:"*",schema:"public",table:"mj_score_events",filter:`room_id=eq.${roomId}`},loadAll).subscribe();
}
loadAll().then(subscribe).catch(e=>showToast(e.message));

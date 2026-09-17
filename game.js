import {getActiveGame,saveActiveGame,clearActiveGame,getHistory,saveHistory,uid} from "./storage.js";

let game = getActiveGame();
if(!game){ location.href="./index.html"; }

const $ = s=>document.querySelector(s);
const els = {
  board:$("#scoreBoard"), round:$("#roundLabel"), dealer:$("#dealerLabel"), honba:$("#honbaLabel"),
  riichi:$("#riichiLabel"), mini:$("#roundMini"), log:$("#eventLog"), msg:$("#gameMessage"),
  undo:$("#undoBtn"), finish:$("#finishGameBtn"), next:$("#nextRoundBtn"), addRiichi:$("#addRiichiBtn"),
  removeRiichi:$("#removeRiichiBtn"), ronWinner:$("#ronWinner"), ronLoser:$("#ronLoser"), ronPoints:$("#ronPoints"),
  ronCont:$("#ronDealerContinues"), tsumoWinner:$("#tsumoWinner"), tsumoChild:$("#tsumoChildPay"),
  tsumoDealer:$("#tsumoDealerPay"), tsumoCont:$("#tsumoDealerContinues"), manualFrom:$("#manualFrom"),
  manualTo:$("#manualTo"), manualPoints:$("#manualPoints"), drawCont:$("#drawDealerContinues")
};

function roundText(){
  const wind = game.roundIndex<4?"東":"南";
  return `${wind}${(game.roundIndex%4)+1}局`;
}
function playerOptions(){
  return game.players.map((p,i)=>`<option value="${i}">${p.seat}・${esc(p.name)}</option>`).join("");
}
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function fmt(n){ return Number(n).toLocaleString("ja-JP"); }
function snapshot(){ return JSON.parse(JSON.stringify(game)); }
function commit(label, before){
  game.events.unshift({id:uid("ev"),label,at:new Date().toISOString(),before});
  saveActiveGame(game); render();
}
function render(){
  els.round.textContent = roundText();
  els.mini.textContent = roundText().replace("局","");
  els.dealer.textContent = `親：${game.players[game.dealerIndex].name}`;
  els.honba.textContent = game.honba;
  els.riichi.textContent = game.riichiSticks;
  els.board.innerHTML = "";
  game.players.forEach((p,i)=>{
    const card=document.createElement("article");
    card.className=`score-card ${i===game.dealerIndex?"dealer":""}`;
    card.innerHTML=`<div class="score-top"><div><span class="seat">${p.seat}${i===game.dealerIndex?"・親":""}</span><div class="player-name">${esc(p.name)}</div></div></div><div class="score-value">${fmt(p.score)}</div><div class="delta">${p.score-game.startingPoints>=0?"+":""}${fmt(p.score-game.startingPoints)}</div>`;
    els.board.appendChild(card);
  });
  for(const sel of [els.ronWinner,els.ronLoser,els.tsumoWinner,els.manualFrom,els.manualTo]){
    const val=sel.value; sel.innerHTML=playerOptions(); if(val!=="") sel.value=val;
  }
  els.log.innerHTML = game.events.length ? "" : `<p class="helper">まだ操作履歴はありません。</p>`;
  game.events.slice(0,20).forEach(ev=>{
    const d=document.createElement("div"); d.className="log-item"; d.innerHTML=`<strong>${esc(ev.label)}</strong><div class="helper">${new Date(ev.at).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}</div>`;
    els.log.appendChild(d);
  });
}
function nextRound(dealerContinues){
  if(dealerContinues){ game.honba += 1; return; }
  game.honba = 0; game.roundIndex += 1; game.dealerIndex = (game.dealerIndex+1)%4;
}
function validPositive(v){ return Number.isFinite(v)&&v>0&&v%100===0; }

document.querySelectorAll(".seg-btn").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".seg-btn").forEach(x=>x.classList.toggle("active",x===btn));
  document.querySelectorAll(".event-panel").forEach(x=>x.classList.add("hidden"));
  document.querySelector(`#${btn.dataset.type}Panel`).classList.remove("hidden");
  els.msg.textContent="";
}));

$("#confirmRon").addEventListener("click",()=>{
  const w=+els.ronWinner.value,l=+els.ronLoser.value,p=+els.ronPoints.value;
  if(w===l){ els.msg.textContent="和了者と放銃者は別にしてください。"; return; }
  if(!validPositive(p)){ els.msg.textContent="点数を100点単位で入力してください。"; return; }
  const before=snapshot();
  game.players[w].score += p + game.riichiSticks*1000;
  game.players[l].score -= p;
  const sticks=game.riichiSticks; game.riichiSticks=0;
  const cont=els.ronCont.checked || w===game.dealerIndex;
  nextRound(cont);
  commit(`${game.players[w].name} ロン +${fmt(p)}${sticks?`（供託${sticks}本）`:""}`,before);
});
$("#confirmTsumo").addEventListener("click",()=>{
  const w=+els.tsumoWinner.value, child=+els.tsumoChild.value, dealerPay=+els.tsumoDealer.value;
  const isDealer=w===game.dealerIndex;
  if(!validPositive(child) || (!isDealer&&!validPositive(dealerPay))){ els.msg.textContent="支払い点を100点単位で入力してください。"; return; }
  const before=snapshot(); let gain=game.riichiSticks*1000;
  game.players.forEach((p,i)=>{
    if(i===w) return;
    const pay = isDealer ? child : (i===game.dealerIndex ? dealerPay : child);
    p.score -= pay; gain += pay;
  });
  game.players[w].score += gain; const sticks=game.riichiSticks; game.riichiSticks=0;
  const cont=els.tsumoCont.checked || isDealer; nextRound(cont);
  commit(`${game.players[w].name} ツモ +${fmt(gain)}${sticks?`（供託${sticks}本）`:""}`,before);
});
$("#confirmManual").addEventListener("click",()=>{
  const f=+els.manualFrom.value,t=+els.manualTo.value,p=+els.manualPoints.value;
  if(f===t){ els.msg.textContent="支払う人と受け取る人は別にしてください。"; return; }
  if(!validPositive(p)){ els.msg.textContent="点数を100点単位で入力してください。"; return; }
  const before=snapshot(); game.players[f].score-=p; game.players[t].score+=p;
  commit(`${game.players[f].name} → ${game.players[t].name} ${fmt(p)}`,before);
});
$("#confirmDraw").addEventListener("click",()=>{
  const before=snapshot(); nextRound(els.drawCont.checked); commit(`流局${els.drawCont.checked?"・親連荘":""}`,before);
});
els.addRiichi.addEventListener("click",()=>{
  const idx=prompt(`リーチした人の番号を入力\n${game.players.map((p,i)=>`${i+1}: ${p.name}`).join("\n")}`);
  const i=Number(idx)-1; if(i<0||i>3||!Number.isInteger(i)) return;
  if(game.players[i].score<1000){ els.msg.textContent="持ち点が1000点未満です。"; return; }
  const before=snapshot(); game.players[i].score-=1000; game.riichiSticks+=1; commit(`${game.players[i].name} リーチ -1,000`,before);
});
els.removeRiichi.addEventListener("click",()=>{
  if(game.riichiSticks<=0) return;
  const before=snapshot(); game.riichiSticks-=1; commit(`供託を1本減らす`,before);
});
els.next.addEventListener("click",()=>{ const before=snapshot(); nextRound(false); commit(`手動で次局へ`,before); });
els.undo.addEventListener("click",()=>{
  const ev=game.events[0]; if(!ev){ els.msg.textContent="戻せる操作がありません。"; return; }
  game=ev.before; saveActiveGame(game); render();
});
els.finish.addEventListener("click",()=>{
  if(!confirm("この半荘を終了して戦績に保存しますか？")) return;
  const finished={...game,finishedAt:new Date().toISOString()};
  const hist=getHistory(); hist.unshift(finished); saveHistory(hist); clearActiveGame(); location.href="./history.html";
});
render();

import {getPlayers,savePlayers,getActiveGame,saveActiveGame,uid} from "./storage.js";

const els = {
  list: document.querySelector("#playerList"),
  add: document.querySelector("#addPlayerBtn"),
  dialog: document.querySelector("#playerDialog"),
  form: document.querySelector("#playerForm"),
  name: document.querySelector("#playerName"),
  dmsg: document.querySelector("#playerDialogMessage"),
  count: document.querySelector("#selectedCount"),
  start: document.querySelector("#startGameBtn"),
  startPts: document.querySelector("#startingPoints"),
  msg: document.querySelector("#homeMessage"),
  activeCard: document.querySelector("#activeGameCard"),
  activeText: document.querySelector("#activeGameText"),
};
let selected = new Set();

function render(){
  const players = getPlayers();
  els.list.innerHTML = "";
  if(!players.length){
    els.list.innerHTML = `<p class="helper">まだメンバーがいません。「＋ 追加」から登録してください。</p>`;
  }
  players.forEach(p=>{
    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = `
      <label>
        <input type="checkbox" ${selected.has(p.id)?"checked":""}>
        <span class="player-avatar">${escapeHtml(p.name.slice(0,1))}</span>
        <strong>${escapeHtml(p.name)}</strong>
      </label>
      <button class="icon-btn" type="button" aria-label="${escapeHtml(p.name)}を削除">×</button>`;
    const cb = row.querySelector("input");
    cb.addEventListener("change",()=>{
      if(cb.checked){
        if(selected.size>=4){ cb.checked=false; return; }
        selected.add(p.id);
      }else selected.delete(p.id);
      updateCount();
    });
    row.querySelector("button").addEventListener("click",()=>{
      if(!confirm(`${p.name}を削除しますか？`)) return;
      selected.delete(p.id);
      savePlayers(players.filter(x=>x.id!==p.id));
      render();
    });
    els.list.appendChild(row);
  });
  updateCount();

  const active = getActiveGame();
  els.activeCard.classList.toggle("hidden", !active);
  if(active){
    els.activeText.textContent = `${roundText(active)}・${active.players.map(x=>x.name).join(" / ")}`;
  }
}

function updateCount(){
  els.count.textContent = `${selected.size} / 4人選択`;
  els.start.disabled = selected.size !== 4 || !!getActiveGame();
}
function roundText(g){
  const wind = g.roundIndex < 4 ? "東" : "南";
  return `${wind}${(g.roundIndex%4)+1}局`;
}
function escapeHtml(s){ return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

els.add.addEventListener("click",()=>{
  els.name.value=""; els.dmsg.textContent=""; els.dialog.showModal(); setTimeout(()=>els.name.focus(),0);
});
els.form.addEventListener("submit",(e)=>{
  e.preventDefault();
  const name = els.name.value.trim();
  if(!name){ els.dmsg.textContent="名前を入力してください。"; return; }
  const players = getPlayers();
  if(players.some(p=>p.name===name)){ els.dmsg.textContent="同じ名前が登録済みです。"; return; }
  players.push({id:uid("player"),name,createdAt:new Date().toISOString()});
  savePlayers(players); els.dialog.close(); render();
});
els.start.addEventListener("click",()=>{
  const players = getPlayers().filter(p=>selected.has(p.id));
  if(players.length!==4) return;
  const start = Number(els.startPts.value);
  const seats = ["東","南","西","北"];
  const game = {
    id: uid("game"),
    startedAt: new Date().toISOString(),
    roundIndex: 0, honba: 0, riichiSticks: 0, dealerIndex: 0,
    startingPoints: start,
    players: players.map((p,i)=>({...p,seat:seats[i],score:start})),
    events: []
  };
  saveActiveGame(game);
  location.href="./game.html";
});
render();

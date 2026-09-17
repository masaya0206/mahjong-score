import { requireSupabase, esc } from "./supabase.js";
const sb=requireSupabase();
const $=s=>document.querySelector(s);
const today=new Date().toISOString().slice(0,10);
const fmt=n=>Number(n).toLocaleString("ja-JP");

async function run(){
  const {data,error}=await sb.from("mj_games").select("*").order("finished_at",{ascending:false}).limit(100);
  if(error) throw error;
  const list=$("#historyList"), todayBox=$("#todaySummary");
  list.innerHTML="";todayBox.innerHTML="";
  if(!data.length){
    list.innerHTML=`<p class="muted">まだ終了した半荘がありません。</p>`;
    todayBox.innerHTML=`<p class="muted">今日の記録はまだありません。</p>`;
    return;
  }
  const todays=data.filter(g=>(g.finished_at||"").slice(0,10)===today);
  const agg=new Map();
  todays.forEach(g=>{
    const results=g.results||[];
    [...results].sort((a,b)=>b.score-a.score).forEach((r,i)=>{
      const a=agg.get(r.name)||{name:r.name,games:0,total:0,ranks:[0,0,0,0]};
      a.games++;a.total+=r.score-g.starting_points;a.ranks[i]++;agg.set(r.name,a);
    });
  });
  if(!todays.length) todayBox.innerHTML=`<p class="muted">今日の記録はまだありません。</p>`;
  [...agg.values()].sort((a,b)=>b.total-a.total).forEach(a=>{
    const d=document.createElement("div");d.className="rank-row";
    d.innerHTML=`<span>${a.games}半荘</span><strong>${esc(a.name)}</strong><strong class="${a.total>=0?"positive":"negative"}">${a.total>=0?"+":""}${fmt(a.total)}</strong>`;
    todayBox.appendChild(d);
  });
  data.forEach(g=>{
    const d=document.createElement("div");d.className="list-item";
    const rs=[...(g.results||[])].sort((a,b)=>b.score-a.score);
    d.innerHTML=`<strong>${new Date(g.finished_at).toLocaleString("ja-JP")}</strong>${rs.map((r,i)=>`<div class="rank-row"><span class="rank-badge">${i+1}</span><span>${esc(r.name)}</span><strong>${fmt(r.score)}</strong></div>`).join("")}`;
    list.appendChild(d);
  });
}
run().catch(e=>{ $("#historyList").innerHTML=`<p class="message">${esc(e.message)}</p>`; });

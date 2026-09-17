// v1はGitHubへアップロードした直後から画面確認できるよう、
// Supabase接続前はブラウザ内(localStorage)で動作します。
// Supabase接続後はこの層をDB版に差し替えます。

const K = {
  players: "mj_players_v1",
  active: "mj_active_game_v1",
  history: "mj_history_v1",
};

export function uid(prefix="id"){
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
}
export function getPlayers(){
  return JSON.parse(localStorage.getItem(K.players) || "[]");
}
export function savePlayers(v){ localStorage.setItem(K.players, JSON.stringify(v)); }
export function getActiveGame(){
  return JSON.parse(localStorage.getItem(K.active) || "null");
}
export function saveActiveGame(v){ localStorage.setItem(K.active, JSON.stringify(v)); }
export function clearActiveGame(){ localStorage.removeItem(K.active); }
export function getHistory(){
  return JSON.parse(localStorage.getItem(K.history) || "[]");
}
export function saveHistory(v){ localStorage.setItem(K.history, JSON.stringify(v)); }

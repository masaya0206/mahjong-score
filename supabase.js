import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_") &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.includes("YOUR_");

export const supabase=isConfigured?createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
}):null;

export function requireSupabase(){
  if(!isConfigured) throw new Error("config.js に Supabase URL と publishable key を設定してください。");
  return supabase;
}

export function rememberRoom(roomId,roomCode){
  const all=JSON.parse(localStorage.getItem("mj_recent_rooms_v2")||"[]");
  const next=[{roomId,roomCode,savedAt:new Date().toISOString()},...all.filter(x=>x.roomId!==roomId)].slice(0,12);
  localStorage.setItem("mj_recent_rooms_v2",JSON.stringify(next));
}
export function recentRooms(){
  return JSON.parse(localStorage.getItem("mj_recent_rooms_v2")||"[]");
}
export function roomSession(roomId){
  return recentRooms().find(x=>x.roomId===roomId)||null;
}
export function esc(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
